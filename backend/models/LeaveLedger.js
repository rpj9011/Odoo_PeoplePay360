// backend/models/LeaveLedger.js
/**
 * Leave Ledger Model - Audit trail for all leave balance transactions
 * Provides complete traceability for accruals, adjustments, and deductions
 */
const mongoose = require('mongoose');

const leaveLedgerSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    leaveType: {
        type: String,
        enum: ['sick', 'casual', 'paid'],
        required: true,
        index: true
    },
    transactionType: {
        type: String,
        enum: ['ACCRUAL', 'ADJUSTMENT', 'DEDUCTION', 'CARRY_FORWARD', 'ENCASHMENT', 'YEAR_END_RESET', 'CONFIRMATION_ALLOTMENT'],
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    balanceBefore: {
        type: Number,
        required: true
    },
    balanceAfter: {
        type: Number,
        required: true
    },
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
        index: true
    },
    year: {
        type: Number,
        required: true,
        min: 2000,
        max: 2100,
        index: true
    },
    source: {
        type: String,
        enum: ['CRON', 'ADMIN', 'SYSTEM', 'LEAVE_APPROVAL', 'LEAVE_REJECTION'],
        required: true,
        index: true
    },
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'referenceModel'
    },
    referenceModel: {
        type: String,
        enum: ['LeaveRequest', 'User', 'LeaveYear']
    },
    description: {
        type: String,
        required: true
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Compound indexes for efficient queries
leaveLedgerSchema.index({ employeeId: 1, month: 1, year: 1 });
leaveLedgerSchema.index({ employeeId: 1, leaveType: 1, createdAt: -1 });
leaveLedgerSchema.index({ transactionType: 1, createdAt: -1 });
leaveLedgerSchema.index({ source: 1, createdAt: -1 });

// Static method to record a transaction
leaveLedgerSchema.statics.recordTransaction = async function(data, session = null) {
    const options = session ? { session } : {};
    
    const entry = await this.create([{
        employeeId: data.employeeId,
        leaveType: data.leaveType,
        transactionType: data.transactionType,
        amount: data.amount,
        balanceBefore: data.balanceBefore,
        balanceAfter: data.balanceAfter,
        month: data.month,
        year: data.year,
        source: data.source,
        referenceId: data.referenceId || null,
        referenceModel: data.referenceModel || null,
        description: data.description,
        performedBy: data.performedBy || null,
        metadata: data.metadata || {}
    }], options);
    
    return entry[0];
};

// Static method to get balance history for an employee
leaveLedgerSchema.statics.getBalanceHistory = async function(employeeId, leaveType, options = {}) {
    const query = { employeeId };
    
    if (leaveType) {
        query.leaveType = leaveType;
    }
    
    if (options.startDate) {
        query.createdAt = { $gte: options.startDate };
    }
    
    if (options.endDate) {
        query.createdAt = query.createdAt || {};
        query.createdAt.$lte = options.endDate;
    }
    
    return await this.find(query)
        .sort({ createdAt: -1 })
        .limit(options.limit || 100)
        .lean();
};

// Static method to verify balance integrity
leaveLedgerSchema.statics.verifyBalance = async function(employeeId, leaveType) {
    const User = mongoose.model('User');
    const employee = await User.findById(employeeId).select('leaveBalances');
    
    if (!employee) {
        throw new Error('Employee not found');
    }
    
    const currentBalance = employee.leaveBalances[leaveType] || 0;
    
    // Get all transactions for this leave type
    const transactions = await this.find({ employeeId, leaveType })
        .sort({ createdAt: 1 })
        .lean();
    
    if (transactions.length === 0) {
        return {
            valid: true,
            currentBalance,
            calculatedBalance: currentBalance,
            message: 'No transactions found'
        };
    }
    
    // Calculate balance from transactions
    const lastTransaction = transactions[transactions.length - 1];
    const calculatedBalance = lastTransaction.balanceAfter;
    
    const valid = Math.abs(currentBalance - calculatedBalance) < 0.01; // Allow for floating point errors
    
    return {
        valid,
        currentBalance,
        calculatedBalance,
        difference: currentBalance - calculatedBalance,
        transactionCount: transactions.length,
        lastTransaction: lastTransaction.createdAt
    };
};

module.exports = mongoose.model('LeaveLedger', leaveLedgerSchema);
