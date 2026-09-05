// backend/utils/buildDocumentStorageKey.js
//
// Produces a deterministic B2 object key for any document category, following
// the conventions defined in config/documentCategories.js.
//
// Key schemes (all under the single byline-hr-docs bucket):
//
//   kyc             kyc/{employeeId}/{documentType}/{uuid}.ext
//   hrDocs          hr-docs/{employeeId}/{documentType}/{uuid}.ext
//   cifAttachments  cif-attachments/{employeeId}/{cifId}/{uuid}.ext
//   policies        policies/{policyId}/{uuid}.ext
//
// Usage examples:
//
//   // HR document
//   buildDocumentStorageKey({
//     category:   'hrDocs',
//     employeeId: '507f1f77bcf86cd799439011',
//     subFolder:  'offer_letter',
//     ext:        '.pdf',
//   })
//   // → 'hr-docs/507f1f77bcf86cd799439011/offer_letter/<uuid>.pdf'
//
//   // CIF attachment  (subFolder = cifId)
//   buildDocumentStorageKey({
//     category:   'cifAttachments',
//     employeeId: '507f1f77bcf86cd799439011',
//     subFolder:  '64abc123def456789012abcd',
//     ext:        '.png',
//   })
//   // → 'cif-attachments/507f1f77bcf86cd799439011/64abc123def456789012abcd/<uuid>.png'
//
//   // Policy  (no employeeId — pass policyId as subFolder)
//   buildDocumentStorageKey({
//     category:  'policies',
//     subFolder: '64abc123def456789012abcd',
//     ext:       '.pdf',
//   })
//   // → 'policies/64abc123def456789012abcd/<uuid>.pdf'
//
'use strict';

const crypto           = require('crypto');
const DOCUMENT_CATEGORIES = require('../config/documentCategories');

/**
 * Generate a UUID v4 string.
 * Uses the built-in crypto.randomUUID() when available (Node ≥ 14.17.0),
 * falling back to a manual hex approach for older runtimes.
 *
 * @returns {string}
 */
function uuidv4() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Build a deterministic, unique B2 storage key for a document.
 *
 * @param {object} opts
 * @param {string}  opts.category    - One of the keys in DOCUMENT_CATEGORIES
 *                                     ('kyc' | 'hrDocs' | 'cifAttachments' | 'policies').
 * @param {string} [opts.employeeId] - Required when category.employeeScoped === true.
 *                                     Must be the employee's MongoDB ObjectId as a string.
 * @param {string}  opts.subFolder   - Second path segment after the employeeId (or
 *                                     directly after the folder prefix for non-employee-
 *                                     scoped categories).
 *                                     • hrDocs          → documentType  (e.g. 'offer_letter')
 *                                     • cifAttachments  → cifId         (ObjectId as string)
 *                                     • policies        → policyId      (ObjectId as string)
 * @param {string}  opts.ext         - File extension including the leading dot (e.g. '.pdf').
 *                                     Must be lower-case; the function normalises it if not.
 *
 * @returns {string} The full B2 object key (no leading slash).
 *
 * @throws {Error} If required parameters are missing or category is unknown.
 */
function buildDocumentStorageKey({ category, employeeId, subFolder, ext }) {
    // ── Validate category ─────────────────────────────────────────────────────
    const cat = DOCUMENT_CATEGORIES[category];
    if (!cat) {
        throw new Error(
            `buildDocumentStorageKey: unknown category "${category}". ` +
            `Valid categories: ${Object.keys(DOCUMENT_CATEGORIES).join(', ')}.`
        );
    }

    // ── Validate employeeId when required ─────────────────────────────────────
    if (cat.employeeScoped) {
        if (!employeeId || typeof employeeId !== 'string' || !employeeId.trim()) {
            throw new Error(
                `buildDocumentStorageKey: category "${category}" is employee-scoped — ` +
                'employeeId (non-empty string) is required.'
            );
        }
    }

    // ── Validate subFolder ────────────────────────────────────────────────────
    if (!subFolder || typeof subFolder !== 'string' || !subFolder.trim()) {
        throw new Error(
            `buildDocumentStorageKey: subFolder is required for category "${category}". ` +
            'For hrDocs pass the documentType, for cifAttachments pass the cifId, ' +
            'for policies pass the policyId.'
        );
    }

    // ── Validate extension ────────────────────────────────────────────────────
    if (!ext || typeof ext !== 'string') {
        throw new Error('buildDocumentStorageKey: ext (file extension) is required.');
    }
    const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;

    // ── Assemble key ──────────────────────────────────────────────────────────
    const uuid     = uuidv4();
    const filename = `${uuid}${normalizedExt}`;

    let key;
    if (cat.employeeScoped) {
        // e.g. hr-docs/{employeeId}/{documentType}/{uuid}.pdf
        //      cif-attachments/{employeeId}/{cifId}/{uuid}.jpg
        key = `${cat.folderPrefix}/${employeeId.trim()}/${subFolder.trim()}/${filename}`;
    } else {
        // e.g. policies/{policyId}/{uuid}.pdf
        key = `${cat.folderPrefix}/${subFolder.trim()}/${filename}`;
    }

    return key;
}

module.exports = buildDocumentStorageKey;
