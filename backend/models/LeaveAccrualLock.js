// backend/models/LeaveAccrualLock.js
/**
 * Leave Accrual Lock Model - Prevents duplicate accrual processing
 * Ensures idempotent cron execution
 */
const mongoose = require('mongoose');

const leaveAccrualLockSchema = new mongoose.Schema({
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true,
        min: 2000,
        max: 2100
    },
    status: {
        type: String,
        enum: ['PROCESSING', 'COMPLETED', 'FAILED'],
        required: true,
        default: 'PROCESSING'
    },
    startedAt: {
        type: Date,
        required: true,
        default: Date.now
    },
    completedAt: {
        type: Date
    },
    employeesProcessed: {
        type: Number,
        default: 0
    },
    employeesFailed: {
        type: Number,
        default: 0
    },
    totalEmployees: {
        type: Number,
        default: 0
    },
    errors: [{
        employeeId: mongoose.Schema.Types.ObjectId,
        error: String,
        timestamp: Date
    }],
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Unique compound index to prevent duplicate processing
leaveAccrualLockSchema.index(
    { month: 1, year: 1 },
    { 
        unique: true,
        name: 'unique_month_year_accrual'
    }
);

// Index for status queries
leaveAccrualLockSchema.index({ status: 1, createdAt: -1 });

// Static method to acquire lock
leaveAccrualLockSchema.statics.acquireLock = async function(month, year) {
    try {
        const lock = await this.create({
            month,
            year,
            status: 'PROCESSING',
            startedAt: new Date()
        });
        return { success: true, lock };
    } catch (error) {
        if (error.code === 11000) {
            // Duplicate key - lock already exists
            const existingLock = await this.findOne({ month, year });
            
            // If lock is stale (older than 2 hours and still PROCESSING), allow retry
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            if (existingLock.status === 'PROCESSING' && existingLock.startedAt < twoHoursAgo) {
                // Update stale lock
                existingLock.status = 'FAILED';
                existingLock.completedAt = new Date();
                existingLock.metadata = { ...existingLock.metadata, reason: 'Stale lock detected' };
                await existingLock.save();
                
                // Try to acquire new lock
                return await this.acquireLock(month, year);
            }
            
            return {
                success: false,
                reason: 'ALREADY_PROCESSED',
                existingLock
            };
        }
        throw error;
    }
};

// Static method to release lock
leaveAccrualLockSchema.statics.releaseLock = async function(lockId, status, stats = {}) {
    const lock = await this.findById(lockId);
    if (!lock) {
        throw new Error('Lock not found');
    }
    
    lock.status = status;
    lock.completedAt = new Date();
    lock.employeesProcessed = stats.employeesProcessed || 0;
    lock.employeesFailed = stats.employeesFailed || 0;
    lock.totalEmployees = stats.totalEmployees || 0;
    
    if (stats.errors) {
        lock.errors = stats.errors;
    }
    
    if (stats.metadata) {
        lock.metadata = stats.metadata;
    }
    
    await lock.save();
    return lock;
};

// Static method to check if accrual is needed
leaveAccrualLockSchema.statics.isAccrualNeeded = async function(month, year) {
    const existingLock = await this.findOne({ month, year, status: 'COMPLETED' });
    return !existingLock;
};

module.exports = mongoose.model('LeaveAccrualLock', leaveAccrualLockSchema);
