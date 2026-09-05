// backend/migrations/migrate-policies-to-b2.js
//
// Phase 1 migration: copy Policy files from GridFS (policyFiles bucket)
// to Backblaze B2 under the policies/{policyId}/{uuid}.pdf convention.
//
// Policies are NOT employee-scoped.  The policyId (MongoDB _id.toString())
// is used as the sub-folder so every policy's files stay namespaced together.
//
// This script is ADDITIVE and IDEMPOTENT:
//   • Records that already have a storageKey are skipped.
//   • fileId / fileName / fileUrl fields are never modified.
//   • On any per-record failure, execution continues.
//
// Usage:
//   # Always dry-run first:
//   node backend/migrations/migrate-policies-to-b2.js --dry-run
//
//   # Real run:
//   node backend/migrations/migrate-policies-to-b2.js
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
const Policy                  = require('../models/Policy');

// ── Configuration ─────────────────────────────────────────────────────────────
const BATCH_SIZE     = 20;
const BATCH_DELAY_MS = 500;

const isDryRun = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function streamGridFSToBuffer(bucket, fileId) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const stream = bucket.openDownloadStream(fileId);

        stream.on('data',  chunk => chunks.push(chunk));
        stream.on('end',   ()    => resolve(Buffer.concat(chunks)));
        stream.on('error', err   => reject(err));
    });
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('=================================================================');
    console.log(' migrate-policies-to-b2.js');
    console.log(isDryRun ? ' MODE: DRY-RUN (no writes will occur)' : ' MODE: LIVE RUN');
    console.log('=================================================================\n');

    await connectDB();
    console.log('✅ MongoDB connected.\n');

    const policyBucket = connectDB.getPolicyBucket();
    const r2Client     = getR2Client();
    const bucketName   = BUCKET_NAME();

    // ── Count work ────────────────────────────────────────────────────────────
    const totalRecords = await Policy.countDocuments({});
    const toMigrate    = await Policy.countDocuments({
        fileId:     { $ne: null },
        storageKey: null,
    });
    const alreadyDone = await Policy.countDocuments({ storageKey: { $ne: null } });
    const noFileId    = await Policy.countDocuments({ fileId: null });

    console.log(`Total Policy records            : ${totalRecords}`);
    console.log(`  Already have storageKey        : ${alreadyDone} (will be skipped)`);
    console.log(`  fileId is null                 : ${noFileId}  (no GridFS file to migrate)`);
    console.log(`  To migrate                     : ${toMigrate}\n`);

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

    const cursor = Policy
        .find({ fileId: { $ne: null }, storageKey: null })
        .select('_id fileId fileName fileSize name version')
        .lean()
        .cursor();

    let batch = [];

    async function processBatch(records) {
        for (const policy of records) {
            const label = `[Policy ${policy._id}]`;
            try {
                const policyId   = policy._id.toString();
                const storageKey = buildDocumentStorageKey({
                    category:  'policies',
                    subFolder: policyId,
                    ext:       '.pdf', // uploadPolicyGridFS enforces PDF only
                });

                if (isDryRun) {
                    console.log(
                        `${label} DRY-RUN → name="${policy.name}" v${policy.version}, ` +
                        `key=${storageKey}`
                    );
                    skipped++;
                    continue;
                }

                // ── Stream from GridFS ────────────────────────────────────
                const buffer = await streamGridFSToBuffer(policyBucket, policy.fileId);
                const size   = buffer.length;

                // ── Cross-check with stored fileSize if available ─────────
                if (policy.fileSize && policy.fileSize !== size) {
                    console.warn(
                        `${label} ⚠️  GridFS byte count (${size}) differs from ` +
                        `stored fileSize field (${policy.fileSize}). Proceeding with actual bytes.`
                    );
                }

                // ── Upload to B2 ──────────────────────────────────────────
                await r2Client.send(new PutObjectCommand({
                    Bucket:        bucketName,
                    Key:           storageKey,
                    Body:          buffer,
                    ContentType:   'application/pdf',
                    ContentLength: size,
                    Metadata: {
                        'original-filename': policy.fileName || '',
                        'policy-name':       policy.name || '',
                        'policy-version':    policy.version || '',
                        'migrated-from':     'gridfs-policyFiles',
                        'source-record-id':  policyId,
                    },
                }));

                // ── Verify ────────────────────────────────────────────────
                await verifyB2Object(r2Client, bucketName, storageKey, size);

                // ── Persist storageKey ────────────────────────────────────
                await Policy.updateOne(
                    { _id: policy._id },
                    { $set: { storageKey } }
                );

                console.log(`${label} ✅ Migrated ${size} bytes → ${storageKey}`);
                succeeded++;

            } catch (err) {
                console.error(`${label} ❌ FAILED: ${err.message}`);
                failed++;
                failedIds.push({ id: policy._id.toString(), error: err.message });
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
    console.log(' MIGRATION SUMMARY — Policy → B2 policies/');
    console.log('=================================================================');
    console.log(`  Total eligible  : ${toMigrate}`);
    if (isDryRun) {
        console.log(`  Dry-run logged  : ${skipped}`);
    } else {
        console.log(`  Succeeded       : ${succeeded}`);
        console.log(`  Failed          : ${failed}`);
        console.log(`  Skipped         : ${skipped}`);
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
