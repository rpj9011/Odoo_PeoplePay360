// backend/models/TimeOffType.js
// Configuration layer for leave/time-off types.
// Acts as a bridge between the new Allocation system and the existing hardcoded
// LeaveRequest.requestType enum — without requiring a schema migration of LeaveRequest.
//
// SEED: Run backend/scripts/seed-time-off-types.js (or the inline comment below)
// to create one TimeOffType per existing requestType value so historical requests
// always resolve to a display name.
//
// Mapping (legacyRequestTypeMapping → requestType enum):
//   "Planned"         → 'Planned'
//   "Sick"            → 'Sick'
//   "Casual"          → 'Casual'
//   "Loss of Pay"     → 'Loss of Pay'
//   "Compensatory"    → 'Compensatory'
//   "Backdated Leave" → 'Backdated Leave'
//   "Comp-Off"        → 'Comp-Off'
//   "Year End"        → 'YEAR_END'   (display only; not allocation-backed)

const mongoose = require('mongoose');

const timeOffTypeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        // 'Days' is used for all current leave types; 'Hours' reserved for future
        unit: {
            type: String,
            enum: ['Days', 'Hours'],
            default: 'Days',
        },

        // When true, granting balance to an employee requires a confirmed Allocation record.
        // When false (e.g. LOP, Compensatory), balance is not allocation-backed.
        requiresAllocation: {
            type: Boolean,
            default: true,
        },

        approvalRequired: {
            type: Boolean,
            default: true,
        },

        includeInPayroll: {
            type: Boolean,
            default: true,
        },

        // Bridge to existing LeaveRequest.requestType enum.
        // Set this to the exact requestType string so the system can resolve which
        // TimeOffType a historical LeaveRequest belongs to — no migration needed.
        legacyRequestTypeMapping: {
            type: String,
            trim: true,
            default: null,
        },

        description: {
            type: String,
            trim: true,
            default: '',
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Index for fast legacy mapping lookups (used by bridge hook on every approval)
timeOffTypeSchema.index({ legacyRequestTypeMapping: 1 });
timeOffTypeSchema.index({ isActive: 1 });

module.exports = mongoose.model('TimeOffType', timeOffTypeSchema);
