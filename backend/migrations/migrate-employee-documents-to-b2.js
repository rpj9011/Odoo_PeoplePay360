// backend/migrations/migrate-employee-documents-to-b2.js
//
// Phase 1 migration: copy EmployeeDocument files from GridFS (policyFiles bucket)
// to Backblaze B2 under the hr-docs/{employeeId}/{documentType}/{uuid}.pdf convention.
//
// This script is ADDITIVE and IDEMPOTENT:
//   • Records that already have a storageKey are skipped.
//   • fileRef / fileName fields are never modified.
//   • On any per-record failure, execution continues — the record is logged and
//     included in the "failed" summary.
//
// Usage:
//   # Always dry-run first:
//   node backend/migrations/migrate-employee-documents-to-b2.js --dry-run
//
//   # Real run (only after dry-run confirms everything looks right):
//   node backend/migrations/migrate-employee-documents-to-b2.js
//
// Required env vars (from backend/.env):
//   MONGODB_URI  (or MONGO_URI)
//   B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose        = require('mongoose');
const { Readable }    = require('stream');
const { PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const connectDB               = require('../db');
const { getR2Client, BUCKET_NAME } = require('../config/r2');
const buildDocumentStorageKey = require('../utils/buildDocumentStorageKey');
const EmployeeDocument        = require('../models/EmployeeDocument');

// ── Configuration ─────────────────────────────────────────────────────────────
const BATCH_SIZE       = 20;
const BATCH_DELAY_MS   = 500; // ms to pause between batches

const isDryRun = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stream a GridFS file into a Buffer.
 * @param {import('mongodb').GridFSBucket} bucket
 * @param {import('mongoose').Types.ObjectId} fileId
 * @returns {Promise<Buffer>}
 */
function streamGridFSToBuffer(bucket, fileId) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const stream = bucket.openDownloadStream(fileId);

        stream.on('data',  chunk  => chunks.push(chunk));
        stream.on('end',   ()     => resolve(Buffer.concat(chunks)));
        stream.on('error', err    => reject(err));
    });
}

/**
 * Verify that an object landed in B2 with the expected byte-length.
 * @returns {Promise<number>} The confirmed ContentLength from B2.
 */
async function verifyB2Object(client, bucket, key, expectedSize) {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const actual = head.ContentLength;
    if (actual !== expectedSize) {
        throw new Error(
            `Size mismatch for key "${key}": expected ${expectedSize} bytes, got ${actual} bytes.`
        );
    }
    return actual;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('=================================================================');
    console.log(' migrate-employee-documents-to-b2.js');
    console.log(isDryRun ? ' MODE: DRY-RUN (no writes will occur)' : ' MODE: LIVE RUN');
    console.log('=================================================================\n');

    // ── Connect ───────────────────────────────────────────────────────────────
    await connectDB();
    console.log('✅ MongoDB connected.\n');

    const policyBucket = connectDB.getPolicyBucket();
    const r2Client     = getR2Client();
    const bucketName   = BUCKET_NAME();

    // ── Count work ────────────────────────────────────────────────────────────
    const totalRecords = await EmployeeDocument.countDocuments({});
    const toMigrate    = await EmployeeDocument.countDocuments({
        fileRef:    { $ne: null },
        storageKey: null,
    });
    const alreadyDone  = await EmployeeDocument.countDocuments({ storageKey: { $ne: null } });
    const noFileRef    = await EmployeeDocument.countDocuments({ fileRef: null });

    console.log(`Total EmployeeDocument records : ${totalRecords}`);
    console.log(`  Already have storageKey       : ${alreadyDone} (will be skipped)`);
    console.log(`  fileRef is null               : ${noFileRef}  (no GridFS file to migrate)`);
    console.log(`  To migrate                    : ${toMigrate}\n`);

    if (toMigrate === 0) {
        console.log('Nothing to do — all eligible records already migrated.');
        mongoose.connection.removeAllListeners('disconnected');
        await mongoose.disconnect();
        return;
    }

    // ── Iterate in batches ────────────────────────────────────────────────────
    let succeeded = 0;
    let failed    = 0;
    let skipped   = 0;
    const failedIds = [];

    const cursor = EmployeeDocument
        .find({ fileRef: { $ne: null }, storageKey: null })
        .select('_id employeeId documentType fileRef fileName')
        .lean()
        .cursor();

    let batch = [];

    async function processBatch(records) {
        for (const doc of records) {
            const label = `[EmployeeDocument ${doc._id}]`;
            try {
                // ── Build key ─────────────────────────────────────────────
                const empId   = doc.employeeId?.toString();
                const docType = (doc.documentType || 'unknown').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
                const ext     = '.pdf'; // uploadEmployeeDocumentGridFS enforces PDF

                if (!empId) {
                    console.warn(`${label} SKIP — employeeId is null/missing.`);
                    skipped++;
                    continue;
                }

                const storageKey = buildDocumentStorageKey({
                    category:   'hrDocs',
                    employeeId: empId,
                    subFolder:  docType,
                    ext,
                });

                if (isDryRun) {
                    console.log(`${label} DRY-RUN → would upload to: ${storageKey}`);
                    skipped++;
                    continue;
                }

                // ── Stream from GridFS ────────────────────────────────────
                const buffer = await streamGridFSToBuffer(policyBucket, doc.fileRef);
                const size   = buffer.length;

                // ── Upload to B2 ──────────────────────────────────────────
                await r2Client.send(new PutObjectCommand({
                    Bucket:      bucketName,
                    Key:         storageKey,
                    Body:        buffer,
                    ContentType: 'application/pdf',
                    ContentLength: size,
                    Metadata: {
                        'original-filename': doc.fileName || '',
                        'employee-id':       empId,
                        'document-type':     doc.documentType || '',
                        'migrated-from':     'gridfs-policyFiles',
                        'source-record-id':  doc._id.toString(),
                    },
                }));

                // ── Verify ────────────────────────────────────────────────
                await verifyB2Object(r2Client, bucketName, storageKey, size);

                // ── Persist storageKey ────────────────────────────────────
                await EmployeeDocument.updateOne(
                    { _id: doc._id },
                    { $set: { storageKey } }
                );

                console.log(`${label} ✅ Migrated ${size} bytes → ${storageKey}`);
                succeeded++;

            } catch (err) {
                console.error(`${label} ❌ FAILED: ${err.message}`);
                failed++;
                failedIds.push({ id: doc._id.toString(), error: err.message });
            }
        }
    }

    for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= BATCH_SIZE) {
            await processBatch(batch);
            batch = [];
            await sleep(BATCH_DELAY_MS);
        }
    }
    if (batch.length > 0) {
        await processBatch(batch);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n=================================================================');
    console.log(' MIGRATION SUMMARY — EmployeeDocument → B2 hr-docs/');
    console.log('=================================================================');
    console.log(`  Total eligible  : ${toMigrate}`);
    if (isDryRun) {
        console.log(`  Dry-run logged  : ${skipped}`);
    } else {
        console.log(`  Succeeded       : ${succeeded}`);
        console.log(`  Failed          : ${failed}`);
        console.log(`  Skipped (no emp): ${skipped}`);
    }
    if (failedIds.length > 0) {
        console.log('\n  Failed record IDs:');
        failedIds.forEach(f => console.log(`    ${f.id} — ${f.error}`));
    }
    console.log('=================================================================\n');

    // Suppress the "MongoDB disconnected" warning that Mongoose emits when we
    // intentionally close the connection — it is not an error in this context.
    mongoose.connection.removeAllListeners('disconnected');
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
