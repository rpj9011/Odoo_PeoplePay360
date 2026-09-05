// backend/middleware/upload.js
// Avatar upload: multipart parser using busboy (no multer).
// Expects field "profileImage", buffers in memory, writes to uploads/avatars/,
// sets req.file = { filename } for compatibility with existing routes.

const busboy = require('busboy');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads/avatars');
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXT = /\.(jpeg|jpg|png|gif|webp)$/i;
const ALLOWED_MIME = /^image\/(jpeg|jpg|png|gif|webp)$/i;

try {
    fs.mkdirSync(uploadDir, { recursive: true });
} catch (_) {}

function checkFileType(originalname, mimetype) {
    const extOk = ALLOWED_EXT.test(path.extname(originalname || ''));
    const mimeOk = ALLOWED_MIME.test(mimetype || '');
    return extOk && mimeOk;
}

/**
 * Express middleware: parse multipart/form-data, expect field "profileImage",
 * buffer in memory, validate type/size, write to uploads/avatars/avatar-{userId}-{timestamp}.ext,
 * set req.file = { filename }.
 * Must run after authenticateToken so req.user.userId is set.
 */
function upload(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
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
        if (fieldname !== 'profileImage') {
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

        file.on('error', () => {
            if (!rejected) sendError(500, 'Error reading uploaded file.');
        });

        file.resume();
    });

    bb.on('finish', () => {
        if (rejected) return;
        if (!foundFile || chunks.length === 0) {
            return sendError(400, 'File not provided or invalid file type. Please upload an image.');
        }
        if (!checkFileType(originalname, mimetype)) {
            return sendError(400, 'Images Only: Only jpeg, jpg, png, gif, or webp files are allowed!');
        }
        const buffer = Buffer.concat(chunks);
        const ext = path.extname(originalname) || '.jpg';
        const filename = 'avatar-' + req.user.userId + '-' + Date.now() + ext;
        const filepath = path.join(uploadDir, filename);
        try {
            fs.writeFileSync(filepath, buffer);
        } catch (err) {
            return sendError(500, 'Failed to save file.');
        }
        req.file = { filename };
        next();
    });

    bb.on('error', () => {
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });

    req.pipe(bb);
}

// Drop-in for old multer API: upload.single('profileImage') returns this middleware
upload.single = () => upload;

module.exports = upload;
