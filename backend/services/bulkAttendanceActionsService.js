const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const BreakLog = require('../models/BreakLog');
const AnnouncementMessage = require('../models/AnnouncementMessage');
const NewNotificationService = require('./NewNotificationService');
const cacheService = require('./cacheService');
const cache = require('../utils/cache');
const { getISTNow, getISTDateString } = require('../utils/istTime');
const { getLiveAttendanceOverview } = require('./liveAttendanceService');
const { stopAllActiveTeaBreaks } = require('./teaBreakStopService');
const {
    UNPAID_BREAK_ALLOWANCE_MINUTES,
    EXTRA_BREAK_ALLOWANCE_MINUTES,
    PAID_BREAK_ALLOWANCE_MINUTES,
} = require('../config/shiftPolicy');

const VALID_ACTIONS = new Set([
    'refresh_live_attendance',
    'stop_tea_breaks',
    'end_lunch_breaks',
    'end_other_breaks',
    'overwrite_tea_break_overruns',
]);

const TEA_BREAK_SAFETY_CUTOFF_MS = 30 * 60 * 1000;

async function getTodayClockedInUserIds(today) {
    const logs = await AttendanceLog.find({
        attendanceDate: today,
        clockInTime: { $ne: null },
        clockOutTime: null,
    })
        .select('_id user')
        .lean();

    const userIds = [];
    for (const log of logs) {
        const activeSession = await AttendanceSession.findOne({
            attendanceLog: log._id,
            endTime: null,
        })
            .select('_id')
            .lean();
        if (activeSession) {
            userIds.push(String(log.user));
        }
    }
    return userIds;
}

async function countActiveTeaBreaks() {
    const now = getISTNow();
    const cutoff = new Date(now.getTime() - TEA_BREAK_SAFETY_CUTOFF_MS);
    return AnnouncementMessage.countDocuments({
        isTEABreak: true,
        teaBreakStartedAt: { $gte: cutoff, $lte: now },
        teaBreakStoppedAt: null,
    });
}

async function countActiveBreaksByCategory(breakTypes) {
    const today = getISTDateString();
    const userIds = await getTodayClockedInUserIds(today);
    if (!userIds.length) return 0;

    const logs = await AttendanceLog.find({
        user: { $in: userIds },
        attendanceDate: today,
    })
        .select('_id')
        .lean();

    const logIds = logs.map((log) => log._id);
    if (!logIds.length) return 0;

    return BreakLog.countDocuments({
        attendanceLog: { $in: logIds },
        endTime: null,
        breakType: { $in: breakTypes },
    });
}

/**
 * Get employees who have tea break overrun entries for today.
 * Returns each employee with their overrun minutes so admins can review before clearing.
 */
async function getTeaBreakOverruns() {
    const today = getISTDateString();

    // Find all auto-created tea break overrun BreakLog entries for today
    const overrunBreaks = await BreakLog.find({
        isAutoCreatedFromTeaBreak: true,
        reason: { $regex: '^tea_break:' },
        $expr: {
            $gte: [
                { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                today,
            ],
        },
        durationMinutes: { $gt: 0 },
    })
        .select('attendanceLog userId durationMinutes startTime endTime reason')
        .lean();

    if (!overrunBreaks.length) return [];

    // Fetch user names in one query
    const userIds = [...new Set(overrunBreaks.map((b) => String(b.userId)))];
    const users = await User.find({ _id: { $in: userIds } })
        .select('fullName employeeCode')
        .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // Deduplicate: one entry per user (keep highest overrun if multiple entries)
    const byUser = new Map();
    for (const b of overrunBreaks) {
        const uid = String(b.userId);
        const existing = byUser.get(uid);
        if (!existing || b.durationMinutes > existing.durationMinutes) {
            byUser.set(uid, b);
        }
    }

    return Array.from(byUser.values()).map((b) => {
        const user = userMap.get(String(b.userId)) || {};
        return {
            userId: String(b.userId),
            fullName: user.fullName || 'Unknown',
            employeeCode: user.employeeCode || '',
            overrunMinutes: b.durationMinutes,
            breakLogId: String(b._id),
            attendanceLogId: String(b.attendanceLog),
        };
    });
}

/**
 * Clear (overwrite/reverse) tea break overrun entries for today.
 * Removes the auto-created BreakLog entries and reverses the unpaidBreakMinutesTaken increment.
 */
async function clearTeaBreakOverruns() {
    const today = getISTDateString();

    const overrunBreaks = await BreakLog.find({
        isAutoCreatedFromTeaBreak: true,
        reason: { $regex: '^tea_break:' },
        $expr: {
            $gte: [
                { $dateToString: { format: '%Y-%m-%d', date: '$startTime', timezone: 'Asia/Kolkata' } },
                today,
            ],
        },
        durationMinutes: { $gt: 0 },
    })
        .select('_id attendanceLog userId durationMinutes')
        .lean();

    if (!overrunBreaks.length) {
        return { processedCount: 0, details: [] };
    }

    const details = [];

    for (const b of overrunBreaks) {
        try {
            // Reverse the unpaid break minutes on the attendance log
            await AttendanceLog.findByIdAndUpdate(b.attendanceLog, {
                $inc: { unpaidBreakMinutesTaken: -b.durationMinutes },
            });

            // Delete the overrun break log entry
            await BreakLog.findByIdAndDelete(b._id);

            // Notify the employee that their overrun was cleared
            const user = await User.findById(b.userId).select('fullName role').lean();
            if (user && !['Admin', 'HR'].includes(user.role)) {
                NewNotificationService.createAndEmitNotification({
                    message: 'Your tea break overrun has been cleared by an administrator.',
                    type: 'info',
                    userId: b.userId,
                    userName: user.fullName,
                    recipientType: 'user',
                    category: 'break',
                }).catch(() => {});
            }

            cache.delete(`status:${b.userId}:${today}`);
            cache.delete(`employee_dashboard:${b.userId}:${today}`);

            details.push({ userId: String(b.userId), breakLogId: String(b._id), success: true, overrunMinutes: b.durationMinutes });
        } catch (err) {
            details.push({ userId: String(b.userId), breakLogId: String(b._id), success: false, error: err.message });
        }
    }

    cacheService.invalidateDashboard(today);
    cache.deletePattern('dashboard-summary:*');

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('attendance_log_updated', {
                attendanceDate: today,
                timestamp: getISTNow().toISOString(),
                message: 'Tea break overruns cleared.',
            });
            io.emit('live_attendance_refreshed', { date: today });
        }
    } catch (_) { /* optional */ }

    return {
        processedCount: details.filter((d) => d.success).length,
        failedCount: details.filter((d) => !d.success).length,
        details,
    };
}

async function getBulkActionPreview() {
    const [overview, teaBreakCount, lunchBreakCount, otherBreakCount, overrunList] = await Promise.all([
        getLiveAttendanceOverview({ leaveRange: 'today' }),
        countActiveTeaBreaks(),
        countActiveBreaksByCategory(['Paid']),
        countActiveBreaksByCategory(['Unpaid', 'Extra']),
        getTeaBreakOverruns(),
    ]);

    return {
        refresh_live_attendance: {
            label: 'Refresh live attendance',
            description: 'Invalidate caches and reload today\'s live attendance snapshot.',
            affectedCount: overview.counts?.present ?? 0,
            meta: overview.counts,
        },
        stop_tea_breaks: {
            label: 'Stop all tea breaks',
            description: 'End company-wide tea break announcements for all clocked-in employees.',
            affectedCount: teaBreakCount,
        },
        end_lunch_breaks: {
            label: 'End all lunch breaks',
            description: 'Force-end active paid (lunch) breaks for employees still on break.',
            affectedCount: lunchBreakCount,
        },
        end_other_breaks: {
            label: 'End all other breaks',
            description: 'Force-end active unpaid and extra breaks.',
            affectedCount: otherBreakCount,
        },
        overwrite_tea_break_overruns: {
            label: 'Clear tea break overruns',
            description: 'Remove auto-applied overrun penalties for employees who exceeded tea break time today. This reverses the unpaid break minutes added.',
            affectedCount: overrunList.length,
            overrunDetails: overrunList,
        },
    };
}

async function endSingleActiveBreak(activeBreak, log, initiatedByUserId) {
    const breakEndTime = getISTNow();
    const currentBreakDuration = Math.round(
        (breakEndTime - new Date(activeBreak.startTime)) / (1000 * 60)
    );

    let penalty = 0;
    let paidBreakToAdd = 0;
    let unpaidBreakToAdd = 0;

    if (activeBreak.breakType === 'Paid') {
        const user = await User.findById(log.user).populate('shiftGroup').lean();
        const paidBreakAllowance = user?.shiftGroup?.paidBreakMinutes || PAID_BREAK_ALLOWANCE_MINUTES;
        const remainingPaidAllowance = paidBreakAllowance - (log.paidBreakMinutesTaken || 0);
        paidBreakToAdd = currentBreakDuration;
        if (currentBreakDuration > Math.max(0, remainingPaidAllowance)) {
            penalty = currentBreakDuration - Math.max(0, remainingPaidAllowance);
        }
    } else if (activeBreak.breakType === 'Unpaid' || activeBreak.breakType === 'Extra') {
        const allowance = activeBreak.breakType === 'Unpaid'
            ? UNPAID_BREAK_ALLOWANCE_MINUTES
            : EXTRA_BREAK_ALLOWANCE_MINUTES;
        unpaidBreakToAdd = currentBreakDuration;
        if (currentBreakDuration > allowance) {
            penalty = currentBreakDuration - allowance;
        }
    }

    await BreakLog.findByIdAndUpdate(activeBreak._id, {
        $set: { endTime: breakEndTime, durationMinutes: currentBreakDuration },
    });

    const updatePayload = { $inc: {} };
    if (penalty > 0) updatePayload.$inc.penaltyMinutes = penalty;
    if (paidBreakToAdd > 0) updatePayload.$inc.paidBreakMinutesTaken = paidBreakToAdd;
    if (unpaidBreakToAdd > 0) updatePayload.$inc.unpaidBreakMinutesTaken = unpaidBreakToAdd;
    if (Object.keys(updatePayload.$inc).length > 0) {
        await AttendanceLog.findByIdAndUpdate(log._id, updatePayload);
    }

    const user = await User.findById(log.user).select('fullName role').lean();
    const today = log.attendanceDate;

    if (user && !['Admin', 'HR'].includes(user.role)) {
        NewNotificationService.createAndEmitNotification({
            message: `Your ${activeBreak.breakType} break was ended by an administrator.`,
            type: 'info',
            userId: log.user,
            userName: user.fullName,
            recipientType: 'user',
            category: 'break',
        }).catch(() => {});
    }

    cache.delete(`status:${log.user}:${today}`);
    cache.delete(`employee_dashboard:${log.user}:${today}`);

    return { userId: String(log.user), breakId: String(activeBreak._id), breakType: activeBreak.breakType };
}

async function endBreaksByCategory(breakTypes) {
    const today = getISTDateString();
    const userIds = await getTodayClockedInUserIds(today);
    if (!userIds.length) {
        return { processedCount: 0, details: [] };
    }

    const logs = await AttendanceLog.find({
        user: { $in: userIds },
        attendanceDate: today,
    }).lean();

    const logIds = logs.map((log) => log._id);
    const activeBreaks = await BreakLog.find({
        attendanceLog: { $in: logIds },
        endTime: null,
        breakType: { $in: breakTypes },
    }).lean();

    const logById = new Map(logs.map((log) => [String(log._id), log]));
    const details = [];

    for (const activeBreak of activeBreaks) {
        const log = logById.get(String(activeBreak.attendanceLog));
        if (!log) continue;
        try {
            const result = await endSingleActiveBreak(activeBreak, log);
            details.push({ ...result, success: true });
        } catch (err) {
            details.push({
                breakId: String(activeBreak._id),
                success: false,
                error: err.message,
            });
        }
    }

    cacheService.invalidateDashboard(today);
    cache.deletePattern('dashboard-summary:*');

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('attendance_log_updated', {
                attendanceDate: today,
                timestamp: getISTNow().toISOString(),
                message: 'Bulk break action completed.',
            });
            io.emit('live_attendance_refreshed', { date: today });
        }
    } catch (_) {
        /* optional */
    }

    return {
        processedCount: details.filter((d) => d.success).length,
        failedCount: details.filter((d) => !d.success).length,
        details,
    };
}

async function refreshLiveAttendance() {
    const today = getISTDateString();
    cacheService.invalidateDashboard(today);
    cacheService.invalidateAttendance(null, today);
    cache.deletePattern('dashboard-summary:*');

    const overview = await getLiveAttendanceOverview({ leaveRange: 'today' });

    try {
        const { getIO } = require('../socketManager');
        const io = getIO();
        if (io) {
            io.emit('live_attendance_refreshed', {
                date: today,
                counts: overview.counts,
                lastUpdated: overview.lastUpdated,
            });
        }
    } catch (_) {
        /* optional */
    }

    return {
        processedCount: 1,
        overview: {
            counts: overview.counts,
            lastUpdated: overview.lastUpdated,
        },
    };
}

async function executeBulkAction(action, performedByUserId) {
    if (!VALID_ACTIONS.has(action)) {
        const error = new Error(`Invalid action: ${action}`);
        error.statusCode = 400;
        throw error;
    }

    let result;

    switch (action) {
        case 'refresh_live_attendance':
            result = await refreshLiveAttendance();
            break;
        case 'stop_tea_breaks':
            result = await stopAllActiveTeaBreaks();
            cacheService.invalidateDashboard(getISTDateString());
            result = {
                processedCount: result.stoppedCount ?? 0,
                details: result.results ?? [],
            };
            break;
        case 'end_lunch_breaks':
            result = await endBreaksByCategory(['Paid']);
            break;
        case 'end_other_breaks':
            result = await endBreaksByCategory(['Unpaid', 'Extra']);
            break;
        case 'overwrite_tea_break_overruns':
            result = await clearTeaBreakOverruns();
            break;
        default:
            result = { processedCount: 0 };
    }

    try {
        const logAction = require('./logAction');
        await logAction(performedByUserId, 'BULK_ATTENDANCE_ACTION', {
            action,
            processedCount: result.processedCount ?? 0,
            details: `Bulk attendance action "${action}" executed.`,
        });
    } catch (_) {
        /* audit optional */
    }

    return {
        success: true,
        action,
        ...result,
    };
}

module.exports = {
    VALID_ACTIONS,
    getBulkActionPreview,
    executeBulkAction,
    getTeaBreakOverruns,
};
