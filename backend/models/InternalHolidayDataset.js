// backend/models/InternalHolidayDataset.js
const mongoose = require('mongoose');

const internalHolidayDatasetSchema = new mongoose.Schema({
    holidayCode: {
        type: String,
        required: true,
        uppercase: true,
        trim: true,
        maxlength: 50,
        index: true
    },
    holidayName: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    year: {
        type: Number,
        required: true,
        min: 2020,
        max: 2100,
        index: true
    },
    date: {
        type: Date,
        required: true
    },
    
    // Metadata
    datasetVersion: {
        type: String,
        required: true,
        trim: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },
    
    // Validation
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    verifiedAt: {
        type: Date
    },
    
    // Notes
    notes: {
        type: String,
        trim: true,
        maxlength: 500
    }
}, { timestamps: true });

// Compound unique index: one entry per holiday code per year
internalHolidayDatasetSchema.index(
    { holidayCode: 1, year: 1 }, 
    { unique: true, name: 'unique_holiday_per_year' }
);

// Index for efficient year-based queries
internalHolidayDatasetSchema.index({ year: 1, holidayCode: 1 });

// Index for dataset version queries
internalHolidayDatasetSchema.index({ datasetVersion: 1, year: 1 });

// Static method: Get dataset for a specific year
internalHolidayDatasetSchema.statics.getDatasetForYear = async function(year) {
    return await this.find({ year }).lean();
};

// Static method: Get specific holiday for a year
internalHolidayDatasetSchema.statics.getHolidayForYear = async function(holidayCode, year) {
    return await this.findOne({ holidayCode, year }).lean();
};

// Static method: Check if dataset is complete for a year
internalHolidayDatasetSchema.statics.isDatasetComplete = async function(year, requiredCodes) {
    const count = await this.countDocuments({ 
        year, 
        holidayCode: { $in: requiredCodes } 
    });
    return count === requiredCodes.length;
};

// Static method: Get latest dataset version for a year
internalHolidayDatasetSchema.statics.getLatestVersion = async function(year) {
    const latest = await this.findOne({ year })
        .sort({ uploadedAt: -1 })
        .select('datasetVersion uploadedAt')
        .lean();
    return latest;
};

module.exports = mongoose.model('InternalHolidayDataset', internalHolidayDatasetSchema);
