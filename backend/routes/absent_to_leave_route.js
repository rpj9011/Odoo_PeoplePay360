const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Middleware
const authenticateToken = require('../middleware/authenticateToken');
const { invalidateAnalyticsCache } = require('../middleware/analyticsCacheInvalidation');

// Models
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const LeaveRequest = require('../models/LeaveRequest');

// Helper function for admin/HR check
const isAdminOrHr = (req, res, next) => {
    if (req.user && (req.user.role === 'Admin' || req.user.role === 'HR')) {
        return next();
    }
    return res.status(403).json({ error: 'Access denied. Admin or HR role required.' });
};

// POST /api/admin/attendance/absent-to-leave
// Convert absent days to leave for permanent employees within a date range.
// Deducts leave from their balance. Only processes days where the employee was absent.
router.post('/attendance/absent-to-leave', [authenticateToken, isAdminOrHr, invalidateAnalyticsCache], async (req, res) => {
    try {
        const { employeeScope, startDate, endDate, leaveType, maxDaysPerEmployee, overrideNote } = req.body;

        console.log('Absent-to-leave request:', { employeeScope, startDate, endDate, leaveType, maxDaysPerEmployee, overrideNote });

        // Validate leaveType
        const validLeaveTypes = ['Sick', 'Casual', 'Planned'];
        if (!leaveType || !validLeaveTypes.includes(leaveType)) {
            return res.status(400).json({ success: false, error: `leaveType must be one of: ${validLeaveTypes.join(', ')}` });
        }
        if (!overrideNote || typeof overrideNote !== 'string' || overrideNote.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'overrideNote is required.' });
        }
        if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
            return res.status(400).json({ success: false, error: 'startDate is required in YYYY-MM-DD format.' });
        }

        const maxDays = (typeof maxDaysPerEmployee === 'number' && maxDaysPerEmployee >= 1 && maxDaysPerEmployee <= 3)
            ? maxDaysPerEmployee : 3;

        const start = startDate.trim();
        const { getISTDateString } = require('../utils/istTime');
        const todayIST = getISTDateString();
        const end = (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) ? endDate.trim() : start;
        const effectiveEnd = end > todayIST ? todayIST : end;

        if (start > todayIST) {
            return res.status(400).json({ success: false, error: 'Cannot convert future dates.' });
        }
        if (start > effectiveEnd) {
            return res.status(400).json({ success: false, error: 'startDate must be before or equal to endDate.' });
        }

        const { generateDateRange } = require('../utils/attendanceStatusResolver');
        const dates = generateDateRange(start, effectiveEnd);
        if (dates.length > 31) {
            return res.status(400).json({ success: false, error: 'Maximum 31 days allowed per operation.' });
        }

        // Map leaveType → leaveBalances field
        const leaveTypeToField = { 'Sick': 'sick', 'Casual': 'casual', 'Planned': 'paid' };
        const balanceField = leaveTypeToField[leaveType];
        const adminUserId = req.user.userId;
        const note = overrideNote.trim();

        // Fetch only PERMANENT employees
        let employeeIds = [];
        if (employeeScope === 'all') {
            const users = await User.find({ role: { $ne: 'Admin' }, isActive: true, probationStatus: 'Permanent' }).select('_id').lean();
            employeeIds = users.map(u => u._id);
        } else if (Array.isArray(employeeScope) && employeeScope.length > 0) {
            const valid = employeeScope.filter(id => mongoose.Types.ObjectId.isValid(id));
            const users = await User.find({ _id: { $in: valid }, role: { $ne: 'Admin' }, isActive: true, probationStatus: 'Permanent' }).select('_id').lean();
            employeeIds = users.map(u => u._id);
            
            // If no permanent employees found, check what status they actually have
            if (employeeIds.length === 0 && valid.length > 0) {
                const actualUsers = await User.find({ _id: { $in: valid } }).select('_id name probationStatus isActive role').lean();
                console.log('Selected employees status:', actualUsers);
                const reasons = actualUsers.map(u => 
                    `${u.name}: probationStatus=${u.probationStatus}, isActive=${u.isActive}, role=${u.role}`
                ).join('; ');
                return res.status(400).json({ 
                    success: false, 
                    error: `No permanent employees found in selection. Employee details: ${reasons}` 
                });
            }
        }
        if (employeeIds.length === 0) {
            return res.status(400).json({ success: false, error: 'No permanent employees found in the selected scope.' });
        }

        // Load all attendance logs for selected employees and dates
        const existingLogs = await AttendanceLog.find({
            user: { $in: employeeIds },
            attendanceDate: { $in: dates },
        }).lean();

        // Group logs by user: userId → [{ date, log }]
        const userLogsMap = new Map();
        for (const log of existingLogs) {
            const uid = log.user.toString();
            if (!userLogsMap.has(uid)) userLogsMap.set(uid, []);
            userLogsMap.get(uid).push(log);
        }

        // For each employee, find their absent days (no clock-in or status Absent, no leave)
        const attendanceBulkOps = [];
        const balanceBulkOps = [];
        const leaveRequestOps = [];
        const overrideTs = new Date();

        let convertedCount = 0;
        let skippedCount = 0;

        // Fetch current leave balances for all employees in one query
        const usersWithBalance = await User.find({ _id: { $in: employeeIds } }).select('_id leaveBalances').lean();
        const balanceMap = new Map(usersWithBalance.map(u => [u._id.toString(), { ...u.leaveBalances }]));

        for (const eid of employeeIds) {
            const uid = eid.toString();
            const userLogs = userLogsMap.get(uid) || [];
            const logsByDate = new Map(userLogs.map(l => [l.attendanceDate, l]));

            let daysConvertedForUser = 0;
            let leaveDeducted = 0;

            for (const dateStr of dates) {
                if (daysConvertedForUser >= maxDays) break;

                const log = logsByDate.get(dateStr);
                const isAbsent = !log || log.attendanceStatus === 'Absent' || (!log.clockInTime && !log.overriddenByAdmin);

                if (!isAbsent) continue;

                // Check leave balance
                const balance = balanceMap.get(uid);
                if (!balance || (balance[balanceField] || 0) < 1) {
                    skippedCount++;
                    continue;
                }

                // Deduct 1 from the in-memory balance map to prevent over-deduction across days
                balance[balanceField] = (balance[balanceField] || 0) - 1;
                leaveDeducted++;
                daysConvertedForUser++;
                convertedCount++;

                // Create a LeaveRequest record for audit trail
                leaveRequestOps.push({
                    employee: eid,
                    requestType: leaveType,
                    leaveType: 'Full Day',
                    leaveDates: [new Date(dateStr)],
                    reason: `Admin bulk convert: ${note}`,
                    status: 'Approved',
                    approvedBy: adminUserId,
                    approvedAt: overrideTs,
                    isBackdated: true,
                });

                // Update the attendance log
                if (log) {
                    attendanceBulkOps.push({
                        updateOne: {
                            filter: { _id: log._id },
                            update: {
                                $set: {
                                    attendanceStatus: 'Leave',
                                    overriddenByAdmin: true,
                                    overrideType: 'leave',
                                    overrideReason: note,
                                    adminOverride: `Convert Absent to ${leaveType} Leave`,
                                    overriddenAt: overrideTs,
                                    overriddenBy: adminUserId,
                                    isHalfDay: false,
                                    isLate: false,
                                    lateMinutes: 0,
                                }
                            }
                        }
                    });
                } else {
                    // No existing log — create one
                    attendanceBulkOps.push({
                        insertOne: {
                            document: {
                                user: eid,
                                attendanceDate: dateStr,
                                attendanceStatus: 'Leave',
                                overriddenByAdmin: true,
                                overrideType: 'leave',
                                overrideReason: note,
                                adminOverride: `Convert Absent to ${leaveType} Leave`,
                                overriddenAt: overrideTs,
                                overriddenBy: adminUserId,
                                isHalfDay: false,
                                isLate: false,
                                lateMinutes: 0,
                                penaltyMinutes: 0,
                                paidBreakMinutesTaken: 0,
                                unpaidBreakMinutesTaken: 0,
                                totalWorkingHours: 0,
                                shiftDurationMinutes: 480,
                            }
                        }
                    });
                }
            }

            if (leaveDeducted > 0) {
                balanceBulkOps.push({
                    updateOne: {
                        filter: { _id: eid },
                        update: { $inc: { [`leaveBalances.${balanceField}`]: -leaveDeducted } }
                    }
                });
            }
        }

        // Execute DB operations
        if (leaveRequestOps.length > 0) {
            await LeaveRequest.insertMany(leaveRequestOps, { ordered: false });
        }
        if (attendanceBulkOps.length > 0) {
            await AttendanceLog.bulkWrite(attendanceBulkOps, { ordered: false });
        }
        if (balanceBulkOps.length > 0) {
            await User.bulkWrite(balanceBulkOps, { ordered: false });
        }

        try {
            const logAction = require('../services/logAction');
            await logAction(adminUserId, 'ABSENT_TO_LEAVE_BULK', {
                employeeScope: employeeScope === 'all' ? 'all' : employeeIds.length,
                startDate: start, endDate: effectiveEnd,
                leaveType, maxDaysPerEmployee: maxDays,
                convertedCount, skippedCount, overrideNote: note,
            });
        } catch (e) { /* ignore log errors */ }

        return res.status(200).json({
            success: true,
            message: `Converted ${convertedCount} absent day(s) to ${leaveType} leave.`,
            convertedCount,
            skippedCount,
            employeesProcessed: employeeIds.length,
        });

    } catch (err) {
        console.error('Error in absent-to-leave:', err);
        return res.status(500).json({ success: false, error: 'Server error during absent-to-leave conversion.', details: err.message });
    }
});

module.exports = router;
