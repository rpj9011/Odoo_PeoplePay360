// backend/config/documentCategories.js
//
// Single registry describing every document category stored in the
// byline-hr-docs Backblaze B2 bucket.
//
// Used by:
//   • buildDocumentStorageKey.js  — key construction
//   • migration scripts           — category-specific validation
//   • (Phase 2) upload middleware — allowed type enforcement
//
// Folder key conventions (all under the same B2 bucket):
//   kyc/{employeeId}/{documentType}/{uuid}.ext          — existing, owned by EmployeeKycDocument
//   hr-docs/{employeeId}/{documentType}/{uuid}.ext      — EmployeeDocument (HR letters, KRA, etc.)
//   cif-attachments/{employeeId}/{cifId}/{uuid}.ext     — CIFAttachment (employeeId from parent CIF)
//   policies/{policyId}/{uuid}.ext                      — Policy (not employee-scoped)
//
// ─── ALLOWED FILE TYPE SOURCES ────────────────────────────────────────────────
//   KYC:            middleware/uploadKycDocumentToR2.js       — pdf, jpg, jpeg, png
//   hr-docs:        middleware/uploadEmployeeDocumentGridFS.js — pdf only
//   cif-attachments:middleware/uploadCIFAttachmentGridFS.js   — pdf, doc, docx,
//                                                               jpeg, jpg, png, gif, webp
//   policies:       middleware/uploadPolicyGridFS.js          — pdf only
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

/**
 * @typedef {Object} DocumentCategory
 * @property {string}   folderPrefix     - Top-level folder in the B2 bucket.
 * @property {boolean}  employeeScoped   - Whether the key includes an employeeId segment.
 * @property {boolean}  reviewRequired   - Whether uploaded files require HR/admin review.
 * @property {string[]} allowedExtensions - Lower-case extensions including the leading dot.
 * @property {string[]} allowedMimeTypes  - Canonical MIME types permitted for this category.
 * @property {number}   maxFileSize       - Hard size cap in bytes, matching the current upload
 *                                          middleware for that category (verified against source).
 */

/** @type {Object.<string, DocumentCategory>} */
const DOCUMENT_CATEGORIES = {
    /**
     * KYC compliance documents uploaded by employees.
     * Already live in B2 — included here for registry completeness only.
     * Do NOT use buildDocumentStorageKey for KYC; the KYC flow manages its
     * own keys inside kycController.js.
     * maxFileSize: 5 MB — verified against uploadKycDocumentToR2.js MAX_FILE_SIZE.
     */
    kyc: {
        folderPrefix:      'kyc',
        employeeScoped:    true,
        reviewRequired:    true,
        allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png'],
        allowedMimeTypes:  [
            'application/pdf',
            'image/jpeg',
            'image/png',
        ],
        maxFileSize: 5 * 1024 * 1024, // 5 MB — matches uploadKycDocumentToR2.js
    },

    /**
     * HR-assigned employee documents: offer letters, KRA documents,
     * probation letters, confirmation letters, etc.
     * Source collection: EmployeeDocument (models/EmployeeDocument.js)
     * GridFS bucket: policyFiles
     * Key: hr-docs/{employeeId}/{documentType}/{uuid}.ext
     * maxFileSize: 10 MB — verified against uploadEmployeeDocumentGridFS.js FILE_SIZE_LIMIT.
     */
    hrDocs: {
        folderPrefix:      'hr-docs',
        employeeScoped:    true,
        reviewRequired:    true,
        allowedExtensions: ['.pdf'],
        allowedMimeTypes:  ['application/pdf'],
        maxFileSize: 10 * 1024 * 1024, // 10 MB — matches uploadEmployeeDocumentGridFS.js
    },

    /**
     * Attachments on Corrective Incident Forms (CIF).
     * Source collection: CIFAttachment (modules/cif/cifAttachment.model.js)
     * GridFS bucket: cifAttachments
     * Key: cif-attachments/{employeeId}/{cifId}/{uuid}.ext
     *
     * NOTE: CIFAttachment has no direct employeeId field.  The employeeId is
     * on the parent CIF document (modules/cif/cif.model.js → employeeId, required).
     * Migration must JOIN through CIF to obtain employeeId.
     *
     * Allowed types match uploadCIFAttachmentGridFS.js exactly (confirmed wired in
     * cif.routes.js — uploadCIFAttachment.js is the old disk-based version, unused):
     *   ALLOWED_EXT  = /\.(jpeg|jpg|png|gif|webp|pdf|doc|docx)$/i
     *   ALLOWED_MIME = image/jpeg|image/jpg|image/png|image/gif|image/webp|
     *                  application/pdf|application/msword|
     *                  application/vnd.openxmlformats-officedocument.wordprocessingml.document
     * maxFileSize: 10 MB — verified against uploadCIFAttachmentGridFS.js FILE_SIZE_LIMIT.
     */
    cifAttachments: {
        folderPrefix:      'cif-attachments',
        employeeScoped:    true,
        reviewRequired:    false,
        allowedExtensions: ['.pdf', '.doc', '.docx', '.jpeg', '.jpg', '.png', '.gif', '.webp'],
        allowedMimeTypes:  [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
        ],
        maxFileSize: 10 * 1024 * 1024, // 10 MB — matches uploadCIFAttachmentGridFS.js
    },

    /**
     * Company-wide policy PDFs.
     * Source collection: Policy (models/Policy.js)
     * GridFS bucket: policyFiles
     * Key: policies/{policyId}/{uuid}.ext
     *
     * Policies are NOT employee-scoped — a single policy is accepted by many
     * employees via PolicyAcceptanceLog (models/PolicyAcceptanceLog.js).
     * The policyId used in the key is the Policy MongoDB _id (ObjectId as string).
     *
     * Allowed types match uploadPolicyGridFS.js: PDF only.
     * maxFileSize: 10 MB — verified against uploadPolicyGridFS.js FILE_SIZE_LIMIT.
     */
    policies: {
        folderPrefix:      'policies',
        employeeScoped:    false,
        reviewRequired:    false,
        allowedExtensions: ['.pdf'],
        allowedMimeTypes:  ['application/pdf'],
        maxFileSize: 10 * 1024 * 1024, // 10 MB — matches uploadPolicyGridFS.js
    },
};

module.exports = DOCUMENT_CATEGORIES;
