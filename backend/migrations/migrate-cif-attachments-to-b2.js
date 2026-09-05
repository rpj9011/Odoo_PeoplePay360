// backend/migrations/migrate-cif-attachments-to-b2.js
//
// Phase 1 migration: copy CIFAttachment files from GridFS (cifAttachments bucket)
// to Backblaze B2 under the cif-attachments/{employeeId}/{cifId}/{uuid}.ext convention.
//
// IMPORTANT: CIFAttachment has no direct employeeId field.
// The employeeId is on the parent CIF document (modules/cif/cif.model.js).
// This script JOINs through CIF to obtain the employeeId for key construction.
// If the parent CIF document cannot be found for an attachment, the record is
// SKIPPED (not failed) — this can happen for archived/soft-deleted CIF records.
// The skip is logged so you can decide whether to handle those separately.
//
// This script is ADDITIVE and IDEMPOTENT:
//   • Records that already have a storageKey are skipped.
//   • fileId / fileName fields are never modified.
//   • On any per-record failure, execution continues.
//
// Usage:
//   # Always dry-run first:
//   node backend/migrations/migrate-cif-attachments-to-b2.js --dry-run
//
//   # Real run:
//   node backend/migrations/migrate-cif-attachments-to-b2.js
//
// Required env vars (from backend/.env):
//   MONGODB_URI  (or MONGO_URI)
//   B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose     = require('mongoose');
const { PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

const connectDB               = require('../db');
const { getR2Client, BUCKET_NAME } = require('../config/r2');
const buildDocumentStorageKey = require('../utils/buildDocumentStorageKey');

// Models — CIFAttachment lives under modules/cif
const CIFAttachment = require('../modules/cif/cifAttachment.model');
const CIF           = require('../modules/cif/cif.model');

// ── Configuration ─────────────────────────────────────────────────────────────
const BATCH_SIZE     = 20;
const BATCH_DELAY_MS = 500;

const isDryRun = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Stream a GridFS file into a Buffer.
 * Uses the cifAttachments GridFSBucket (initialised in uploadCIFAttachmentGridFS.js).
 */
function streamGridFSToBuffer(bucket, fileId) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const stream = bucket.openDownloadStream(fileId);

        stream.on('data',  chunk => chunks.push(chunk));
        stream.on('end',   ()    => resolve(Buffer.concat(chunks)));
        stream.on('error', err   => reject(err));
    });
}

/**
 * Lazily build a GridFSBucket for the cifAttachments bucket.
 * uploadCIFAttachmentGridFS.getBucket() initialises it lazily too, but
 * we replicate it here to avoid depending on a middleware at migration time.
 */
let _cifBucket = null;
function getCifBucket() {
    if (_cifBucket) return _cifBucket;
    if (!mongoose.connection || !mongoose.connection.db) {
        throw new Error('MongoDB not connected yet.');
    }
    _cifBucket = new mongoose.mongo.GridFSBucket(
        mongoose.connection.db,
        { bucketName: 'cifAttachments' }
    );
    return _cifBucket;
}

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

/**
 * Derive a safe file extension from the stored MIME type or filename.
 * Falls back to '.bin' if neither is recognisable.
 */
function deriveExtension(mimeType, fileName) {
    const MIME_TO_EXT = {
        'application/pdf':    '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'image/jpeg':         '.jpg',
        'image/jpg':          '.jpg',
        'image/png':          '.png',
        'image/gif':          '.gif',
        'image/webp':         '.webp',
    };

    if (mimeType && MIME_TO_EXT[mimeType.toLowerCase()]) {
        return MIME_TO_EXT[mimeType.toLowerCase()];
    }

    // Fall back to extension from fileName
    if (fileName) {
        const idx = fileName.lastIndexOf('.');
        if (idx !== -1) {
            return fileName.slice(idx).toLowerCase();
        }
    }

    return '.bin';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('=================================================================');
    console.log(' migrate-cif-attachments-to-b2.js');
    console.log(isDryRun ? ' MODE: DRY-RUN (no writes will occur)' : ' MODE: LIVE RUN');
    console.log('=================================================================\n');

    await connectDB();
    console.log('✅ MongoDB connected.\n');

    const r2Client   = getR2Client();
    const bucketName = BUCKET_NAME();

    // ── Count work ────────────────────────────────────────────────────────────
    const totalRecords = await CIFAttachment.countDocuments({});
    const toMigrate    = await CIFAttachment.countDocuments({ storageKey: null });
    const alreadyDone  = await CIFAttachment.countDocuments({ storageKey: { $ne: null } });

    console.log(`Total CIFAttachment records    : ${totalRecords}`);
    console.log(`  Already have storageKey       : ${alreadyDone} (will be skipped)`);
    console.log(`  To migrate                    : ${toMigrate}\n`);

    if (toMigrate === 0) {
        console.log('Nothing to do — all eligible records already migrated.');
        mongoose.connection.removeAllListeners('disconnected');
        await mongoose.disconnect();
        return;
    }

    // ── Pre-build a CIF lookup map (cifId → employeeId) for the batch ─────────
    // Rather than hitting CIF for every attachment, we load all CIF records we
    // need upfront.  For very large datasets this approach stays within a single
    // aggregation round-trip.
    const attachmentCifIds = await CIFAttachment
        .find({ storageKey: null })
        .distinct('cifId');

    const cifDocs = await CIF
        .find({ _id: { $in: attachmentCifIds } })
        .select('_id employeeId')
        .lean();

    const cifToEmployeeId = new Map(
        cifDocs.map(c => [c._id.toString(), c.employeeId?.toString()])
    );

    console.log(
        `Loaded ${cifDocs.length} parent CIF records for ${attachmentCifIds.length} distinct cifIds.\n`
    );

    // ── Iterate in batches ────────────────────────────────────────────────────
    let succeeded = 0;
    let failed    = 0;
    let skipped   = 0;
    const failedIds  = [];
    const skippedIds = [];

    const cursor = CIFAttachment
        .find({ storageKey: null })
        .select('_id cifId fileId fileName originalName fileType fileSize')
        .lean()
        .cursor();

    let batch = [];

    async function processBatch(records) {
        for (const attachment of records) {
            const label = `[CIFAttachment ${attachment._id}]`;
            try {
                // ── Resolve employeeId from parent CIF ────────────────────
                const employeeId = cifToEmployeeId.get(attachment.cifId?.toString());
                if (!employeeId) {
                    const msg = `Parent CIF not found for cifId=${attachment.cifId}`;
                    console.warn(`${label} SKIP — ${msg}`);
                    skipped++;
                    skippedIds.push({ id: attachment._id.toString(), reason: msg });
                    continue;
                }

                const cifId = attachment.cifId.toString();
                const ext   = deriveExtension(attachment.fileType, attachment.fileName);

                const storageKey = buildDocumentStorageKey({
                    category:   'cifAttachments',
                    employeeId,
                    subFolder:  cifId,
                    ext,
                });

                if (isDryRun) {
                    console.log(
                        `${label} DRY-RUN → employeeId=${employeeId}, cifId=${cifId}, ` +
                        `ext=${ext}, key=${storageKey}`
                    );
                    skipped++;
                    continue;
                }

                // ── Stream from GridFS ────────────────────────────────────
                const cifBucket = getCifBucket();
                const buffer    = await streamGridFSToBuffer(cifBucket, attachment.fileId);
                const size      = buffer.length;

                // ── Upload to B2 ──────────────────────────────────────────
                await r2Client.send(new PutObjectCommand({
                    Bucket:        bucketName,
                    Key:           storageKey,
                    Body:          buffer,
                    ContentType:   attachment.fileType || 'application/octet-stream',
                    ContentLength: size,
                    Metadata: {
                        'original-filename': attachment.originalName || '',
                        'employee-id':       employeeId,
                        'cif-id':            cifId,
                        'migrated-from':     'gridfs-cifAttachments',
                        'source-record-id':  attachment._id.toString(),
                    },
                }));

                // ── Verify ────────────────────────────────────────────────
                await verifyB2Object(r2Client, bucketName, storageKey, size);

                // ── Persist storageKey ────────────────────────────────────
                await CIFAttachment.updateOne(
                    { _id: attachment._id },
                    { $set: { storageKey } }
                );

                console.log(`${label} ✅ Migrated ${size} bytes → ${storageKey}`);
                succeeded++;

            } catch (err) {
                console.error(`${label} ❌ FAILED: ${err.message}`);
                failed++;
                failedIds.push({ id: attachment._id.toString(), error: err.message });
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
    console.log(' MIGRATION SUMMARY — CIFAttachment → B2 cif-attachments/');
    console.log('=================================================================');
    console.log(`  Total eligible  : ${toMigrate}`);
    if (isDryRun) {
        console.log(`  Dry-run logged  : ${skipped}`);
    } else {
        console.log(`  Succeeded       : ${succeeded}`);
        console.log(`  Failed          : ${failed}`);
        console.log(`  Skipped         : ${skipped}`);
    }
    if (skippedIds.length > 0) {
        console.log('\n  Skipped record IDs (parent CIF not found):');
        skippedIds.forEach(s => console.log(`    ${s.id} — ${s.reason}`));
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
