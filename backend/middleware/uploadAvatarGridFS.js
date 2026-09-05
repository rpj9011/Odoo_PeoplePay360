// backend/middleware/uploadAvatarGridFS.js
// SECURE AVATAR UPLOAD MIDDLEWARE - GridFS Only
// NOTE: sharp removed - not supported on A2 shared hosting (native addon).
// Images are stored as-is after validation.

const busboy = require('busboy');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { getAvatarBucket } = require('../db');

const uuidv4 = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
};

const FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

const IMAGE_SIGNATURES = {
    'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
    'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
    'image/gif': [
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]),
        Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    ],
    'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],
};

const uploadRateLimits = new Map();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function validateMagicNumbers(buffer, mimeType) {
    const signatures = IMAGE_SIGNATURES[mimeType];
    if (!signatures) return false;
    return signatures.some(signature => {
        if (buffer.length < signature.length) return false;
        return buffer.slice(0, signature.length).equals(signature);
    });
}

function checkRateLimit(userId) {
    const now = Date.now();
    const userLimits = uploadRateLimits.get(userId) || [];
    const validLimits = userLimits.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (validLimits.length >= RATE_LIMIT_MAX) {
        return { allowed: false, resetTime: new Date(Math.min(...validLimits) + RATE_LIMIT_WINDOW), remaining: 0 };
    }
    validLimits.push(now);
    uploadRateLimits.set(userId, validLimits);
    return { allowed: true, remaining: RATE_LIMIT_MAX - validLimits.length };
}

async function uploadToGridFS(buffer, userId, contentType) {
    const avatarBucket = getAvatarBucket();
    const ext = contentType === 'image/png' ? 'png'
              : contentType === 'image/gif' ? 'gif'
              : contentType === 'image/webp' ? 'webp' : 'jpg';
    const filename = `avatar-${userId}-${uuidv4()}.${ext}`;

    // Delete old avatar if exists
    try {
        const User = mongoose.model('User');
        const user = await User.findById(userId);
        if (user && user.profileImageUrl) {
            const oldIdMatch = user.profileImageUrl.match(/\/avatar\/([a-f0-9]{24})/i);
            if (oldIdMatch) {
                await avatarBucket.delete(new mongoose.Types.ObjectId(oldIdMatch[1]));
                console.log('[Avatar Upload] Deleted old avatar:', oldIdMatch[1]);
            }
        }
    } catch (e) {
        console.warn('[Avatar Upload] Could not delete old avatar:', e.message);
    }

    const uploadStream = avatarBucket.openUploadStream(filename, {
        contentType,
        metadata: { userId, uploadedAt: new Date(), size: buffer.length }
    });

    return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => resolve({ fileId: uploadStream.id, filename }));
        uploadStream.on('error', err => reject(new Error('Failed to upload to GridFS: ' + err.message)));
        uploadStream.end(buffer);
    });
}

function uploadAvatarGridFS(req, res, next) {
    // Check MongoDB connection state before processing
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'Service temporarily unavailable. Please retry.' });
    }
    
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    const rateLimit = checkRateLimit(req.user.userId);
    if (!rateLimit.allowed) {
        return res.status(429).json({ error: 'Too many upload attempts.', resetTime: rateLimit.resetTime });
    }

    const chunks = [];
    let mimetype = '';
    let totalSize = 0;
    let foundFile = false;
    let rejected = false;

    function sendError(status, message) {
        if (rejected) return;
        rejected = true;
        res.status(status).json({ error: message });
    }

    let bb;
    try {
        bb = busboy({ headers: { 'content-type': contentType } });
    } catch (bbErr) {
        // busboy throws synchronously if Content-Type is malformed (e.g. missing boundary)
        return res.status(400).json({ error: 'Invalid multipart request: ' + bbErr.message });
    }

    bb.on('file', (fieldname, file, info) => {
        if (fieldname !== 'profileImage') { file.resume(); return; }
        foundFile = true;
        mimetype = info.mimeType || 'application/octet-stream';
        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimes.includes(mimetype)) {
            sendError(400, 'Invalid file type. Only JPEG, PNG, GIF, or WebP allowed.');
            file.destroy(); return;
        }
        file.on('data', chunk => {
            if (rejected) return;
            totalSize += chunk.length;
            if (totalSize > FILE_SIZE_LIMIT) { sendError(400, 'File exceeds 5MB limit.'); file.destroy(); return; }
            chunks.push(chunk);
        });
        file.on('error', () => { if (!rejected) sendError(500, 'Error reading file.'); });
        file.resume();
    });

    bb.on('finish', async () => {
        if (rejected) return;
        if (!foundFile || chunks.length === 0) return sendError(400, 'No file provided.');
        try {
            const buffer = Buffer.concat(chunks);
            if (!validateMagicNumbers(buffer, mimetype)) {
                return sendError(400, 'Invalid image: file signature mismatch.');
            }
            const gridfsResult = await uploadToGridFS(buffer, req.user.userId, mimetype);
            req.avatarUpload = { fileId: gridfsResult.fileId, filename: gridfsResult.filename, contentType: mimetype, size: buffer.length };
            res.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
            next();
        } catch (error) {
            console.error('[Avatar Upload] Error:', error);
            sendError(500, error.message || 'Failed to upload image.');
        }
    });

    bb.on('error', () => { if (!rejected) sendError(400, 'Invalid multipart request.'); });
    req.pipe(bb);
}

module.exports = uploadAvatarGridFS;
