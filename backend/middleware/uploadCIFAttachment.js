// backend/middleware/uploadCIFAttachment.js
// CIF attachment upload: multipart parser using busboy
// Supports: PDF, DOCX, DOC, images (JPEG, JPG, PNG, GIF, WEBP)
// Multiple file upload support

const busboy = require('busboy');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../uploads/cif-attachments');
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB per file
const ALLOWED_EXT = /\.(jpeg|jpg|png|gif|webp|pdf|doc|docx)$/i;
const ALLOWED_MIME = /^(image\/(jpeg|jpg|png|gif|webp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/i;

try {
    fs.mkdirSync(uploadDir, { recursive: true });
} catch (_) {}

function checkFileType(originalname, mimetype) {
    const extOk = ALLOWED_EXT.test(path.extname(originalname || ''));
    const mimeOk = ALLOWED_MIME.test(mimetype || '');
    return extOk && mimeOk;
}

/**
 * Express middleware: parse multipart/form-data for CIF attachments
 * Supports multiple files
 * Sets req.files = [{ filename, originalName, mimetype, size }]
 */
function uploadCIFAttachment(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }
    if (!req.user || (!req.user.userId && !req.user._id)) {
        console.error('[UploadCIF] Authentication check failed. req.user:', req.user);
        return res.status(401).json({ error: 'Authentication required.' });
    }

    console.log('[UploadCIF] Starting upload for user:', req.user.userId || req.user._id);

    const files = [];
    let rejected = false;

    function sendError(status, message) {
        if (rejected) return;
        rejected = true;
        console.error('[UploadCIF] Error:', message);
        res.status(status).json({ error: message });
    }

    const bb = busboy({ headers: { 'content-type': contentType } });

    bb.on('file', (fieldname, file, info) => {
        if (fieldname !== 'attachments') {
            file.resume();
            return;
        }

        const originalname = info.filename || 'unknown';
        const mimetype = info.mimeType || 'application/octet-stream';
        
        if (!checkFileType(originalname, mimetype)) {
            sendError(400, `Invalid file type: ${originalname}. Only PDF, DOCX, DOC, and images are allowed.`);
            file.destroy();
            return;
        }

        const chunks = [];
        let totalSize = 0;

        file.on('data', (chunk) => {
            if (rejected) return;
            totalSize += chunk.length;
            if (totalSize > FILE_SIZE_LIMIT) {
                sendError(400, `File ${originalname} exceeds 10MB limit.`);
                file.destroy();
                return;
            }
            chunks.push(chunk);
        });

        file.on('end', () => {
            if (rejected) return;
            
            const buffer = Buffer.concat(chunks);
            const ext = path.extname(originalname) || '.bin';
            const filename = 'cif-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) + ext;
            const filepath = path.join(uploadDir, filename);
            
            try {
                fs.writeFileSync(filepath, buffer);
                files.push({
                    filename,
                    originalName: originalname,
                    mimetype,
                    size: totalSize
                });
            } catch (err) {
                console.error('Error saving file:', err);
                sendError(500, 'Failed to save file.');
            }
        });

        file.on('error', () => {
            if (!rejected) sendError(500, 'Error reading uploaded file.');
        });
    });

    bb.on('finish', () => {
        if (rejected) return;
        if (files.length === 0) {
            return sendError(400, 'No files provided.');
        }
        console.log('[UploadCIF] Successfully processed', files.length, 'file(s)');
        req.files = files;
        next();
    });

    bb.on('error', (err) => {
        console.error('[UploadCIF] Busboy error:', err);
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });

    req.pipe(bb);
}

module.exports = uploadCIFAttachment;
