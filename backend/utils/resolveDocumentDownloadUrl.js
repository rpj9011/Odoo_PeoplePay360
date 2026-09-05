// backend/utils/resolveDocumentDownloadUrl.js
//
// Pure resolver — no Express req/res involved; fully testable and reusable
// across all three document controllers (EmployeeDocument, CIFAttachment, Policy).
//
// Logic:
//   • storageKey present (non-null, non-empty string)
//       → generate a short-lived presigned GET URL from B2 via GetObjectCommand
//         (exact same pattern as kycController.js viewDocument)
//       → returns { source: 'b2', presignedGetUrl, expiresInSeconds }
//
//   • storageKey null/absent
//       → returns { source: 'gridfs' }
//         The calling controller must then fall back to its existing GridFS
//         streaming code, completely unchanged from the pre-Phase-2 behaviour.
//
// SAFETY CONTRACT:
//   Any record with storageKey === null (i.e. not yet migrated) will always
//   receive { source: 'gridfs' } and the controller's GridFS path is followed
//   exactly as before.  Only records where storageKey is a non-empty string
//   (i.e. already migrated to B2) receive a presigned URL.  The two code paths
//   are mutually exclusive and the fallback path is entirely unchanged.
'use strict';

const { GetObjectCommand }  = require('@aws-sdk/client-s3');
const { getSignedUrl }      = require('@aws-sdk/s3-request-presigner');
const { getR2Client, BUCKET_NAME } = require('../config/r2');

const DEFAULT_EXPIRY_SECONDS = 5 * 60; // 5 minutes — same as kycController.js

/**
 * Resolve a download URL for a stored document.
 *
 * @param {object}  params
 * @param {string}  params.category       - category key from DOCUMENT_CATEGORIES (informational, not used for routing)
 * @param {string|null} params.storageKey - B2 object key, or null if file is still in GridFS
 * @param {number}  [params.expirySeconds=300] - Presigned URL lifetime in seconds
 *
 * @returns {Promise<{ source: 'b2', presignedGetUrl: string, expiresInSeconds: number }
 *                  | { source: 'gridfs' }>}
 */
async function resolveDocumentDownloadUrl({ category, storageKey, expirySeconds = DEFAULT_EXPIRY_SECONDS }) {
    // ── GridFS fallback sentinel ──────────────────────────────────────────────
    // A null or empty storageKey means the record has NOT been migrated to B2.
    // Return the sentinel so the controller streams from GridFS as it did before.
    if (!storageKey) {
        return { source: 'gridfs' };
    }

    // ── B2 presigned URL ──────────────────────────────────────────────────────
    // Mirrors kycController.js viewDocument exactly:
    //   const command = new GetObjectCommand({ Bucket: BUCKET_NAME(), Key: doc.storageKey });
    //   const presignedGetUrl = await getSignedUrl(client, command, { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS });
    const client  = getR2Client();
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME(),
        Key:    storageKey,
    });

    const presignedGetUrl = await getSignedUrl(client, command, {
        expiresIn: expirySeconds,
    });

    return {
        source:            'b2',
        presignedGetUrl,
        expiresInSeconds:  expirySeconds,
    };
}

module.exports = resolveDocumentDownloadUrl;
