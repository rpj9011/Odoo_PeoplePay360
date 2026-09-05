// backend/config/r2.js
// Backblaze B2 storage client — S3-compatible API.
// Used for KYC document storage (presigned URLs only; credentials never reach clients).
//
// Env vars required:
//   B2_KEY_ID          — Backblaze Application Key ID
//   B2_APPLICATION_KEY — Backblaze Application Key (secret)
//   B2_BUCKET_NAME     — e.g. "byline-hr-docs"
//   B2_ENDPOINT        — e.g. "s3.us-east-005.backblazeb2.com"  (no https://)
//   B2_REGION          — e.g. "us-east-005"
'use strict';

const { S3Client } = require('@aws-sdk/client-s3');

let _client = null;

function getR2Client() {
    if (_client) return _client;

    const keyId     = process.env.B2_KEY_ID;
    const appKey    = process.env.B2_APPLICATION_KEY;
    const endpoint  = process.env.B2_ENDPOINT;
    const region    = process.env.B2_REGION || 'us-east-005';

    if (!keyId || !appKey) {
        throw new Error(
            'Backblaze B2 credentials not configured. ' +
            'Set B2_KEY_ID and B2_APPLICATION_KEY in environment.'
        );
    }
    if (!endpoint) {
        throw new Error('B2_ENDPOINT is not set. Example: s3.us-east-005.backblazeb2.com');
    }

    // B2's S3-compatible endpoint requires:
    //   • A full https:// URL
    //   • forcePathStyle: true  (virtual-hosted style is not supported on B2)
    const endpointUrl = endpoint.startsWith('https://')
        ? endpoint
        : `https://${endpoint}`;

    _client = new S3Client({
        region,
        endpoint: endpointUrl,
        credentials: {
            accessKeyId:     keyId,
            secretAccessKey: appKey,
        },
        forcePathStyle: true, // required for B2 S3-compatible API
        // B2 does not support the AWS SDK v3 automatic checksum injection
        // (x-amz-checksum-crc32 / x-amz-sdk-checksum-algorithm). Both of the
        // settings below must be 'WHEN_REQUIRED' to prevent those params from
        // appearing in presigned URLs, which would cause SignatureDoesNotMatch.
        //
        // IMPORTANT: @aws-sdk/middleware-flexible-checksums is pinned to the
        // same version as @aws-sdk/client-s3 in package.json to prevent
        // sub-dependency version skew from re-enabling checksum injection.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
    });

    return _client;
}

function BUCKET_NAME() {
    const name = process.env.B2_BUCKET_NAME;
    if (!name) throw new Error('B2_BUCKET_NAME is not set in environment.');
    return name;
}

module.exports = { getR2Client, BUCKET_NAME };
