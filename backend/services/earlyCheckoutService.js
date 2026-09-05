// backend/services/earlyCheckoutService.js
// Performs clock-out when an early checkout request is approved (uses request timestamp and reason).
const mongoose = require('mongoose');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const BreakLog = require('../models/BreakLog');
const EarlyCheckoutRequest = require('../models/EarlyCheckoutRequest');
const User = require('../models/User');
const NewNotificationService = require('./NewNotificationService');
const cache = require('../utils/cache');
const { getISTDateString, formatISTTime } = require('../utils/istTime');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');
const { MINIMUM_WORKING_HOURS, MINIMUM_WORKING_MINUTES, MINIMUM_TOTAL_MINUTES_FOR_HALF_DAY } = require('../config/shiftPolicy');

/**
 * Perform clock-out for an approved early checkout request.
 * Uses request.requestedAt as clockOutTime and request.reason as earlyCheckoutNote.
 * @param {string} requestId - EarlyCheckoutRequest _id
 * @param {string} reviewedByUserId - Admin/HR user id who approved
 * @returns {{ success: boolean, error?: string }}
 */
async function performApprovedClockOut(requestId, reviewedByUserId) {
    const reqId = mongoose.Types.ObjectId.isValid(requestId) ? requestId : null;
    if (!reqId) return { success: false, error: 'Invalid request ID.' };

    const request = await EarlyCheckoutRequest.findById(reqId).lean();
    if (!request) return { success: false, error: 'Request not found.' };
    if (request.status !== 'Pending') return { success: false, error: 'Request is no longer pending.' };

    const logId = request.attendanceLog && (request.attendanceLog._id || request.attendanceLog);
    if (!logId) return { success: false, error: 'Attendance log reference missing.' };

    const log = await AttendanceLog.findById(logId);
    if (!log) return { success: false, error: 'Attendance log not found.' };

    // If already clocked out, just mark request Approved so UI state is consistent
    if (log.clockOutTime) {
        await EarlyCheckoutRequest.findByIdAndUpdate(reqId, {
            status: 'Approved',
            reviewedBy: reviewedByUserId,
            reviewedAt: new Date()
        });
        const uid = log.user && (log.user._id ? log.user.toString() : log.user.toString());
        cache.delete(`status:${uid}:${log.attendanceDate}`);
        cache.deletePattern('dashboard-summary:*');
        cache.delete(`employee_dashboard:${uid}:${log.attendanceDate}`);
        try { require('./cacheService').invalidateDashboard(log.attendanceDate); } catch (e) { /* ignore */ }
        return { success: true, message: 'Request marked as approved. Employee was already clocked out.' };
    }

    const userId = log.user && (log.user._id ? log.user.toString() : log.user.toString());
    const today = log.attendanceDate;
    const clockOutTime = new Date(request.requestedAt);
    const earlyCheckoutNote = (request.reason || '').trim();

    let updatedSession = await AttendanceSession.findOneAndUpdate(
        { attendanceLog: log._id, endTime: null },
        { $set: { endTime: clockOutTime, logoutType: 'MANUAL' } },
        { new: true, sort: { startTime: -1 } }
    );
    if (!updatedSession) {
        const openSession = await AttendanceSession.findOne({ attendanceLog: log._id, endTime: null }).sort({ startTime: -1 });
        if (openSession) {
            updatedSession = await AttendanceSession.findByIdAndUpdate(
                openSession._id,
                { $set: { endTime: clockOutTime, logoutType: 'MANUAL' } },
                { new: true }
            );
        }
        if (!updatedSession) {
            await EarlyCheckoutRequest.findByIdAndUpdate(reqId, {
                status: 'Approved',
                reviewedBy: reviewedByUserId,
                reviewedAt: new Date()
            });
            cache.delete(`status:${userId}:${today}`);
            cache.deletePattern('dashboard-summary:*');
            cache.delete(`employee_dashboard:${userId}:${today}`);
            try { require('./cacheService').invalidateDashboard(today); } catch (e) { /* ignore */ }
            return { success: true, message: 'Request marked as approved. Employee had already checked out.' };
        }
    }

    const [sessionsList, breaksList] = await Promise.all([
        AttendanceSession.find({ attendanceLog: log._id }).sort({ startTime: 1 }),
        BreakLog.find({ attendanceLog: log._id })
    ]);

    let totalWorkingMinutes = 0;
    let totalBreakMinutes = 0;
    sessionsList.forEach(s => {
        if (s.endTime) totalWorkingMinutes += (s.endTime - s.startTime) / (1000 * 60);
    });
    breaksList.forEach(b => {
        if (b.endTime) totalBreakMinutes += (b.endTime - b.startTime) / (1000 * 60);
    });
    const netWorkingMinutes = Math.max(0, totalWorkingMinutes - totalBreakMinutes);
    const totalWorkingHours = netWorkingMinutes / 60;

    let updateData = {
        clockOutTime,
        totalWorkingHours,
        logoutType: 'MANUAL',
        autoLogoutReason: null,
        earlyCheckoutNote: earlyCheckoutNote.trim() || undefined
    };

    const currentLog = await AttendanceLog.findById(log._id).lean();
    if (!currentLog?.overriddenByAdmin) {
        const GRACE_PERIOD_MINUTES = await getGracePeriodMinutes();
        const withinGracePeriod = (currentLog?.lateMinutes || 0) <= GRACE_PERIOD_MINUTES;
        
        // NEW SHIFT MODEL: Calculate elapsed shift time (clockOutTime - clockInTime, includes breaks)
        const elapsedShiftMinutes = (clockOutTime - new Date(currentLog.clockInTime)) / (1000 * 60);
        const elapsedShiftHours = elapsedShiftMinutes / 60;
        
        // Policy: < 5 hrs elapsed = Absent; >= 5 hrs AND < 9 hrs elapsed = Half-day; >= 9 hrs elapsed = Full day
        const { MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY, MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY } = require('../config/shiftPolicy');
        
        if (elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY) {
            // Less than 5 hrs elapsed → Absent
            updateData.isHalfDay = false;
            updateData.isLate = false;
            updateData.attendanceStatus = 'Absent';
            updateData.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
            updateData.halfDayReasonText = `Less than ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hours total shift time (${elapsedShiftHours.toFixed(1)} hours elapsed). Minimum ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hrs for half-day, ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hrs for full day.`;
            updateData.halfDaySource = 'AUTO';
        } else if (elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY) {
            // 5 to < 9 hrs elapsed → Half-day
            updateData.isHalfDay = true;
            updateData.isLate = withinGracePeriod ? false : currentLog?.isLate;
            updateData.attendanceStatus = 'Half-day';
            updateData.halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
            updateData.halfDayReasonText = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
            updateData.halfDaySource = 'AUTO';
        }
    }

    await AttendanceLog.findByIdAndUpdate(log._id, { $set: updateData });
    await EarlyCheckoutRequest.findByIdAndUpdate(reqId, {
        status: 'Approved',
        reviewedBy: reviewedByUserId,
        reviewedAt: new Date()
    });

    const user = await User.findById(userId).lean();
    if (user) {
        NewNotificationService.notifyEarlyCheckoutApproved(userId, user.fullName).catch(() => {});
    }

    cache.delete(`status:${userId}:${today}`);
    cache.deletePattern('dashboard-summary:*');
    cache.delete(`employee_dashboard:${userId}:${today}`);
    const cacheService = require('./cacheService');
    cacheService.invalidateDashboard(today);

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('attendance_log_updated', {
                logId: log._id,
                userId,
                attendanceDate: today,
                attendanceStatus: updateData.attendanceStatus || 'Half-day',
                isHalfDay: updateData.isHalfDay,
                clockOutTime: clockOutTime.toISOString(),
                totalWorkingHours,
                timestamp: new Date().toISOString(),
                message: 'Early checkout approved'
            });
        }
    } catch (e) { /* ignore */ }

    return { success: true };
}

module.exports = { performApprovedClockOut };
