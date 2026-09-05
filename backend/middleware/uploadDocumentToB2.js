// backend/middleware/uploadDocumentToB2.js
//
// Generalized admin-side multipart upload middleware.
// Streams the incoming file into memory (bounded by category.maxFileSize),
// validates extension, reported MIME, and magic bytes, then attaches the
// validated buffer + metadata to req.docUpload for the controller to use.
//
// This middleware does NOT upload to B2 — the controller does that via
// PutObjectCommand, following the same pattern as kycController.js.
//
// Usage:
//   const uploadDocumentToB2 = require('../middleware/uploadDocumentToB2');
//   router.post('/upload', authenticateToken, uploadDocumentToB2({ category: 'hrDocs' }), controller);
//
// On success, attaches to the request:
//   req.docUpload = {
//     buffer          : Buffer   — validated file bytes
//     originalFileName: string   — original filename from the multipart part
//     mimeType        : string   — canonical/validated MIME type
//     fileSize        : number   — byte length
//     ext             : string   — lowercase extension incl. leading dot
//     category        : string   — the category key passed to the factory
//   }
//   req.docFormFields : object   — all non-file multipart fields
//
// Auth: caller is responsible for ensuring Admin/HR authentication runs
// BEFORE this middleware (this middleware enforces it as a belt-and-suspenders
// check but does not perform JWT verification itself).
'use strict';

const busboy     = require('busboy');
const DOCUMENT_CATEGORIES = require('../config/documentCategories');
const { HR_FAMILY } = require('../config/roles');

// ─── Magic-byte signatures ────────────────────────────────────────────────────
//
// Reuses the same table structure as uploadKycDocumentToR2.js, extended with
// DOC/DOCX detection.
//
// IMPORTANT LIMITATION — DOCX/DOC detection:
//   • DOC  (legacy OLE2): magic bytes D0 CF 11 E0  (always unique to OLE2 compound files)
//   • DOCX (OOXML/ZIP):   magic bytes 50 4B 03 04  (PK ZIP signature)
//
//   DOCX shares its PK signature with all ZIP-based formats: XLSX, PPTX, ODT, JAR, etc.
//   Magic-byte detection can only confirm "this is a ZIP file", NOT specifically that it
//   is a DOCX vs XLSX/PPTX/ODP/generic ZIP.  Full verification would require reading the
//   ZIP's central directory for [Content_Types].xml and inspecting its content, which is
//   significantly more complex and not implemented here.
//
//   RISK LEVEL: Low — this middleware is admin-only, not a public-facing endpoint.
//   Admins uploading wrong ZIP-based files would fail at the content-type mismatch
//   check (reported mime vs. sig.mime below) if they correctly report a different MIME.
//   If they incorrectly report application/vnd.openxmlformats-officedocument... for a
//   generic ZIP, the file is stored but cannot cause server-side execution.  This
//   limitation is documented here rather than silently overclaiming accuracy.
const MAGIC_SIGNATURES = [
    {
        label: 'PDF',
        sig:   Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
        mime:  'application/pdf',
        exts:  ['.pdf'],
    },
    {
        label: 'JPEG',
        sig:   Buffer.from([0xff, 0xd8, 0xff]),         // JFIF/EXIF SOI marker
        mime:  'image/jpeg',
        exts:  ['.jpg', '.jpeg'],
    },
    {
        label: 'PNG',
        sig:   Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // \x89PNG
        mime:  'image/png',
        exts:  ['.png'],
    },
    {
        label: 'GIF',
        sig:   Buffer.from([0x47, 0x49, 0x46, 0x38]),   // GIF8
        mime:  'image/gif',
        exts:  ['.gif'],
    },
    {
        label: 'WEBP',
        // RIFF....WEBP — check bytes 0-3 (RIFF) and 8-11 (WEBP)
        // Handled specially below because the format is not a simple prefix match.
        sig:   null,
        mime:  'image/webp',
        exts:  ['.webp'],
        customDetect: (buf) => (
            buf.length >= 12 &&
            buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
            buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
        ),
    },
    {
        label: 'DOC (OLE2)',
        sig:   Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),   // Legacy compound document file
        mime:  'application/msword',
        exts:  ['.doc'],
    },
    {
        // DOCX (and XLSX, PPTX, generic ZIP — see limitation comment above)
        label: 'DOCX/ZIP',
        sig:   Buffer.from([0x50, 0x4b, 0x03, 0x04]),   // PK ZIP local file header
        mime:  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        exts:  ['.docx'],
    },
];

// Maps reported MIME types to canonical form (browser normalization).
const MIME_CANONICAL = {
    'application/pdf':    'application/pdf',
    'image/jpeg':         'image/jpeg',
    'image/jpg':          'image/jpeg',  // non-standard alias browsers sometimes send
    'image/png':          'image/png',
    'image/gif':          'image/gif',
    'image/webp':         'image/webp',
    'application/msword': 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtension(filename = '') {
    const idx = filename.lastIndexOf('.');
    if (idx === -1) return '';
    return filename.slice(idx).toLowerCase();
}

function detectSignature(buffer) {
    for (const entry of MAGIC_SIGNATURES) {
        if (entry.customDetect) {
            if (entry.customDetect(buffer)) return entry;
        } else if (
            entry.sig &&
            buffer.length >= entry.sig.length &&
            buffer.slice(0, entry.sig.length).equals(entry.sig)
        ) {
            return entry;
        }
    }
    return null;
}

// ─── Middleware factory ────────────────────────────────────────────────────────

/**
 * uploadDocumentToB2(options)
 *
 * @param {object} options
 * @param {string} options.category — key from DOCUMENT_CATEGORIES (e.g. 'hrDocs')
 * @returns {function} Express middleware
 */
function uploadDocumentToB2({ category } = {}) {
    // Validate category at factory-call time so misconfiguration fails fast.
    const cat = DOCUMENT_CATEGORIES[category];
    if (!cat) {
        throw new Error(
            `uploadDocumentToB2: unknown category "${category}". ` +
            `Valid categories: ${Object.keys(DOCUMENT_CATEGORIES).join(', ')}.`
        );
    }

    const { maxFileSize, allowedExtensions, allowedMimeTypes } = cat;

    return function docUploadMiddleware(req, res, next) {
        // ── Content-Type guard ──
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
        }

        // ── Admin/HR guard (belt-and-suspenders — route should already enforce this) ──
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (!HR_FAMILY.includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin or HR role required.' });
        }

        const chunks         = [];
        let originalFileName = '';
        let reportedMime     = '';
        let totalSize        = 0;
        let foundFile        = false;
        let rejected         = false;
        const formFields     = {};

        function sendError(status, message) {
            if (rejected) return;
            rejected = true;
            try { bb.destroy(); } catch (_) { /* ignore */ }
            return res.status(status).json({ error: message });
        }

        const bb = busboy({
            headers: { 'content-type': contentType },
            limits: {
                fileSize: maxFileSize + 1, // +1 so we can detect oversize vs exact match
                files:    1,
                fields:   20,
            },
        });

        // ── Field handler ──
        bb.on('field', (fieldname, value) => {
            formFields[fieldname] = value;
        });

        // ── File handler ──
        bb.on('file', (fieldname, file, info) => {
            // Only process field named 'file'; ignore anything else.
            if (fieldname !== 'file') {
                file.resume();
                return;
            }

            foundFile        = true;
            originalFileName = info.filename || 'unknown';
            reportedMime     = (info.mimeType || 'application/octet-stream').toLowerCase();

            // ── Extension validation (against category's allowedExtensions) ──
            const ext = getExtension(originalFileName);
            if (!allowedExtensions.includes(ext)) {
                sendError(400, `File type not allowed. Allowed extensions for ${category}: ${allowedExtensions.join(', ')}`);
                file.destroy();
                return;
            }

            // ── Reported MIME validation (against category's allowedMimeTypes) ──
            const canonicalMime = MIME_CANONICAL[reportedMime];
            if (!canonicalMime || !allowedMimeTypes.includes(canonicalMime)) {
                sendError(400, `MIME type not allowed. Allowed types for ${category}: ${allowedMimeTypes.join(', ')}`);
                file.destroy();
                return;
            }

            // ── Buffer with running size check ──
            file.on('data', (chunk) => {
                if (rejected) return;
                totalSize += chunk.length;
                if (totalSize > maxFileSize) {
                    sendError(413, `File size exceeds the ${Math.round(maxFileSize / (1024 * 1024))} MB limit for ${category}.`);
                    file.destroy();
                    return;
                }
                chunks.push(chunk);
            });

            file.on('limit', () => {
                if (!rejected) sendError(413, `File size exceeds the ${Math.round(maxFileSize / (1024 * 1024))} MB limit for ${category}.`);
            });

            file.on('error', () => {
                if (!rejected) sendError(500, 'Error reading uploaded file.');
            });
        });

        bb.on('filesLimit', () => {
            if (!rejected) sendError(400, 'Only one file may be uploaded per request.');
        });

        // ── Finish: validate buffer and attach to request ──
        bb.on('finish', () => {
            if (rejected) return;

            if (!foundFile || chunks.length === 0) {
                return sendError(400, 'No file provided. Please attach a file under the field name "file".');
            }

            const ext = getExtension(originalFileName);

            try {
                const buffer = Buffer.concat(chunks);

                // ── Magic-byte check ──
                const sigMatch = detectSignature(buffer);
                if (!sigMatch) {
                    return sendError(400, `File content does not match any allowed format for category "${category}".`);
                }

                // ── Cross-check: magic-byte type must match reported MIME ──
                const canonicalMime = MIME_CANONICAL[reportedMime];
                if (sigMatch.mime !== canonicalMime) {
                    return sendError(400,
                        `File content (${sigMatch.label}) does not match the reported MIME type (${reportedMime}). ` +
                        `Note: DOCX detection via magic bytes identifies ZIP-based files only — ` +
                        `ensure MIME type and extension are set correctly.`
                    );
                }

                // ── Cross-check: extension must match detected type ──
                if (!sigMatch.exts.includes(ext)) {
                    return sendError(400,
                        `File extension (${ext}) does not match the detected file type (${sigMatch.label}).`
                    );
                }

                // ── Attach validated upload info to request ──
                req.docUpload = {
                    buffer,
                    originalFileName,
                    mimeType:   sigMatch.mime,   // always canonical/detected MIME
                    fileSize:   buffer.length,
                    ext,
                    category,
                };
                req.docFormFields = formFields;

                next();
            } catch (err) {
                console.error('[DocUpload Middleware] Processing error:', err);
                sendError(500, 'Failed to process uploaded file.');
            }
        });

        bb.on('error', () => {
            if (!rejected) sendError(400, 'Invalid multipart request.');
        });

        req.pipe(bb);
    };
}

module.exports = uploadDocumentToB2;
