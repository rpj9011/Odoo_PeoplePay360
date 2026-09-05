// backend/models/EmployeeDocument.js
// Immutable compliance audit trail for employee-assigned documents.
// Separate from Policy — different document class (HR letters, KRA, probation docs).
const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema({
    event: {
        type: String,
        enum: [
            'assigned',
            'viewed',
            'reading_started',
            'acknowledged',
            'status_changed',
            'auto_triggered',
            'hr_pending',
            'forwarded_to_personal_email',
        ],
        required: true,
    },
    timestamp: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    performedBy: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
}, { _id: false });

const employeeDocumentSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    employeeName: { type: String, required: true },
    employeeCode: { type: String, required: true },
    department: { type: String, default: '' },
    employmentStatus: { type: String, default: '' },

    documentType: {
        type: String,
        required: true,
        index: true,
    },
    documentTypeLabel: { type: String, required: true },

    fileRef: { type: mongoose.Schema.Types.ObjectId, default: null },
    fileName: { type: String, default: '' },

    assignedBy: { type: mongoose.Schema.Types.Mixed, required: true },
    assignedByName: { type: String, default: '' },
    assignedAt: { type: Date, default: Date.now, index: true },
    method: { type: String, enum: ['manual', 'auto'], default: 'manual' },

    requiresAcknowledgment: { type: Boolean, default: false },
    viewedAt: { type: Date, default: null },
    acknowledgedAt: { type: Date, default: null },

    acknowledgmentIp: { type: String, default: '' },
    acknowledgmentUserAgent: { type: String, default: '' },
    acknowledgmentDeviceType: { type: String, default: '' },
    acknowledgmentBrowser: { type: String, default: '' },
    checkboxAcknowledged: { type: Boolean, default: false },
    scrolledToBottom: { type: Boolean, default: false },
    readingDurationSeconds: { type: Number, default: 0 },

    note: { type: String, default: '' },

    // Personal email forwarding audit
    forwardedToPersonalEmailAt: { type: Date, default: null },
    forwardedCount: { type: Number, default: 0 },
    lastForwardStatus: { type: String, enum: ['success', 'failure', null], default: null },

    // Template provenance — set when the document was generated from a DocumentTemplate.
    // These fields are immutable after creation so re-opening old records always shows
    // which template version was used, even if the template has since been updated.
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentTemplate', default: null },
    templateVersion: { type: Number, default: null },

    status: {
        type: String,
        enum: ['pending', 'viewed', 'acknowledged', 'hr_pending'],
        default: 'pending',
        index: true,
    },

    statusChangeMeta: {
        previousStatus: { type: String, default: null },
        newStatus: { type: String, default: null },
        effectiveDate: { type: Date, default: null },
        approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        approverName: { type: String, default: '' },
    },

    timeline: [timelineEventSchema],
}, {
    timestamps: true,
});

employeeDocumentSchema.index({ employeeId: 1, documentType: 1, assignedAt: -1 });
employeeDocumentSchema.index({ department: 1, status: 1 });
employeeDocumentSchema.index({ method: 1, assignedAt: -1 });

const EmployeeDocument = mongoose.model('EmployeeDocument', employeeDocumentSchema);
module.exports = EmployeeDocument;
