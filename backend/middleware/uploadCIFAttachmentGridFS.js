// backend/middleware/uploadCIFAttachmentGridFS.js
// CIF attachment upload: GridFS storage (MongoDB)
// Supports: PDF, DOCX, DOC, images (JPEG, JPG, PNG, GIF, WEBP)
// Multiple file upload support

const busboy = require('busboy');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');

// SAFE LAZY INITIALIZATION - GridFSBucket
let bucket;

function getBucket() {
    if (!bucket) {
        if (!mongoose.connection || !mongoose.connection.db) {
            throw new Error("MongoDB not connected yet");
        }
        
        bucket = new mongoose.mongo.GridFSBucket(
            mongoose.connection.db,
            { bucketName: "cifAttachments" }
        );
    }
    
    return bucket;
}

// UUID generation function
const uuidv4 = () => {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    } else {
        return crypto.randomBytes(16).toString('hex');
    }
};

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB per file
const ALLOWED_EXT = /\.(jpeg|jpg|png|gif|webp|pdf|doc|docx)$/i;
const ALLOWED_MIME = /^(image\/(jpeg|jpg|png|gif|webp)|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document))$/i;

function checkFileType(originalname, mimetype) {
    const extOk = ALLOWED_EXT.test(path.extname(originalname || ''));
    const mimeOk = ALLOWED_MIME.test(mimetype || '');
    return extOk && mimeOk;
}

/**
 * Upload file to GridFS
 */
async function uploadToGridFS(buffer, originalName, mimetype, userId) {
    try {
        const bucket = getBucket();
        
        // Generate secure filename
        const ext = path.extname(originalName) || '.bin';
        const filename = `cif-${uuidv4()}${ext}`;
        
        // Upload to GridFS
        const uploadStream = bucket.openUploadStream(filename, {
            contentType: mimetype,
            metadata: {
                originalName: originalName,
                uploadedBy: userId,
                uploadedAt: new Date(),
                fileSize: buffer.length
            }
        });
        
        return new Promise((resolve, reject) => {
            uploadStream.on('finish', () => {
                console.log('[CIF Attachment] GridFS upload complete:', {
                    fileId: uploadStream.id,
                    filename: filename,
                    size: buffer.length
                });
                resolve({
                    fileId: uploadStream.id,
                    filename: filename,
                    originalName: originalName,
                    mimetype: mimetype,
                    size: buffer.length
                });
            });
            
            uploadStream.on('error', (error) => {
                console.error('[CIF Attachment] GridFS upload error:', error);
                reject(new Error('Failed to upload to GridFS'));
            });
            
            uploadStream.end(buffer);
        });
        
    } catch (error) {
        console.error('[CIF Attachment] GridFS error:', error);
        throw new Error(`GridFS upload failed: ${error.message}`);
    }
}

/**
 * Express middleware: parse multipart/form-data for CIF attachments
 * Supports multiple files
 * Sets req.files = [{ fileId, filename, originalName, mimetype, size }]
 */
function uploadCIFAttachmentGridFS(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }
    
    if (!req.user || (!req.user.userId && !req.user._id)) {
        console.error('[UploadCIF] Authentication check failed. req.user:', req.user);
        return res.status(401).json({ error: 'Authentication required.' });
    }

    console.log('[UploadCIF] Starting GridFS upload for user:', req.user.userId || req.user._id);

    const uploadedFiles = [];
    const fileBuffers = []; // Store file data temporarily
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
            fileBuffers.push({
                buffer,
                originalName: originalname,
                mimetype,
                size: totalSize
            });
        });

        file.on('error', () => {
            if (!rejected) sendError(500, 'Error reading uploaded file.');
        });
    });

    bb.on('finish', async () => {
        if (rejected) return;
        
        if (fileBuffers.length === 0) {
            return sendError(400, 'No files provided.');
        }

        try {
            const userId = req.user._id || req.user.userId;
            
            // Upload all files to GridFS
            const uploadPromises = fileBuffers.map(fileData =>
                uploadToGridFS(
                    fileData.buffer,
                    fileData.originalName,
                    fileData.mimetype,
                    userId
                )
            );
            
            const results = await Promise.all(uploadPromises);
            
            console.log('[UploadCIF] Successfully processed', results.length, 'file(s) to GridFS');
            
            req.files = results;
            next();
            
        } catch (error) {
            console.error('[UploadCIF] GridFS upload error:', error);
            sendError(500, error.message || 'Failed to upload files to GridFS');
        }
    });

    bb.on('error', (err) => {
        console.error('[UploadCIF] Busboy error:', err);
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });

    req.pipe(bb);
}

module.exports = uploadCIFAttachmentGridFS;
module.exports.getBucket = getBucket;
