// backend/models/SystemAuditLog.js
/**
 * Audit log for system-level actions (e.g. auto half-day conversion, revert).
 * Used for compliance and debugging.
 */
const mongoose = require('mongoose');

const systemAuditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: [
            'AUTO_HALF_DAY_CONVERSION', 
            'AUTO_HALF_DAY_REVERT',
            'ACTIVATE_YEAR',
            'ARCHIVE_YEAR',
            'CREATE_YEAR',
            'DELETE_YEAR',
            'LOCK_YEAR',
            'UNLOCK_YEAR'
        ],
    },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    employeeName: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // User who performed the action
    userName: { type: String }, // Name of user who performed the action
    leaveId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
    date: { type: String }, // YYYY-MM-DD for conversion date
    previousLeaveType: { type: String },
    previousRequestType: { type: String },
    newLeaveType: { type: String },
    newRequestType: { type: String },
    reason: { type: String },
    details: { type: mongoose.Schema.Types.Mixed }, // Flexible field for additional data
    ipAddress: { type: String }, // IP address of the user
    timestamp: { type: Date, default: Date.now }, // When the action occurred
    executedAt: { type: Date, default: Date.now },
    success: { type: Boolean, default: true },
    error: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For revert: admin who reverted
}, { timestamps: true });

systemAuditLogSchema.index({ action: 1, executedAt: -1 }, { background: true });
systemAuditLogSchema.index({ leaveId: 1 }, { background: true });
systemAuditLogSchema.index({ employeeId: 1, date: 1 }, { background: true });
systemAuditLogSchema.index({ userId: 1, timestamp: -1 }, { background: true });
systemAuditLogSchema.index({ timestamp: -1 }, { background: true });

module.exports = mongoose.model('SystemAuditLog', systemAuditLogSchema);
