// backend/models/DocumentTemplate.js
// Reusable document templates for the 4 built-in document types.
// Each edit creates a NEW version — old versions are retained read-only so
// previously-issued EmployeeDocument records always reflect the content
// that was in use at the time of issuance.
const mongoose = require('mongoose');

const BUILT_IN_TYPES = ['joining_letter', 'kra', 'probation_confirmation', 'probation_extension'];

// A single configurable field shown to the admin at assign-time
const fieldSchemaItem = new mongoose.Schema({
    key: { type: String, required: true },           // machine key, e.g. "salary_amount"
    label: { type: String, required: true },          // human label, e.g. "Gross Monthly Salary"
    type: {
        type: String,
        enum: ['text', 'date', 'textarea'],
        default: 'text',
    },
    // Employee-model field to auto-fill from, or null if purely manual
    autoFillFrom: { type: String, default: null },
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
}, { _id: false });

const documentTemplateSchema = new mongoose.Schema({
    // Which built-in document type this template belongs to
    documentType: {
        type: String,
        enum: BUILT_IN_TYPES,
        required: true,
        index: true,
    },

    // Version counter — auto-incremented on every save; 1-based
    version: { type: Number, required: true, default: 1 },

    // Only the latest version is active; all others are retained for audit
    isActive: { type: Boolean, default: true, index: true },

    // The letter body — fixed prose with {{token}} placeholders.
    // Tokens that resolve from fieldsSchema or employee profile are substituted at generation time.
    boilerplateHtml: { type: String, default: '' },

    // Ordered list of variable fields rendered at assign-time
    fieldsSchema: { type: [fieldSchemaItem], default: [] },

    // Optional notes section label. Empty string = no notes section.
    notesFieldLabel: { type: String, default: '' },

    // Audit
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedByName: { type: String, default: '' },
}, {
    timestamps: true,
});

// Compound index: quick lookup for active template of a given type
documentTemplateSchema.index({ documentType: 1, isActive: 1 });
// Compound index: lookup by type + version (for issued-document snapshots)
documentTemplateSchema.index({ documentType: 1, version: -1 });

const DocumentTemplate = mongoose.model('DocumentTemplate', documentTemplateSchema);
module.exports = DocumentTemplate;
module.exports.BUILT_IN_TYPES = BUILT_IN_TYPES;
