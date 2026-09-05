// backend/middleware/uploadPolicyGridFS.js
// SECURE POLICY PDF UPLOAD MIDDLEWARE - GridFS Only
// Features:
// - GridFS storage (MongoDB) - no filesystem dependency
// - PDF validation (magic number + MIME type)
// - File size limit (10MB)
// - Memory-only processing (no disk writes)
// - Filename sanitization (UUID-based)
// - Admin-only access control

const busboy = require('busboy');
const crypto = require('crypto');
const { getPolicyBucket } = require('../db');

// UUID generation function
const uuidv4 = () => {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    } else {
        return crypto.randomBytes(16).toString('hex');
    }
};

// Configuration
const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = 'application/pdf';

// PDF magic number (file signature)
const PDF_SIGNATURE = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

/**
 * Validate PDF magic number (file signature)
 */
function validatePDFSignature(buffer) {
    if (buffer.length < PDF_SIGNATURE.length) return false;
    return buffer.slice(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
}

/**
 * Upload PDF to GridFS
 */
async function uploadToGridFS(buffer, originalFilename, uploadedBy) {
    try {
        const policyBucket = getPolicyBucket();
        
        // Generate secure filename (UUID-based, no user input)
        const filename = `policy-${uuidv4()}.pdf`;
        
        // Upload to GridFS
        const uploadStream = policyBucket.openUploadStream(filename, {
            contentType: 'application/pdf',
            metadata: {
                originalFilename: originalFilename,
                uploadedBy: uploadedBy,
                uploadedAt: new Date(),
                fileSize: buffer.length
            }
        });
        
        return new Promise((resolve, reject) => {
            uploadStream.on('finish', () => {
                console.log('[Policy Upload] GridFS upload complete:', {
                    fileId: uploadStream.id,
                    filename: filename,
                    size: buffer.length
                });
                resolve({
                    fileId: uploadStream.id,
                    filename: filename,
                    size: buffer.length
                });
            });
            
            uploadStream.on('error', (error) => {
                console.error('[Policy Upload] GridFS upload error:', error);
                reject(new Error('Failed to upload to GridFS'));
            });
            
            uploadStream.end(buffer);
        });
        
    } catch (error) {
        console.error('[Policy Upload] GridFS error:', error);
        throw new Error(`GridFS upload failed: ${error.message}`);
    }
}

/**
 * Express middleware: Secure policy PDF upload with GridFS
 * Must run after authenticateToken middleware
 */
function uploadPolicyGridFS(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }
    
    if (!req.user || !req.user.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    
    // Admin-only check
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'Only admins can upload policies.' });
    }
    
    const chunks = [];
    let originalname = '';
    let mimetype = '';
    let totalSize = 0;
    let foundFile = false;
    let rejected = false;
    const formFields = {}; // Store form fields
    
    function sendError(status, message) {
        if (rejected) return;
        rejected = true;
        res.status(status).json({ error: message });
    }
    
    const bb = busboy({ headers: { 'content-type': contentType } });
    
    // Capture text fields
    bb.on('field', (fieldname, value) => {
        formFields[fieldname] = value;
    });
    
    bb.on('file', (fieldname, file, info) => {
        if (fieldname !== 'file') {
            file.resume();
            return;
        }
        
        foundFile = true;
        originalname = info.filename || 'unknown';
        mimetype = info.mimeType || 'application/octet-stream';
        
        // Validate MIME type
        if (mimetype !== ALLOWED_MIME) {
            sendError(400, 'Invalid file type. Only PDF files are allowed.');
            file.destroy();
            return;
        }
        
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
    
    bb.on('finish', async () => {
        if (rejected) return;
        
        if (!foundFile || chunks.length === 0) {
            return sendError(400, 'File not provided. Please upload a PDF.');
        }
        
        try {
            const buffer = Buffer.concat(chunks);
            
            // Validate PDF signature
            if (!validatePDFSignature(buffer)) {
                return sendError(400, 'Invalid PDF file. File signature does not match PDF format.');
            }
            
            // Upload to GridFS
            const gridfsResult = await uploadToGridFS(
                buffer,
                originalname,
                req.user.userId
            );
            
            // Attach result to request for route handler
            req.policyUpload = {
                fileId: gridfsResult.fileId,
                filename: gridfsResult.filename,
                originalFilename: originalname,
                contentType: 'application/pdf',
                size: gridfsResult.size
            };
            
            // Attach form fields to req.body
            req.body = formFields;
            
            next();
            
        } catch (error) {
            console.error('[Policy Upload] Processing error:', error);
            sendError(500, error.message || 'Failed to process PDF.');
        }
    });
    
    bb.on('error', () => {
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });
    
    req.pipe(bb);
}

module.exports = uploadPolicyGridFS;
