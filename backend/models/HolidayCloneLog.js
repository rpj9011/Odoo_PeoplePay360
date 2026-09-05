// backend/models/HolidayCloneLog.js
const mongoose = require('mongoose');

const holidayCloneLogSchema = new mongoose.Schema({
    sourceYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeaveYear',
        required: true,
        index: true
    },
    targetYearId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LeaveYear',
        required: true,
        index: true
    },
    clonedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    clonedAt: {
        type: Date,
        default: Date.now
    },
    
    // Statistics
    totalHolidays: {
        type: Number,
        default: 0
    },
    fixedHolidays: {
        type: Number,
        default: 0
    },
    lunarHolidays: {
        type: Number,
        default: 0
    },
    manualHolidays: {
        type: Number,
        default: 0
    },
    missingDatasets: {
        type: Number,
        default: 0
    },
    successfulClones: {
        type: Number,
        default: 0
    },
    
    // Details
    clonedHolidays: [{
        name: String,
        calculationType: String,
        status: {
            type: String,
            enum: ['SUCCESS', 'DATASET_MISSING', 'ERROR', 'NEEDS_REVIEW']
        },
        oldDate: Date,
        newDate: Date,
        oldDay: String,
        newDay: String,
        message: String,
        holidayCode: String
    }],
    
    // Preview Edits
    wasPreviewEdited: {
        type: Boolean,
        default: false
    },
    previewEdits: [{
        holidayName: String,
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed,
        editedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Errors
    errors: [{
        holidayName: String,
        error: String,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Status
    status: {
        type: String,
        enum: ['PREVIEW', 'CONFIRMED', 'FAILED', 'CANCELLED'],
        default: 'PREVIEW'
    },
    confirmedAt: Date,
    
    // Notes
    notes: {
        type: String,
        trim: true,
        maxlength: 1000
    }
}, { timestamps: true });

// Index for efficient queries
holidayCloneLogSchema.index({ targetYearId: 1, status: 1 });
holidayCloneLogSchema.index({ clonedBy: 1, clonedAt: -1 });
holidayCloneLogSchema.index({ sourceYearId: 1, targetYearId: 1 });

// Static method: Get clone history for a year
holidayCloneLogSchema.statics.getHistoryForYear = async function(yearId) {
    return await this.find({ 
        $or: [
            { sourceYearId: yearId },
            { targetYearId: yearId }
        ]
    })
    .populate('sourceYearId', 'year')
    .populate('targetYearId', 'year')
    .populate('clonedBy', 'fullName email')
    .sort({ clonedAt: -1 })
    .lean();
};

// Static method: Get latest clone for a target year
holidayCloneLogSchema.statics.getLatestClone = async function(targetYearId) {
    return await this.findOne({ targetYearId, status: 'CONFIRMED' })
        .sort({ clonedAt: -1 })
        .lean();
};

module.exports = mongoose.model('HolidayCloneLog', holidayCloneLogSchema);
