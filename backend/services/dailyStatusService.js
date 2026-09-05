// backend/services/dailyStatusService.js
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const BreakLog = require('../models/BreakLog');
const ExtraBreakRequest = require('../models/ExtraBreakRequest');
const { getShiftDateTimeIST } = require('../utils/istTime');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');
const {
    SHIFT_WORKING_MINUTES,
    PAID_BREAK_ALLOWANCE_MINUTES,
    MINIMUM_WORKING_HOURS,
    MINIMUM_HOURS_FOR_HALF_DAY,
    MINIMUM_TOTAL_HOURS_FOR_HALF_DAY,
    HALF_DAY_WORKING_MINUTES,
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY,
    MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY
} = require('../config/shiftPolicy');
const { calculateRequiredLogoutTime } = require('./requiredLogoutService');

const DEFAULT_OPTIONS = {
    includeSessions: true,
    includeBreaks: true,
    includeRequests: true,
    includeAutoBreak: true,
};

/**
 * Recalculates late/half-day status based on current clockInTime and elapsed shift time.
 * This is the SINGLE SOURCE OF TRUTH for derived attendance status.
 * 
 * NEW SHIFT MODEL:
 * Attendance status is based on elapsedShiftTime = clockOutTime - clockInTime (includes paid breaks)
 * Break duration does NOT reduce attendance thresholds
 * 
 * PRIORITY LOGIC:
 * 1. elapsedShiftTime < 5 hrs → Absent
 * 2. elapsedShiftTime >= 5 hrs AND < 9 hrs → Half-day
 * 3. elapsedShiftTime >= 9 hrs + within grace → On-time; beyond grace → Late or Half-day per lateArrivalMarksHalfDay
 * 
 * @param {Date} clockInTime - The actual clock-in time
 * @param {Object} shift - The user's shift object with startTime
 * @param {number} gracePeriodMinutes - Grace period in minutes (default: 30)
 * @param {number} elapsedShiftHours - Elapsed shift hours (clockOutTime - clockInTime, includes breaks) (optional, for complete status determination)
 * @param {boolean} lateArrivalMarksHalfDay - If true, late arrival marks half-day; if false, only late is recorded (default: false)
 * @returns {Object} { lateMinutes, isLate, isHalfDay, attendanceStatus, halfDayReasonCode, halfDayReasonText }
 */
const recalculateLateStatus = async (clockInTime, shift, gracePeriodMinutes = null, elapsedShiftHours = null, lateArrivalMarksHalfDay = false) => {
    if (!clockInTime || !shift || !shift.startTime) {
        return {
            lateMinutes: 0,
            isLate: false,
            isHalfDay: false,
            attendanceStatus: 'On-time'
        };
    }

    const clockIn = new Date(clockInTime);
    const shiftStartTime = getShiftDateTimeIST(clockIn, shift.startTime);
    const lateMinutes = Math.max(0, Math.floor((clockIn - shiftStartTime) / (1000 * 60)));

    let GRACE_PERIOD_MINUTES = gracePeriodMinutes;
    if (GRACE_PERIOD_MINUTES === null || GRACE_PERIOD_MINUTES === undefined) {
        GRACE_PERIOD_MINUTES = await getGracePeriodMinutes();
    }

    // FIXED PRIORITY LOGIC:
    // 1. Check if insufficient working hours (takes precedence over grace period)
    // 2. Check if exceeds grace period (only if working hours are sufficient)
    // 3. Otherwise, on-time

    let isLate = false;
    let isHalfDay = false;
    let attendanceStatus = 'On-time';
    let halfDayReasonCode = null;
    let halfDayReasonText = '';

    const withinGracePeriod = lateMinutes <= GRACE_PERIOD_MINUTES;
    // Shift ended when caller passed elapsed hours (including 0 for instant in/out)
    const hasCheckedOut = elapsedShiftHours !== null;
    // NEW MODEL: Use elapsed shift time (includes breaks) for status determination
    const hasFullDayHours = hasCheckedOut && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY; // >= 9 hrs elapsed
    const belowHalfDayMinimum = hasCheckedOut && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY; // < 5 hrs elapsed = Absent (includes 0)
    // Half-day: elapsed shift time >= 5 hrs AND < 9 hrs
    const hasHalfDayHours = elapsedShiftHours !== null && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY; // 5 hrs to < 9 hrs elapsed

    // RULE: Do not mark half-day/absent until checkout is done. If today and no checkout, always show Present (On-time).
    if (!hasCheckedOut) {
        isLate = !withinGracePeriod; // Keep late tracking for clock-out
        isHalfDay = false;
        attendanceStatus = 'On-time';
        halfDayReasonCode = null;
        halfDayReasonText = '';
    } else if (belowHalfDayMinimum) {
        // PRIORITY 1: Elapsed shift time less than 5 hrs → Absent
        isHalfDay = false;
        isLate = false;
        attendanceStatus = 'Absent';
        halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
        halfDayReasonText = `Less than ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hours total shift time (${elapsedShiftHours.toFixed(1)} hours elapsed). Minimum ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hrs for half-day, ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hrs for full day.`;
    } else if (hasHalfDayHours) {
        // PRIORITY 2: Elapsed shift time >= 5 hrs AND < 9 hrs → Half-day (insufficient for full day)
        isHalfDay = true;
        isLate = false;
        attendanceStatus = 'Half-day';
        halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
        halfDayReasonText = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
    } else if (!withinGracePeriod && hasFullDayHours) {
        // PRIORITY 2: Exceeds grace period (only if working hours are sufficient, i.e. checkout done)
        // When lateArrivalMarksHalfDay is false, only record late (do not mark half-day)
        isLate = true;
        if (lateArrivalMarksHalfDay) {
            isHalfDay = true;
            attendanceStatus = 'Half-day';
            halfDayReasonCode = 'LATE_LOGIN';
            const clockInTimeStr = clockInTime.toLocaleTimeString('en-US', {
                timeZone: 'Asia/Kolkata',
                hour12: true,
                hour: '2-digit',
                minute: '2-digit'
            });
            halfDayReasonText = `Late login beyond ${GRACE_PERIOD_MINUTES} min grace period (logged at ${clockInTimeStr}, ${lateMinutes} minutes late)`;
        } else {
            isHalfDay = false;
            attendanceStatus = 'On-time';
            halfDayReasonCode = null;
            halfDayReasonText = '';
        }
    } else {
        // PRIORITY 3: Within grace period and sufficient hours → On-time
        isLate = false;
        isHalfDay = false;
        attendanceStatus = 'On-time';
    }

    return {
        lateMinutes,
        isLate,
        isHalfDay,
        attendanceStatus,
        halfDayReasonCode,
        halfDayReasonText
    };
};

const buildBaseResponse = (options) => ({
    status: 'Not Clocked In',
    hasLog: false, // CRITICAL: Explicitly set to false to prevent stale UI state
    sessions: options.includeSessions ? [] : undefined,
    breaks: options.includeBreaks ? [] : undefined,
    shift: null,
    attendanceLog: null, // CRITICAL: Must be null when no log exists
    calculatedLogoutTime: null,
    pendingExtraBreakRequest: options.includeRequests ? null : undefined,
    approvedExtraBreak: options.includeRequests ? null : undefined,
    autoBreak: options.includeAutoBreak ? null : undefined,
    activeBreak: options.includeBreaks ? null : undefined,
});

/**
 * Maps attendance log data for response.
 * NOTE: isLate, isHalfDay, lateMinutes, and attendanceStatus are NOT included here
 * because they must be recalculated from clockInTime on every request.
 * See getUserDailyStatus for recalculation logic.
 */
const mapAttendanceLog = (attendanceLog) => ({
    penaltyMinutes: attendanceLog?.penaltyMinutes || 0,
    paidBreakMinutesTaken: attendanceLog?.paidBreakMinutesTaken || 0,
    unpaidBreakMinutesTaken: attendanceLog?.unpaidBreakMinutesTaken || 0,
    logoutType: attendanceLog?.logoutType || 'MANUAL',
    autoLogoutReason: attendanceLog?.autoLogoutReason || null,
    // CRITICAL: Do NOT include isLate, isHalfDay, lateMinutes, attendanceStatus here
    // These must be recalculated from clockInTime on every request
});

const mapAutoBreak = (autoBreakDoc) => autoBreakDoc ? ({
    id: autoBreakDoc._id,
    startTime: autoBreakDoc.startTime,
    type: autoBreakDoc.type,
    reason: autoBreakDoc.reason,
    duration: Math.floor((Date.now() - new Date(autoBreakDoc.startTime)) / (1000 * 60)),
}) : null;

const mapActiveBreak = (breakDoc) => breakDoc ? ({
    startTime: breakDoc.startTime,
    breakType: breakDoc.breakType,
    durationMinutes: Math.floor((Date.now() - new Date(breakDoc.startTime)) / (1000 * 60)),
}) : null;

/**
 * Calculate required logout time based on POLICY RULES (AUTHORITATIVE BACKEND CALCULATION)
 * 
 * POLICY:
 * - Shift working time: 8.5 hours (510 minutes)
 * - Allowed paid break: 30 minutes (included in shift)
 * - Required logout = clockInTime + working time + excess paid break + unpaid break
 * 
 * RULES:
 * 1. Base: clockInTime + 8.5 hours working time
 * 2. Paid break > 30 min → excess extends logout time
 * 3. All unpaid break time extends logout time
 * 
 * Returns both the logout time and breakdown metadata for UI display.
 * When approvedHalfDayLeave is true, base work = 5 hrs (300 min); otherwise full shift.
 */
const computeCalculatedLogoutTime = (sessions, breaks, attendanceLog, userShift, activeBreak = null, approvedHalfDayLeave = false) => {
    if (!sessions?.length || !userShift || !attendanceLog) {
        return null;
    }

    const firstClockInSession = sessions[0];
    const clockInTime = new Date(firstClockInSession.startTime);

    // Helper function to set time on a date (in IST)
    const setTime = (date, timeString) => {
        const [hours, minutes] = timeString.split(':').map(Number);
        return getShiftDateTimeIST(date, timeString);
    };

    // Helper function to add minutes to a date
    const addMinutes = (date, minutes) => {
        const newDate = new Date(date);
        newDate.setMinutes(newDate.getMinutes() + minutes);
        return newDate;
    };

    // ============================================
    // Calculate total break minutes from breaks array (AUTHORITATIVE SOURCE)
    // CRITICAL: Aggregate from breaks array instead of database field
    // This ensures we get the actual break durations, not capped/stale values
    // ============================================
    let paidBreakMinutesTaken = 0;
    let unpaidBreakMinutesTaken = 0;

    // Aggregate break minutes from breaks array (source of truth)
    if (breaks && Array.isArray(breaks)) {
        breaks.forEach(breakItem => {
            // Only count completed breaks (those with endTime)
            if (breakItem.endTime && breakItem.startTime) {
                const breakStart = new Date(breakItem.startTime);
                const breakEnd = new Date(breakItem.endTime);
                const durationMinutes = Math.round((breakEnd - breakStart) / (1000 * 60));

                // Handle both breakType and type for backward compatibility
                const breakType = (breakItem.breakType || breakItem.type || 'Unpaid').toString().trim();

                // Match breakType exactly (case-sensitive) as stored in database
                if (breakType === 'Paid') {
                    paidBreakMinutesTaken += durationMinutes;
                } else if (breakType === 'Unpaid' || breakType === 'Extra') {
                    unpaidBreakMinutesTaken += durationMinutes;
                }
            }
        });
    }

    // Fallback: If no breaks array provided or breaks array is empty, use database field (backward compatibility)
    // This ensures backward compatibility if breaks are not included in the query
    if ((!breaks || !Array.isArray(breaks) || breaks.length === 0) && paidBreakMinutesTaken === 0 && unpaidBreakMinutesTaken === 0) {
        paidBreakMinutesTaken = attendanceLog.paidBreakMinutesTaken || 0;
        unpaidBreakMinutesTaken = attendanceLog.unpaidBreakMinutesTaken || 0;
    }

    // Include active break duration if present (for real-time calculation)
    if (activeBreak && activeBreak.startTime) {
        const { getISTNow } = require('../utils/istTime');
        const now = getISTNow();
        const activeBreakStart = new Date(activeBreak.startTime);
        const activeBreakDurationMinutes = Math.floor((now - activeBreakStart) / (1000 * 60));
        const activeBreakType = (activeBreak.breakType || activeBreak.type || '').toString().trim();

        if (activeBreakType === 'Paid') {
            paidBreakMinutesTaken += activeBreakDurationMinutes;
        } else if (activeBreakType === 'Unpaid' || activeBreakType === 'Extra') {
            unpaidBreakMinutesTaken += activeBreakDurationMinutes;
        }
    }

    // ============================================
    // USE AUTHORITATIVE POLICY CALCULATION
    // Half-day leave: base work = 300 min; full day: shift working minutes
    // ============================================
    const baseWorkMinutes = approvedHalfDayLeave ? HALF_DAY_WORKING_MINUTES : SHIFT_WORKING_MINUTES;
    
    // Get attendance date for boundary calculation
    const { getISTDateString } = require('../utils/istTime');
    const attendanceDate = getISTDateString(clockInTime);
    
    const result = calculateRequiredLogoutTime({
        clockInTime,
        totalPaidBreakMinutes: paidBreakMinutesTaken,
        totalUnpaidBreakMinutes: unpaidBreakMinutesTaken,
        shift: userShift,
        attendanceDate,
        timezone: 'Asia/Kolkata'
    });

    if (!result) {
        return null;
    }

    const requiredLogoutTime = result.requiredLogoutTime;

    // Return both the time and breakdown for API responses
    return {
        requiredLogoutTime: requiredLogoutTime.toISOString(),
        breakdown: {
            ...result.breakdown,
            requiredLogoutTime: requiredLogoutTime.toISOString()
        }
    };
};

const getUserDailyStatus = async (userId, targetDate, options = {}) => {
    const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
    const response = buildBaseResponse(resolvedOptions);

    // PHASE 2 OPTIMIZATION: Parallelize independent queries
    // Batch 1: User + AttendanceLog (independent, can run in parallel)
    const [user, attendanceLog] = await Promise.all([
        User.findById(userId).populate('shiftGroup').lean(),
        AttendanceLog.findOne({ user: userId, attendanceDate: targetDate }).lean()
    ]);

    if (!user) {
        return response;
    }

    response.shift = user.shiftGroup || null;

    if (!attendanceLog) {
        // HARD RULE: When no attendance log exists, explicitly set all flags to false/null
        // This prevents ANY late/half-day logic from executing without a log
        // CRITICAL: Do NOT compute lateness based on shift start time alone
        response.hasLog = false;
        response.attendanceLog = null; // Must be null, not undefined
        response.sessions = resolvedOptions.includeSessions ? [] : undefined;
        response.breaks = resolvedOptions.includeBreaks ? [] : undefined;
        response.status = 'Not Clocked In';
        response.calculatedLogoutTime = null;
        // Ensure no late/half-day flags leak through
        // (already null from buildBaseResponse, but being explicit)
        return response;
    }

    // ONLY reach here if attendance log exists
    // Log exists - set hasLog to true and map attendance data
    response.hasLog = true;
    response.attendanceLog = mapAttendanceLog(attendanceLog);

    // CRITICAL: Recalculate late/half-day status from FIRST check-in time (not latest)
    // This ensures admin edits to clockInTime immediately affect the response
    // BUT: Use persisted half-day reason if admin override exists
    // CRITICAL FIX: Use first session's startTime as authoritative first check-in
    // Load first session to get authoritative first check-in time
    let firstCheckInTime = null;
    if (attendanceLog.clockInTime) {
        // First, try to get first session's startTime (most authoritative)
        try {
            const firstSession = await AttendanceSession.findOne({
                attendanceLog: attendanceLog._id
            }).sort({ startTime: 1 }).select('startTime').lean();

            if (firstSession && firstSession.startTime) {
                firstCheckInTime = new Date(firstSession.startTime);
            } else {
                // Fallback to stored clockInTime if no sessions found
                firstCheckInTime = new Date(attendanceLog.clockInTime);
            }
        } catch (err) {
            // If session query fails, fallback to stored clockInTime
            console.warn(`[getUserDailyStatus] Error loading first session, using clockInTime: ${err.message}`);
            firstCheckInTime = new Date(attendanceLog.clockInTime);
        }
    }

    if (firstCheckInTime && response.shift && response.shift.startTime) {
        // Calculate elapsed shift time (clockOutTime - clockInTime) for new shift model
        // This includes breaks and is used for attendance status determination
        let elapsedShiftHours = null;
        if (attendanceLog.clockInTime && attendanceLog.clockOutTime) {
            const elapsedShiftMinutes = (new Date(attendanceLog.clockOutTime) - new Date(attendanceLog.clockInTime)) / (1000 * 60);
            elapsedShiftHours = elapsedShiftMinutes / 60;
        }

        // Pass elapsed shift hours for accurate status determination
        // Only treat as true when explicitly true; missing/undefined/false => do not mark half-day for late
        const lateArrivalMarksHalfDay = user.featurePermissions?.lateArrivalMarksHalfDay === true;
        const recalculatedStatus = await recalculateLateStatus(
            firstCheckInTime,
            response.shift,
            null, // gracePeriodMinutes (will be fetched from settings)
            elapsedShiftHours, // Pass elapsed shift hours (includes breaks) for priority logic
            lateArrivalMarksHalfDay
        );
        // Override stored values with recalculated values
        response.attendanceLog.isLate = recalculatedStatus.isLate;
        response.attendanceLog.isHalfDay = recalculatedStatus.isHalfDay;
        response.attendanceLog.lateMinutes = recalculatedStatus.lateMinutes;
        response.attendanceLog.attendanceStatus = recalculatedStatus.attendanceStatus;

        // Include half-day reason: Use persisted if admin overridden, otherwise use recalculated
        if (attendanceLog.overriddenByAdmin && attendanceLog.halfDayReasonText) {
            // Admin override takes precedence
            response.attendanceLog.halfDayReasonCode = attendanceLog.halfDayReasonCode;
            response.attendanceLog.halfDayReasonText = attendanceLog.halfDayReasonText;
            response.attendanceLog.halfDaySource = attendanceLog.halfDaySource;
        } else if (recalculatedStatus.isHalfDay) {
            // Use recalculated reason for auto-detected half-day
            response.attendanceLog.halfDayReasonCode = recalculatedStatus.halfDayReasonCode;
            response.attendanceLog.halfDayReasonText = recalculatedStatus.halfDayReasonText;
            response.attendanceLog.halfDaySource = 'AUTO';
        } else if (attendanceLog.halfDayReasonText) {
            // Use persisted reason (may be from previous calculation)
            response.attendanceLog.halfDayReasonCode = attendanceLog.halfDayReasonCode;
            response.attendanceLog.halfDayReasonText = attendanceLog.halfDayReasonText;
            response.attendanceLog.halfDaySource = attendanceLog.halfDaySource;
        }

        // Include override fields
        response.attendanceLog.overriddenByAdmin = attendanceLog.overriddenByAdmin || false;
        response.attendanceLog.overriddenAt = attendanceLog.overriddenAt || null;
        response.attendanceLog.overriddenBy = attendanceLog.overriddenBy || null;
    } else {
        // Fallback if shift or clockInTime is missing
        response.attendanceLog.isLate = false;
        response.attendanceLog.isHalfDay = false;
        response.attendanceLog.lateMinutes = 0;
        response.attendanceLog.attendanceStatus = 'On-time';
        // Include persisted reason if exists
        response.attendanceLog.halfDayReasonCode = attendanceLog.halfDayReasonCode || null;
        response.attendanceLog.halfDayReasonText = attendanceLog.halfDayReasonText || '';
        response.attendanceLog.halfDaySource = attendanceLog.halfDaySource || null;
        response.attendanceLog.overriddenByAdmin = attendanceLog.overriddenByAdmin || false;
    }

    // PHASE 2 OPTIMIZATION: Parallelize independent queries
    // Batch 2: Sessions + Breaks + AutoBreak (independent if attendanceLog exists)
    let sessions = [];
    let breaks = [];
    let autoBreakDoc = null;

    if (resolvedOptions.includeSessions || resolvedOptions.includeBreaks || resolvedOptions.includeAutoBreak) {
        const batch2Promises = [];

        if (resolvedOptions.includeSessions) {
            batch2Promises.push(
                AttendanceSession.find({ attendanceLog: attendanceLog._id }).sort({ startTime: 1 }).lean()
            );
        } else {
            batch2Promises.push(Promise.resolve([]));
        }

        if (resolvedOptions.includeBreaks) {
            batch2Promises.push(
                BreakLog.find({ attendanceLog: attendanceLog._id }).sort({ startTime: 1 }).lean()
            );
        } else {
            batch2Promises.push(Promise.resolve([]));
        }

        if (resolvedOptions.includeAutoBreak) {
            batch2Promises.push(
                BreakLog.findOne({
                    userId,
                    endTime: null,
                    isAutoBreak: true,
                }).sort({ startTime: 1 }).lean()
            );
        } else {
            batch2Promises.push(Promise.resolve(null));
        }

        const [sessionsResult, breaksResult, autoBreakResult] = await Promise.all(batch2Promises);

        sessions = sessionsResult;
        breaks = breaksResult;
        autoBreakDoc = autoBreakResult;

        if (resolvedOptions.includeSessions) {
            response.sessions = sessions;
        }

        if (resolvedOptions.includeBreaks) {
            response.breaks = breaks;
            const activeBreakDoc = breaks.find(b => !b.endTime);
            response.activeBreak = mapActiveBreak(activeBreakDoc);
        }

        if (resolvedOptions.includeAutoBreak) {
            response.autoBreak = mapAutoBreak(autoBreakDoc);
        }
    }

    // PHASE 2 OPTIMIZATION: Parallelize independent queries
    // Batch 3: ExtraBreakRequests (independent, can run in parallel)
    if (resolvedOptions.includeRequests) {
        const [pendingRequest, approvedRequest] = await Promise.all([
            ExtraBreakRequest.findOne({
                user: userId,
                attendanceDate: targetDate,
                status: 'Pending',
            }).lean(),
            ExtraBreakRequest.findOne({
                user: userId,
                attendanceDate: targetDate,
                status: 'Approved',
                isUsed: false,
            }).lean()
        ]);
        response.pendingExtraBreakRequest = pendingRequest;
        response.approvedExtraBreak = approvedRequest;
    }

    const hasActiveSession = sessions.some(s => !s.endTime);
    const hasManualSessions = sessions.length > 0;
    const autoBreakActive = !!response.autoBreak;
    const hasAnyActiveBreak = !!response.activeBreak || autoBreakActive;

    if (hasAnyActiveBreak) {
        response.status = autoBreakActive ? 'On Auto-Break' : 'On Break';
    } else if (hasActiveSession) {
        response.status = 'Clocked In';
    } else if (hasManualSessions) {
        response.status = 'Clocked Out';
    } else {
        response.status = 'Not Clocked In';
    }

    // Pass activeBreak to the calculation function
    const logoutCalculation = computeCalculatedLogoutTime(sessions, breaks, response.attendanceLog, response.shift, response.activeBreak);

    if (logoutCalculation) {
        response.calculatedLogoutTime = logoutCalculation.requiredLogoutTime;
        response.logoutBreakdown = logoutCalculation.breakdown;
    } else {
        response.calculatedLogoutTime = null;
        response.logoutBreakdown = null;
    }

    return response;
};

module.exports = {
    getUserDailyStatus,
    computeCalculatedLogoutTime, // Export for testing
    recalculateLateStatus, // Export for use in admin routes
};

