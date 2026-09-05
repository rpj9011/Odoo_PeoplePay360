const mongoose = require('mongoose');

const leaveYearSchema = new mongoose.Schema({
    year: {
        type: Number,
        required: true,
        unique: true,
        min: 2000,
        max: 2100,
        validate: {
            validator: Number.isInteger,
            message: 'Year must be an integer'
        }
    },
    isActive: {
        type: Boolean,
        required: true,
        default: false
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true,
        validate: {
            validator: function(value) {
                return value > this.startDate;
            },
            message: 'End date must be after start date'
        }
    },
    isLocked: {
        type: Boolean,
        default: false
    },
    version: {
        type: Number,
        default: 0
    }
}, { 
    timestamps: true 
});

// Unique constraint: only one active year
// Partial index ensures only one document can have isActive=true
leaveYearSchema.index(
    { isActive: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { isActive: true },
        name: 'unique_active_year'
    }
);

// Index for efficient year lookups
leaveYearSchema.index({ year: 1 });

// Index for finding active year quickly
leaveYearSchema.index({ isActive: 1, year: -1 });

// Pre-save hook to enforce single active year constraint
leaveYearSchema.pre('save', async function(next) {
    if (this.isActive && this.isModified('isActive')) {
        const activeCount = await this.constructor.countDocuments({ 
            isActive: true, 
            _id: { $ne: this._id } 
        });
        
        if (activeCount > 0) {
            const error = new Error('Another leave year is already active. Please deactivate it first.');
            error.name = 'ActiveYearConflict';
            return next(error);
        }
    }
    next();
});

// Instance method to lock/unlock the year
leaveYearSchema.methods.toggleLock = async function() {
    if (this.isActive) {
        throw new Error('Cannot lock the active leave year');
    }
    this.isLocked = !this.isLocked;
    return await this.save();
};

// Instance method to lock the year
leaveYearSchema.methods.lock = async function() {
    if (this.isActive) {
        throw new Error('Cannot lock the active leave year');
    }
    this.isLocked = true;
    return await this.save();
};

// Instance method to unlock the year
leaveYearSchema.methods.unlock = async function() {
    this.isLocked = false;
    return await this.save();
};

// Static method to find the active year
leaveYearSchema.statics.findActiveYear = async function() {
    return await this.findOne({ isActive: true });
};

// Static method to activate a year (with transaction support)
leaveYearSchema.statics.activateYear = async function(yearId, session = null) {
    const options = session ? { session } : {};
    
    // Deactivate all years
    await this.updateMany(
        { isActive: true },
        { isActive: false },
        options
    );
    
    // Activate the specified year
    const activatedYear = await this.findByIdAndUpdate(
        yearId,
        { isActive: true, isLocked: false },
        { new: true, ...options }
    );
    
    if (!activatedYear) {
        throw new Error('Leave year not found');
    }
    
    return activatedYear;
};

// Static method to check if a year can be deleted
leaveYearSchema.methods.canDelete = function() {
    return !this.isActive;
};

const LeaveYear = mongoose.model('LeaveYear', leaveYearSchema);

module.exports = LeaveYear;
