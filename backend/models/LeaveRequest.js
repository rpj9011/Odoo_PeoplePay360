// backend/models/LeaveRequest.js
const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestType: {
        type: String,
        enum: ['Planned', 'Sick', 'Loss of Pay', 'Compensatory', 'Backdated Leave', 'Casual', 'YEAR_END', 'Comp-Off'],
        required: true,
    },
    leaveType: {
        type: String,
        enum: ['Full Day', 'Half Day - First Half', 'Half Day - Second Half'],
        default: 'Full Day',
    },
    leaveDates: [{ type: Date, required: true }],
    alternateDate: { type: Date }, // Specifically for 'Compensatory' type
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Returned'],
        default: 'Pending',
    },
    // HR returned request for employee correction (wrong leave type, etc.)
    hrCorrectionNotes: { type: String },
    returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    returnedAt: { type: Date },
    employeeCorrectedAt: { type: Date },
    // Admin splits LOP days into Planned / Casual / LOP per date (approval deducts per effective type)
    dayTypeAllocations: [{
        date: { type: Date, required: true },
        requestType: {
            type: String,
            enum: ['Planned', 'Casual', 'Loss of Pay'],
            required: true,
        },
    }],
    dayAllocationsUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dayAllocationsUpdatedAt: { type: Date },
    isBackdated: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionNotes: { type: String }, // Notes provided when rejecting a leave request
    medicalCertificate: { type: String }, // URL/path to medical certificate file (optional for Sick leave)
    appliedAfterReturn: { type: Boolean, default: false }, // For sick leave tracking
    // Medical proof tracking for Sick Leave
    medicalProofStatus: {
        type: String,
        enum: ['NotRequired', 'Pending', 'Provided', 'Requested', 'Overdue'],
        default: 'NotRequired',
        // NotRequired: Certificate not needed (same-day, < threshold days)
        // Pending: Future-dated SL without certificate yet (waiting for leave date)
        // Provided: Certificate uploaded
        // Requested: Admin requested proof
        // Overdue: Certificate deadline passed without upload
    },
    medicalProofRequired: { type: Boolean, default: false }, // Whether proof is required based on policy
    medicalProofDeadline: { type: Date }, // Deadline for certificate upload (leave date + N days)
    medicalProofRequestedAt: { type: Date }, // When admin requested proof
    medicalProofRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin who requested proof
    medicalCertificateUploadedAt: { type: Date }, // When certificate was uploaded
    halfYearPeriod: { 
        type: String, 
        enum: ['First Half', 'Second Half'], 
        // Tracks which half of the year for Planned leaves (Jan-Jun or Jul-Dec)
    },
    // Year-End specific fields
    yearEndSubType: {
        type: String,
        enum: ['CARRY_FORWARD', 'ENCASH'],
        // Only used when requestType is 'YEAR_END'
    },
    yearEndLeaveType: {
        type: String,
        enum: ['Sick', 'Casual', 'Planned'],
        // The leave type for Year-End action (maps to leaveBalances: sick, casual, paid)
    },
    yearEndDays: {
        type: Number,
        // Number of days for Year-End action
    },
    yearEndYear: {
        type: Number,
        // Year for which the Year-End request is made (e.g., 2025)
    },
    isProcessed: {
        type: Boolean,
        default: false,
        // Prevents double processing of Year-End approvals
    },
    // Anti-exploitation validation fields
    validationBlocked: {
        type: Boolean,
        default: false,
        // Indicates if leave was blocked by anti-exploitation rules
    },
    blockedReason: {
        type: String,
        // Reason why leave was blocked (e.g., "FRIDAY_SATURDAY_CLUBBING", "MONTHLY_FREQUENCY_CAP", "WORKING_DAYS_DILUTION")
    },
    blockedRules: [{
        type: String,
        // Array of rules that blocked the leave
    }],
    // Admin override fields
    adminOverride: {
        type: Boolean,
        default: false,
        // Indicates if admin overrode the validation block
    },
    overrideReason: {
        type: String,
        // Reason provided by admin for overriding the block
    },
    overriddenBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // Admin who overrode the validation
    },
    overriddenAt: {
        type: Date,
        // Timestamp when override was applied
    },
    // Backdated Leave balance deduction breakdown (for restore on reject/delete)
    backdatedSickDeducted: { type: Number, default: null },
    backdatedCasualDeducted: { type: Number, default: null },
    // Auto-conversion tracking (Half-Day → Full-Day LOP when no check-in)
    autoConvertedToLOP: { type: Boolean, default: false },
    autoConversionDate: { type: Date },
    autoConversionReason: { type: String },
    originalLeaveType: { type: String }, // Store original type before conversion for revert
    originalRequestType: { type: String }, // Store original request type before conversion for revert
}, { timestamps: true });

// Compound unique index to prevent duplicate Year-End requests
// Ensures one request per employee, leaveType, and year for YEAR_END type
// Only applies to Pending and Approved requests (allows Rejected to be resubmitted)
leaveRequestSchema.index(
    { 
        employee: 1, 
        requestType: 1, 
        yearEndLeaveType: 1, 
        yearEndYear: 1 
    },
    { 
        unique: true,
        partialFilterExpression: {
            requestType: 'YEAR_END',
            status: { $in: ['Pending', 'Approved'] }
        },
        name: 'unique_year_end_request',
        background: true
    }
);

// Indexes for dashboard and pending-leaves: filter by status and requestType / leaveDates
leaveRequestSchema.index({ status: 1, requestType: 1 }, { background: true });
leaveRequestSchema.index({ status: 1, leaveDates: 1 }, { background: true });

// Compound index for attendance summary query: approved leaves for a specific employee
leaveRequestSchema.index({ employee: 1, status: 1, leaveDates: 1 }, { background: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);