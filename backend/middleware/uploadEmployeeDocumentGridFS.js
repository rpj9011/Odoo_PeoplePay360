// GridFS upload middleware for employee compliance documents (PDF).
// Reuses the same policyFiles bucket — different metadata prefix.
const busboy = require('busboy');
const crypto = require('crypto');
const { getPolicyBucket } = require('../db');

const uuidv4 = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

const FILE_SIZE_LIMIT = 10 * 1024 * 1024;
const ALLOWED_MIME = 'application/pdf';
const PDF_SIGNATURE = Buffer.from([0x25, 0x50, 0x44, 0x46]);

function validatePDFSignature(buffer) {
    if (buffer.length < PDF_SIGNATURE.length) return false;
    return buffer.slice(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
}

async function uploadToGridFS(buffer, originalFilename, uploadedBy) {
    const policyBucket = getPolicyBucket();
    const filename = `employee-doc-${uuidv4()}.pdf`;

    const uploadStream = policyBucket.openUploadStream(filename, {
        contentType: 'application/pdf',
        metadata: {
            originalFilename,
            uploadedBy,
            uploadedAt: new Date(),
            fileSize: buffer.length,
            documentClass: 'employee_document',
        },
    });

    return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => {
            resolve({
                fileId: uploadStream.id,
                filename,
                size: buffer.length,
            });
        });
        uploadStream.on('error', reject);
        uploadStream.end(buffer);
    });
}

function uploadEmployeeDocumentGridFS(req, res, next) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return res.status(400).json({ error: 'Content-Type must be multipart/form-data.' });
    }

    if (!req.user?.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!['Admin', 'HR'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Only Admin or HR can upload employee documents.' });
    }

    const chunks = [];
    let originalname = '';
    let mimetype = '';
    let totalSize = 0;
    let foundFile = false;
    let rejected = false;
    const formFields = {};

    function sendError(status, message) {
        if (rejected) return;
        rejected = true;
        res.status(status).json({ error: message });
    }

    const bb = busboy({ headers: { 'content-type': contentType } });

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
            } else {
                chunks.push(chunk);
            }
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
            if (!validatePDFSignature(buffer)) {
                return sendError(400, 'Invalid PDF file. File signature does not match PDF format.');
            }

            const gridfsResult = await uploadToGridFS(buffer, originalname, req.user.userId);
            req.employeeDocumentUpload = {
                fileId: gridfsResult.fileId,
                filename: gridfsResult.filename,
                originalFilename: originalname,
                contentType: 'application/pdf',
                size: gridfsResult.size,
            };
            req.body = formFields;
            next();
        } catch (error) {
            console.error('[EmployeeDoc Upload] Processing error:', error);
            sendError(500, error.message || 'Failed to process PDF.');
        }
    });

    bb.on('error', () => {
        if (!rejected) sendError(400, 'Invalid multipart request.');
    });

    req.pipe(bb);
}

module.exports = uploadEmployeeDocumentGridFS;
