// backend/controllers/adminDocumentHubController.js
//
// Admin hub API for document management across all four document categories.
//
// Routes (mounted on /api/admin/documents by server.js):
//   GET  /:employeeId                — list all documents for one employee (all categories)
//   GET  /:category/:id/download     — presigned URL or GridFS fallback for one document
//   POST /:category/:id/review       — approve/reject a document (review-required categories only)
//   POST /:category/upload           — admin-side upload of a new document to B2
//
// Auth: all routes require authenticateToken + isAdminOrHr (enforced at router level).
//
// IMPORTANT INVARIANTS:
//   • storageKey is NEVER included in any response body (mirrors sanitizeDoc in kycController.js).
//   • GridFS fileId / fileRef is NEVER included in any response body.
//   • This file does NOT trigger any GridFS deletion and does NOT run any B2 migration.
//   • kycController.js is NOT touched.
'use strict';

const { randomUUID }      = require('crypto');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getR2Client, BUCKET_NAME } = require('../config/r2');
const DOCUMENT_CATEGORIES = require('../config/documentCategories');
const buildDocumentStorageKey = require('../utils/buildDocumentStorageKey');
const resolveDocumentDownloadUrl = require('../utils/resolveDocumentDownloadUrl');

// ── Models ────────────────────────────────────────────────────────────────────
const EmployeeDocument = require('../models/EmployeeDocument');
const Policy           = require('../models/Policy');
const CIFAttachment    = require('../modules/cif/cifAttachment.model');
const CIF              = require('../modules/cif/cif.model');
const User             = require('../models/User');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true for Admin or HR role.
 */
function isAdminOrHr(role) {
    return ['Admin', 'HR'].includes(role);
}

/**
 * Validate that :category is a known DOCUMENT_CATEGORIES key.
 * Returns the category object, or null if unknown.
 */
function resolveCategory(key) {
    return DOCUMENT_CATEGORIES[key] || null;
}

/**
 * Strip storage internals before sending to the client.
 * Mirrors kycController.js sanitizeDoc — storageKey and raw GridFS refs
 * are never sent to the client. The download endpoint generates presigned
 * URLs on demand instead.
 */
function sanitizeDocumentRecord(doc, category) {
    if (!doc) return null;
    const {
        storageKey: _sk,   // never expose
        fileRef:    _fr,   // GridFS ObjectId for EmployeeDocument
        fileId:     _fi,   // GridFS ObjectId for Policy / CIFAttachment
        ...rest
    } = doc;
    return { ...rest, category };
}

/**
 * Normalize a document from any model into the unified hub shape.
 * NEVER include storageKey or GridFS IDs.
 */
function normalizeDocument(doc, category) {
    if (!doc) return null;

    const base = {
        id:         doc._id,
        category,
        uploadedAt: doc.createdAt || doc.assignedAt,
    };

    switch (category) {
        case 'hrDocs': return {
            ...base,
            documentType:  doc.documentType,
            label:         doc.documentTypeLabel,
            fileName:      doc.fileName,
            fileSize:      null, // not stored on EmployeeDocument
            mimeType:      'application/pdf',
            reviewStatus:  doc.reviewStatus,
            status:        doc.status,        // employee acknowledgment status
            uploadedBy:    doc.assignedByName || null,
            source:        doc.storageKey ? 'b2' : 'gridfs',
        };

        case 'cifAttachments': return {
            ...base,
            documentType:  'cif_attachment',
            label:         doc.originalName,
            fileName:      doc.originalName,
            fileSize:      doc.fileSize,
            mimeType:      doc.fileType,
            reviewStatus:  doc.reviewStatus,
            uploadedBy:    doc.uploadedBy,
            source:        doc.storageKey ? 'b2' : 'gridfs',
        };

        case 'policies': return {
            ...base,
            documentType:  'policy',
            label:         doc.name,
            fileName:      doc.fileName,
            fileSize:      doc.fileSize,
            mimeType:      'application/pdf',
            reviewStatus:  doc.reviewStatus,
            status:        doc.status,
            uploadedBy:    doc.uploadedBy,
            source:        doc.storageKey ? 'b2' : 'gridfs',
        };

        default: return { ...base, source: 'unknown' };
    }
}

// ── GET /api/admin/documents/:employeeId ──────────────────────────────────────
// Returns ALL documents for one employee across hrDocs, cifAttachments, and
// policies (policy acceptance) — four categories in one array (KYC excluded).
// NOTE: policies are not employee-scoped; we include only policies where the
// employee exists, so policies list is returned as a separate top-level key
// since there's no direct employee↔policy join in the Policy model.
exports.listEmployeeDocuments = async (req, res) => {
    try {
        const { employeeId } = req.params;

        // Validate employee exists
        const employee = await User.findById(employeeId).select('fullName employeeCode').lean();
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        // Fetch in parallel
        const [hrDocs, cifAttachments, policies] = await Promise.all([
            // HR documents assigned to this employee
            EmployeeDocument.find({ employeeId })
                .sort({ assignedAt: -1 })
                .lean(),

            // CIF attachments: find all CIFs for this employee, then their attachments
            (async () => {
                const cifs = await CIF.find({ employeeId, isArchived: false }).select('_id').lean();
                if (!cifs.length) return [];
                const cifIds = cifs.map(c => c._id);
                return CIFAttachment.find({ cifId: { $in: cifIds } })
                    .sort({ createdAt: -1 })
                    .lean();
            })(),

            // Company policies (not employee-scoped — return all active/archived)
            Policy.find()
                .sort({ effectiveFrom: -1, createdAt: -1 })
                .lean(),
        ]);

        const normalized = [
            ...hrDocs.map(d        => normalizeDocument(d, 'hrDocs')),
            ...cifAttachments.map(d => normalizeDocument(d, 'cifAttachments')),
            ...policies.map(d      => normalizeDocument(d, 'policies')),
        ];

        res.json({
            employee: {
                id:           employee._id,
                fullName:     employee.fullName,
                employeeCode: employee.employeeCode,
            },
            documents: normalized,
            totals: {
                hrDocs:         hrDocs.length,
                cifAttachments: cifAttachments.length,
                policies:       policies.length,
            },
        });
    } catch (err) {
        console.error('[AdminDocHub] listEmployeeDocuments error:', err);
        res.status(500).json({ error: 'Failed to fetch documents.' });
    }
};

// ── GET /api/admin/documents/:category/:id/download ───────────────────────────
// Returns a presigned URL (B2) or streams from GridFS, depending on storageKey.
exports.downloadDocument = async (req, res) => {
    try {
        const { category, id } = req.params;

        const cat = resolveCategory(category);
        if (!cat) {
            return res.status(400).json({ error: `Unknown category "${category}". Valid: ${Object.keys(DOCUMENT_CATEGORIES).join(', ')}` });
        }

        // Fetch the record
        let storageKey = null;
        let gridFsFileId = null;
        let mimeType = 'application/pdf';
        let originalName = '';

        if (category === 'hrDocs') {
            const doc = await EmployeeDocument.findById(id).lean();
            if (!doc) return res.status(404).json({ error: 'Document not found.' });
            storageKey   = doc.storageKey;
            gridFsFileId = doc.fileRef;

        } else if (category === 'cifAttachments') {
            const att = await CIFAttachment.findById(id).lean();
            if (!att) return res.status(404).json({ error: 'Attachment not found.' });
            storageKey   = att.storageKey;
            gridFsFileId = att.fileId;
            mimeType     = att.fileType || mimeType;
            originalName = att.originalName || '';

        } else if (category === 'policies') {
            const pol = await Policy.findById(id).lean();
            if (!pol) return res.status(404).json({ error: 'Policy not found.' });
            storageKey   = pol.storageKey;
            gridFsFileId = pol.fileId;
            originalName = pol.fileName || '';

        } else {
            // kyc is out of scope for this hub
            return res.status(400).json({ error: 'Category "kyc" is managed by the dedicated KYC endpoints.' });
        }

        const result = await resolveDocumentDownloadUrl({ category, storageKey });

        if (result.source === 'b2') {
            return res.json({ presignedGetUrl: result.presignedGetUrl, expiresInSeconds: result.expiresInSeconds });
        }

        // ── GridFS fallback ───────────────────────────────────────────────────
        if (!gridFsFileId) {
            return res.status(404).json({ error: 'No file attached to this record.' });
        }

        const mongoose = require('mongoose');
        let downloadStream;

        if (category === 'hrDocs' || category === 'policies') {
            const { getPolicyBucket } = require('../db');
            const bucket = getPolicyBucket();
            downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(gridFsFileId));
        } else if (category === 'cifAttachments') {
            const { getBucket } = require('../middleware/uploadCIFAttachmentGridFS');
            const bucket = getBucket();
            downloadStream = bucket.openDownloadStream(gridFsFileId);
        }

        res.set('Content-Type', mimeType);
        res.set('Content-Disposition', `attachment; filename="${originalName || 'document'}"`);
        res.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        res.set('X-Content-Type-Options', 'nosniff');

        downloadStream.on('error', (err) => {
            console.error('[AdminDocHub] GridFS stream error:', err);
            if (!res.headersSent) res.status(404).json({ error: 'File not found in storage.' });
        });

        downloadStream.pipe(res);

    } catch (err) {
        console.error('[AdminDocHub] downloadDocument error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to retrieve document.' });
    }
};

// ── POST /api/admin/documents/:category/:id/review ────────────────────────────
// Approve or reject a document. Only permitted for categories where
// reviewRequired === true (currently: hrDocs only).
exports.reviewDocument = async (req, res) => {
    try {
        const { category, id } = req.params;
        const { action, rejectionReason } = req.body;

        const cat = resolveCategory(category);
        if (!cat) {
            return res.status(400).json({ error: `Unknown category "${category}". Valid: ${Object.keys(DOCUMENT_CATEGORIES).join(', ')}` });
        }

        // Reject review attempts for categories that don't support it
        if (!cat.reviewRequired) {
            return res.status(400).json({
                error: `Review workflow does not apply to category "${category}". ` +
                       `Only categories with reviewRequired: true (currently: hrDocs) support this action.`,
            });
        }

        if (!['verify', 'reject'].includes(action)) {
            return res.status(400).json({ error: 'action must be "verify" or "reject".' });
        }

        // rejectionReason is required for rejections — mirrors kycController.js rejectDocument
        if (action === 'reject' && (!rejectionReason || !rejectionReason.trim())) {
            return res.status(400).json({ error: 'A rejection reason is required when action is "reject".' });
        }

        let doc;
        if (category === 'hrDocs') {
            doc = await EmployeeDocument.findById(id);
        }
        // Other review-required categories can be added here in future phases.

        if (!doc) return res.status(404).json({ error: 'Document not found.' });

        doc.reviewStatus    = action === 'verify' ? 'verified' : 'rejected';
        doc.reviewedBy      = req.user.userId || req.user._id;
        doc.reviewedAt      = new Date();
        doc.rejectionReason = action === 'reject' ? rejectionReason.trim() : '';
        await doc.save();

        res.json({
            message:  `Document ${action === 'verify' ? 'verified' : 'rejected'} successfully.`,
            document: sanitizeDocumentRecord(doc.toObject(), category),
        });
    } catch (err) {
        console.error('[AdminDocHub] reviewDocument error:', err);
        res.status(500).json({ error: 'Failed to update document review status.' });
    }
};

// ── POST /api/admin/documents/:category/upload ────────────────────────────────
// Admin-side upload: file goes directly to B2 (no GridFS involved).
// The uploadDocumentToB2 middleware runs on the route before this handler
// and attaches req.docUpload + req.docFormFields.
exports.uploadDocument = async (req, res) => {
    try {
        const { category } = req.params;

        const cat = resolveCategory(category);
        if (!cat) {
            return res.status(400).json({ error: `Unknown category "${category}". Valid: ${Object.keys(DOCUMENT_CATEGORIES).join(', ')}` });
        }

        // kyc uploads are handled by the dedicated KYC controller
        if (category === 'kyc') {
            return res.status(400).json({ error: 'KYC uploads are managed by the dedicated /api/kyc/upload endpoint.' });
        }

        if (!req.docUpload) {
            return res.status(400).json({ error: 'File upload failed.' });
        }

        const { buffer, originalFileName, mimeType, fileSize, ext } = req.docUpload;
        const fields = req.docFormFields || {};

        // ── Build storage key ─────────────────────────────────────────────────
        let storageKey;
        let newRecord;

        if (category === 'hrDocs') {
            // Required fields: employeeId, documentType
            const { employeeId, documentType, customTypeLabel, requiresAcknowledgment, note } = fields;

            if (!employeeId) return res.status(400).json({ error: 'employeeId is required.' });
            if (!documentType) return res.status(400).json({ error: 'documentType is required.' });

            const employee = await User.findById(employeeId).select('fullName employeeCode department employmentStatus').lean();
            if (!employee) return res.status(404).json({ error: 'Employee not found.' });

            storageKey = buildDocumentStorageKey({
                category:   'hrDocs',
                employeeId: employeeId.toString(),
                subFolder:  documentType,
                ext,
            });

            // ── B2 upload ─────────────────────────────────────────────────────
            let uploadErr = null;
            try {
                await getR2Client().send(new PutObjectCommand({
                    Bucket:        BUCKET_NAME(),
                    Key:           storageKey,
                    Body:          buffer,
                    ContentType:   mimeType,
                    ContentLength: fileSize,
                }));
            } catch (b2Err) {
                console.error('[AdminDocHub] hrDocs B2 PutObject failed:', b2Err);
                uploadErr = b2Err;
            }
            if (uploadErr) {
                return res.status(502).json({ error: 'File upload to storage failed. Please try again.' });
            }

            // ── Create DB record ──────────────────────────────────────────────
            const adminUser = await User.findById(req.user.userId || req.user._id).select('fullName').lean();
            const requiresAck = requiresAcknowledgment === 'true' || requiresAcknowledgment === true;

            // Resolve the document type label (use configured types if available)
            const Setting = require('../models/Setting');
            const setting = await Setting.findOne({ key: 'employeeDocumentTypes' }).lean();
            const types = (setting?.value && Array.isArray(setting.value)) ? setting.value : [
                { key: 'joining_letter', label: 'Joining Letter' },
                { key: 'kra', label: 'KRA Letter' },
                { key: 'probation_confirmation', label: 'Probation Confirmation' },
                { key: 'probation_extension', label: 'Probation Extension' },
            ];
            let typeLabel = customTypeLabel?.trim() || '';
            if (!typeLabel) {
                const found = types.find(t => t.key === documentType);
                typeLabel = found?.label || documentType;
            }

            newRecord = await EmployeeDocument.create({
                employeeId:          employee._id,
                employeeName:        employee.fullName,
                employeeCode:        employee.employeeCode,
                department:          employee.department || '',
                employmentStatus:    employee.employmentStatus || '',
                documentType,
                documentTypeLabel:   typeLabel,
                fileRef:             null,          // B2-native — no GridFS ref
                fileName:            originalFileName,
                storageKey,                         // B2 key populated at creation time
                assignedBy:          req.user.userId || req.user._id,
                assignedByName:      adminUser?.fullName || 'Admin',
                assignedAt:          new Date(),
                method:              'manual',
                requiresAcknowledgment: requiresAck,
                note:                note || '',
                status:              'pending',
                // New admin-hub uploads enter review queue (hrDocs has reviewRequired: true)
                reviewStatus:        'pending_review',
                timeline: [{
                    event:       'assigned',
                    timestamp:   new Date(),
                    notes:       `Uploaded and assigned by ${adminUser?.fullName || 'Admin'} via admin hub`,
                    performedBy: adminUser?.fullName || 'Admin',
                }],
            });

        } else if (category === 'cifAttachments') {
            // Required fields: cifId (the parent CIF)
            const { cifId } = fields;
            if (!cifId) return res.status(400).json({ error: 'cifId is required for cifAttachments.' });

            const cif = await CIF.findOne({ _id: cifId, isArchived: false }).lean();
            if (!cif) return res.status(404).json({ error: 'CIF record not found.' });

            const employeeId = cif.employeeId.toString();

            storageKey = buildDocumentStorageKey({
                category:   'cifAttachments',
                employeeId,
                subFolder:  cifId.toString(),
                ext,
            });

            let uploadErr = null;
            try {
                await getR2Client().send(new PutObjectCommand({
                    Bucket:        BUCKET_NAME(),
                    Key:           storageKey,
                    Body:          buffer,
                    ContentType:   mimeType,
                    ContentLength: fileSize,
                }));
            } catch (b2Err) {
                console.error('[AdminDocHub] cifAttachments B2 PutObject failed:', b2Err);
                uploadErr = b2Err;
            }
            if (uploadErr) {
                return res.status(502).json({ error: 'File upload to storage failed. Please try again.' });
            }

            const uploaderId = req.user.userId || req.user._id;
            newRecord = await CIFAttachment.create({
                cifId,
                fileId:      null,               // B2-native — no GridFS ref
                fileName:    `${randomUUID()}${ext}`,
                originalName: originalFileName,
                fileType:    mimeType,
                fileSize,
                storageKey,
                uploadedBy:  uploaderId,
                reviewStatus: 'not_required',    // cifAttachments reviewRequired: false
            });

        } else if (category === 'policies') {
            // Required fields: name, version, effectiveFrom
            const { name, version, effectiveFrom, department, status: policyStatus } = fields;
            if (!name || !effectiveFrom) {
                return res.status(400).json({ error: 'name and effectiveFrom are required for policies.' });
            }

            // policyId is not known until after creation — use a temporary UUID as placeholder,
            // then update the record with the real _id key after creation.
            // We create the record first with a placeholder, then do a targeted update.
            const tempId = randomUUID();
            storageKey = buildDocumentStorageKey({
                category:  'policies',
                subFolder: tempId,
                ext,
            });

            // Resolve version
            let policyVersion = version;
            if (!policyVersion || policyVersion === 'auto') {
                const latest = await Policy.findOne({ name }).sort({ createdAt: -1 }).select('version').lean();
                policyVersion = latest
                    ? ((parseFloat(latest.version) || 1.0) + 0.1).toFixed(1)
                    : '1.0';
            }

            // Create placeholder record to get the real _id
            newRecord = new Policy({
                name,
                version:      policyVersion,
                effectiveFrom: new Date(effectiveFrom),
                department:   department || '',
                status:       policyStatus || 'Active',
                fileId:       new (require('mongoose').Types.ObjectId)(), // placeholder — file is in B2
                fileName:     originalFileName,
                fileSize,
                storageKey,   // will be updated with real policyId key after save
                uploadedBy:   req.user.userId || req.user._id,
                reviewStatus: 'not_required',    // policies reviewRequired: false
            });
            await newRecord.save();

            // Rebuild the storage key with the real policyId and re-upload
            const realKey = buildDocumentStorageKey({
                category:  'policies',
                subFolder: newRecord._id.toString(),
                ext,
            });

            let uploadErr = null;
            try {
                await getR2Client().send(new PutObjectCommand({
                    Bucket:        BUCKET_NAME(),
                    Key:           realKey,
                    Body:          buffer,
                    ContentType:   mimeType,
                    ContentLength: fileSize,
                }));
            } catch (b2Err) {
                console.error('[AdminDocHub] policies B2 PutObject failed:', b2Err);
                uploadErr = b2Err;
            }
            if (uploadErr) {
                // Best-effort: delete the placeholder DB record so there's no orphan
                try { await Policy.findByIdAndDelete(newRecord._id); } catch (_) { /* ignore */ }
                return res.status(502).json({ error: 'File upload to storage failed. Please try again.' });
            }

            // Update the record with the correct storage key
            newRecord.storageKey = realKey;
            await newRecord.save();
        }

        res.status(201).json({
            message:  'Document uploaded successfully.',
            document: sanitizeDocumentRecord(newRecord.toObject(), category),
        });
    } catch (err) {
        console.error('[AdminDocHub] uploadDocument error:', err);
        res.status(500).json({ error: 'Failed to upload document.' });
    }
};
