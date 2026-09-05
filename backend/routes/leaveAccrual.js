// backend/routes/leaveAccrual.js
/**
 * Leave Accrual Management Routes (Admin Only)
 * 
 * Endpoints for managing automated leave accrual system
 */

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const LeaveAccrualService = require('../services/LeaveAccrualService');
const LeaveAccrualLock = require('../models/LeaveAccrualLock');
const LeaveLedger = require('../models/LeaveLedger');
const { getISTNow, getISTDateParts } = require('../utils/istTime');
const { HR_FAMILY } = require('../config/roles');

// Middleware to check for Admin/HR role
const isAdminOrHr = async (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role;
    if (!HR_FAMILY.includes(userRole)) {
        return res.status(403).json({ error: 'Access forbidden: Requires Admin or HR role' });
    }

    next();
};

/**
 * POST /api/leave-accrual/process
 * Manually trigger leave accrual for a specific month
 */
router.post('/process', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { month, year, dryRun = false, employeeIds } = req.body;

        // Validate input
        if (!month || !year) {
            return res.status(400).json({
                error: 'Month and year are required',
                example: { month: 1, year: 2025 }
            });
        }

        if (month < 1 || month > 12) {
            return res.status(400).json({ error: 'Month must be between 1 and 12' });
        }

        if (year < 2000 || year > 2100) {
            return res.status(400).json({ error: 'Year must be between 2000 and 2100' });
        }

        // Process accrual
        const result = await LeaveAccrualService.processMonthlyAccrual(
            month,
            year,
            { dryRun, employeeIds }
        );

        res.json({
            success: true,
            message: dryRun ? 'Dry run completed' : 'Accrual processed successfully',
            result
        });

    } catch (error) {
        console.error('[LeaveAccrual] Error processing accrual:', error);
        res.status(500).json({
            error: 'Failed to process accrual',
            message: error.message
        });
    }
});

/**
 * GET /api/leave-accrual/history
 * Get accrual processing history
 */
router.get('/history', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { limit = 12, status } = req.query;

        const query = {};
        if (status) {
            query.status = status;
        }

        const history = await LeaveAccrualLock.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json({
            success: true,
            history
        });

    } catch (error) {
        console.error('[LeaveAccrual] Error fetching history:', error);
        res.status(500).json({
            error: 'Failed to fetch accrual history',
            message: error.message
        });
    }
});

/**
 * GET /api/leave-accrual/employee/:employeeId
 * Get accrual history for a specific employee
 */
router.get('/employee/:employeeId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { limit = 50, leaveType } = req.query;

        const history = await LeaveAccrualService.getAccrualHistory(
            employeeId,
            { limit: parseInt(limit), leaveType }
        );

        res.json({
            success: true,
            employeeId,
            history
        });

    } catch (error) {
        console.error('[LeaveAccrual] Error fetching employee history:', error);
        res.status(500).json({
            error: 'Failed to fetch employee accrual history',
            message: error.message
        });
    }
});

/**
 * POST /api/leave-accrual/adjust
 * Manual leave balance adjustment (admin only)
 */
router.post('/adjust', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { employeeId, leaveType, amount, reason } = req.body;

        // Validate input
        if (!employeeId || !leaveType || amount === undefined || !reason) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['employeeId', 'leaveType', 'amount', 'reason']
            });
        }

        if (!['sick', 'casual', 'paid'].includes(leaveType)) {
            return res.status(400).json({
                error: 'Invalid leave type',
                validTypes: ['sick', 'casual', 'paid']
            });
        }

        if (typeof amount !== 'number') {
            return res.status(400).json({ error: 'Amount must be a number' });
        }

        if (reason.length < 10) {
            return res.status(400).json({ error: 'Reason must be at least 10 characters' });
        }

        // Process adjustment
        const result = await LeaveAccrualService.manualAdjustment(
            employeeId,
            leaveType,
            amount,
            reason,
            req.user.userId
        );

        res.json({
            success: true,
            message: 'Balance adjusted successfully',
            result
        });

    } catch (error) {
        console.error('[LeaveAccrual] Error adjusting balance:', error);
        res.status(500).json({
            error: 'Failed to adjust balance',
            message: error.message
        });
    }
});

/**
 * GET /api/leave-accrual/verify/:employeeId
 * Verify balance integrity for an employee
 */
router.get('/verify/:employeeId', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { employeeId } = req.params;

        const verification = await LeaveAccrualService.verifyBalanceIntegrity(employeeId);

        const allValid = Object.values(verification).every(v => v.valid);

        res.json({
            success: true,
            employeeId,
            allValid,
            verification
        });

    } catch (error) {
        console.error('[LeaveAccrual] Error verifying balance:', error);
        res.status(500).json({
            error: 'Failed to verify balance',
            message: error.message
        });
    }
});

/**
 * GET /api/leave-accrual/status
 * Get current accrual system status
 */
router.get('/status', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const now = getISTNow();
        const { month, year } = getISTDateParts(now);

        // Check if current month has been processed
        const currentMonthLock = await LeaveAccrualLock.findOne({ month, year });

        // Get last successful accrual
        const lastSuccessful = await LeaveAccrualLock.findOne({ status: 'COMPLETED' })
            .sort({ createdAt: -1 })
            .lean();

        // Get pending/failed accruals
        const pending = await LeaveAccrualLock.countDocuments({ status: 'PROCESSING' });
        const failed = await LeaveAccrualLock.countDocuments({ status: 'FAILED' });

        res.json({
            success: true,
            status: {
                currentMonth: {
                    month,
                    year,
                    processed: !!currentMonthLock,
                    status: currentMonthLock?.status || 'NOT_PROCESSED'
                },
                lastSuccessful: lastSuccessful ? {
                    month: lastSuccessful.month,
                    year: lastSuccessful.year,
                    processedAt: lastSuccessful.completedAt,
                    employeesProcessed: lastSuccessful.employeesProcessed
                } : null,
                pending,
                failed
            }
        });

    } catch (error) {
        console.error('[LeaveAccrual] Error fetching status:', error);
        res.status(500).json({
            error: 'Failed to fetch accrual status',
            message: error.message
        });
    }
});

/**
 * GET /api/leave-accrual/ledger
 * Get leave ledger entries with filters
 */
router.get('/ledger', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const {
            employeeId,
            leaveType,
            transactionType,
            source,
            startDate,
            endDate,
            limit = 100
        } = req.query;

        const query = {};

        if (employeeId) query.employeeId = employeeId;
        if (leaveType) query.leaveType = leaveType;
        if (transactionType) query.transactionType = transactionType;
        if (source) query.source = source;

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const entries = await LeaveLedger.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('employeeId', 'fullName employeeCode')
            .populate('performedBy', 'fullName email')
            .lean();

        res.json({
            success: true,
            count: entries.length,
            entries
        });

    } catch (error) {
        console.error('[LeaveAccrual] Error fetching ledger:', error);
        res.status(500).json({
            error: 'Failed to fetch ledger entries',
            message: error.message
        });
    }
});

module.exports = router;
