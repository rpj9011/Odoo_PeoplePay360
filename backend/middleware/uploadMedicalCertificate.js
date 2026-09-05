// backend/middleware/uploadMedicalCertificate.js
// Custom multipart parser for medical certificate upload (no multer).
// Buffers file in memory and attaches req.file for GridFS upload in the route.

const busboy = require('busboy');
const path = require('path');

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = /\.(jpeg|jpg|png|gif|pdf)$/i;
const ALLOWED_MIME = /^(image\/(jpeg|jpg|png|gif)|application\/pdf)$/i;

function checkFileType(originalname, mimetype) {
    const extOk = ALLOWED_EXT.test(path.extname(originalname || ''));
    const mimeOk = ALLOWED_MIME.test(mimetype || '');
    return extOk && mimeOk;
}

/**
 * Express middleware: parse multipart/form-data, expect field "medicalCertificate",
 * buffer file in memory, set req.file = { buffer, originalname, mimetype, size }.
 * Rejects missing file, invalid type, or size over limit.
 */
function uploadMedicalCertificate(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }

    const chunks = [];
    let originalname = '';
    let mimetype = '';
    let totalSize = 0;
    let foundFile = false;
    let rejected = false;

    function sendError(status, message) {
        if (rejected) return;
        rejected = true;
        res.status(status).json({ error: message });
    }

    const bb = busboy({ headers: { 'content-type': contentType } });

    bb.on('file', (fieldname, file, info) => {
        if (fieldname !== 'medicalCertificate') {
            file.resume();
            return;
        }
        foundFile = true;
        originalname = info.filename || 'unknown';
        mimetype = info.mimeType || 'application/octet-stream';

        file.on('data', (chunk) => {
            if (rejected) return;
            totalSize += chunk.length;
            if (totalSize > FILE_SIZE_LIMIT) {
                sendError(400, 'File size exceeds 10MB limit.');
                file.destroy();
                return;
            }
            chunks.push(chunk);
        });

        file.on('error', (err) => {
            if (!rejected) sendError(500, 'Error reading uploaded file.');
        });

        file.on('end', () => {
            if (rejected) return;
            if (!checkFileType(originalname, mimetype)) {
                sendError(400, 'Only PDF and image files (JPEG, PNG, GIF) are allowed.');
            }
        });

        file.resume();
    });

    bb.on('finish', () => {
        if (rejected) return;
        if (!foundFile || chunks.length === 0) {
            return sendError(400, 'Medical certificate file is required.');
        }
        if (!checkFileType(originalname, mimetype)) {
            return sendError(400, 'Only PDF and image files (JPEG, PNG, GIF) are allowed.');
        }
        const buffer = Buffer.concat(chunks);
        req.file = {
            buffer,
            originalname,
            mimetype,
            size: buffer.length
        };
        next();
    });

    bb.on('error', (err) => {
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });

    req.pipe(bb);
}

module.exports = uploadMedicalCertificate;
