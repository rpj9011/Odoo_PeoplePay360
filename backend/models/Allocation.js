// backend/models/Allocation.js
// Represents a grant of leave balance from a specific TimeOffType to an employee.
// The Allocation lifecycle: Draft → Confirmed (grants balance) | Refused.
// takenAmount is incremented by the bridge hook in admin.js whenever a
// leave request mapped to this type is approved, keeping it in sync automatically.

const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },

        timeOffType: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TimeOffType',
            required: true,
        },

        allocatedAmount: {
            type: Number,
            required: true,
            min: 0,
        },

        // Incremented by the approval bridge hook as requests are approved.
        // Kept separate from User.leaveBalances so we have a per-allocation audit trail.
        takenAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        validFrom: {
            type: Date,
            default: null,
        },

        validTo: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: ['Draft', 'Confirmed', 'Refused'],
            default: 'Draft',
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        approvedAt: {
            type: Date,
            default: null,
        },

        // Optional note from the approver/refuser
        notes: {
            type: String,
            trim: true,
            default: '',
        },
    },
    { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtual: how many days/hours the employee still has available on this allocation
allocationSchema.virtual('remainingAmount').get(function () {
    return Math.max(0, this.allocatedAmount - this.takenAmount);
});

// Indexes for typical query patterns
allocationSchema.index({ employee: 1, status: 1 });
allocationSchema.index({ employee: 1, timeOffType: 1, status: 1 });
allocationSchema.index({ timeOffType: 1, status: 1 });

module.exports = mongoose.model('Allocation', allocationSchema);
