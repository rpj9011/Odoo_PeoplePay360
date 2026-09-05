/**
 * ATTENDANCE STATUS RESOLVER
 * 
 * SINGLE SOURCE OF TRUTH for attendance status resolution.
 * This utility enforces strict precedence rules and must be used by ALL attendance APIs.
 * 
 * STATUS PRECEDENCE (highest to lowest):
 * 1. Holiday
 * 2. Approved Leave
 * 3. Weekly Off (Saturday/Sunday based on policy)
 * 4. Present (has attendance sessions)
 * 5. Half-day (marked as half-day)
 * 6. Absent (working day with no attendance)
 * 
 * CRITICAL: Frontend MUST NEVER override or recalculate status.
 */

const { parseISTDate, getISTDateString, getISTDateParts } = require('./istTime');
const LeavePolicyService = require('../services/LeavePolicyService');

/**
 * Check if a date is a holiday
 * @param {Date|string} date - Date to check (IST)
 * @param {Array} holidays - Array of holiday objects with { date, name, isTentative }
 * @returns {Object|null} Holiday object if found, null otherwise
 */
function getHolidayForDate(date, holidays = []) {
    if (!date || !Array.isArray(holidays)) return null;
    
    const dateStr = getISTDateString(date);
    return holidays.find(h => {
        if (!h.date || h.isTentative) return false;
        const holidayDateStr = getISTDateString(h.date);
        return holidayDateStr === dateStr;
    }) || null;
}

/**
 * Check if a date is a weekly off (Saturday based on policy or Sunday)
 * @param {Date|string} date - Date to check (IST)
 * @param {string} saturdayPolicy - Saturday policy from employee (from User.alternateSaturdayPolicy)
 * @returns {boolean} True if it's a weekly off day
 */
function isWeeklyOff(date, saturdayPolicy = 'All Saturdays Working') {
    if (!date) {
        console.warn('[isWeeklyOff] Date is missing');
        return false;
    }
    
    try {
        // Get day of week using IST date
        const istDate = parseISTDate(getISTDateString(date));
        // Get day of week in IST timezone context
        // Parse as IST midnight, then get day of week
        const dateStr = getISTDateString(istDate);
        const [year, month, day] = dateStr.split('-').map(Number);
        // Create a Date object using UTC constructor but representing IST date
        // Then get day of week
        const utcDate = new Date(Date.UTC(year, month - 1, day));
        const dayOfWeek = utcDate.getUTCDay(); // 0=Sunday, 6=Saturday
        
        // Sunday is always weekly off
        if (dayOfWeek === 0) {
            return true;
        }
        
        // Check Saturday policy using LeavePolicyService
        if (dayOfWeek === 6) {
            if (!saturdayPolicy || typeof saturdayPolicy !== 'string') {
                console.warn('[isWeeklyOff] Invalid saturdayPolicy:', saturdayPolicy);
                return false; // Default to working if policy is invalid
            }
            return LeavePolicyService.isSaturdayOff(parseISTDate(getISTDateString(date)), saturdayPolicy);
        }
        
        return false;
    } catch (error) {
        console.error('[isWeeklyOff] Error checking weekly off:', error);
        return false; // Default to working day on error
    }
}

/**
 * Resolve attendance status for a date with strict precedence
 * @param {Object} params - Parameters object
 * @param {string} params.attendanceDate - Date string (YYYY-MM-DD) in IST
 * @param {Object|null} params.attendanceLog - AttendanceLog document (if exists)
 * @param {Array} params.holidays - Array of holiday objects
 * @param {Object|null} params.leaveRequest - LeaveRequest document (if exists)
 * @param {string} params.saturdayPolicy - Employee's Saturday policy
 * @param {number} [params.gracePeriodMinutes] - Grace period from Setting (lateGraceMinutes). When provided, enforces: within grace + insufficient hours → Incomplete Hours; exceeds grace → Late Arrival.
 * @returns {Object} Resolved status object with all flags
 */
function resolveAttendanceStatus({
    attendanceDate,
    attendanceLog = null,
    holidays = [],
    leaveRequest = null,
    saturdayPolicy = 'All Saturdays Working',
    gracePeriodMinutes = null
}) {
    // Defensive validation
    if (!attendanceDate) {
        throw new Error('attendanceDate is required in resolveAttendanceStatus');
    }
    
    // Validate saturdayPolicy
    const validPolicies = ['Week 1 & 3 Off', 'Week 2 & 4 Off', 'All Saturdays Working', 'All Saturdays Off'];
    if (!saturdayPolicy || !validPolicies.includes(saturdayPolicy)) {
        console.warn(`[resolveAttendanceStatus] Invalid saturdayPolicy: ${saturdayPolicy}, defaulting to 'All Saturdays Working'`);
        saturdayPolicy = 'All Saturdays Working';
    }
    
    const date = parseISTDate(attendanceDate);
    const dateStr = getISTDateString(date);
    
    // Initialize flags
    let status = 'Absent'; // Default
    let isWorkingDay = true;
    let isHoliday = false;
    let isWeeklyOffFlag = false; // Renamed to avoid shadowing isWeeklyOff function
    let isLeave = false;
    let isAbsent = false;
    let isHalfDay = false;
    let statusReason = null;
    let halfDayReason = null;
    let leaveReason = null;
    
    // Check for holiday (HIGHEST PRIORITY)
    const holiday = getHolidayForDate(date, holidays);
    if (holiday) {
        status = 'Holiday';
        isHoliday = true;
        isWorkingDay = false;
        isAbsent = false;
        
        return {
            status,
            statusReason: `Holiday - ${holiday.name || 'Holiday'}`,
            isWorkingDay,
            isHoliday,
            isWeeklyOff: false,
            isLeave: false,
            isAbsent: false,
            isHalfDay: false,
            holidayInfo: {
                _id: holiday._id,
                name: holiday.name,
                date: holiday.date,
                isTentative: holiday.isTentative || false
            },
            leaveInfo: null
        };
    }
    
    // Check for approved leave (SECOND PRIORITY)
    // LeaveRequest model uses leaveDates array (not startDate/endDate)
    if (leaveRequest && leaveRequest.status === 'Approved') {
        // Check if this date is in the leaveDates array
        const isDateInLeave = Array.isArray(leaveRequest.leaveDates) && 
            leaveRequest.leaveDates.some(leaveDate => {
                const leaveDateStr = getISTDateString(leaveDate);
                return leaveDateStr === dateStr;
            });
        
        if (isDateInLeave) {
            status = 'Leave';
            isLeave = true;
            isAbsent = false;
            
            // Check if it's half-day leave
            const isHalfDayLeave = leaveRequest.leaveType && 
                (leaveRequest.leaveType.includes('Half Day') || 
                 leaveRequest.leaveType.includes('Half-day') ||
                 leaveRequest.leaveType === 'Half Day - First Half' ||
                 leaveRequest.leaveType === 'Half Day - Second Half');
            
            // Check if leave date is also a weekly off
            const leaveIsWeeklyOff = isWeeklyOff(date, saturdayPolicy);
            
            return {
                status,
                isWorkingDay: !leaveIsWeeklyOff, // Still check weekly off
                isHoliday: false,
                isWeeklyOff: leaveIsWeeklyOff,
                isLeave: true,
                isAbsent: false,
                isHalfDay: isHalfDayLeave,
                statusReason: isHalfDayLeave ? `Leave - ${leaveRequest.leaveType}` : `Leave - ${leaveRequest.requestType || 'Leave'}`,
                leaveReason: leaveRequest.reason || 'No reason provided',
                holidayInfo: null,
                leaveInfo: {
                    _id: leaveRequest._id,
                    requestType: leaveRequest.requestType,
                    leaveType: leaveRequest.leaveType,
                    status: leaveRequest.status,
                    reason: leaveRequest.reason || 'No reason provided',
                    leaveDates: leaveRequest.leaveDates
                }
            };
        }
    }
    
    // Check for weekly off (THIRD PRIORITY)
    // CRITICAL FIX: If employee worked on weekly off day, show "Present" instead of "Weekly Off"
    const weeklyOffFlag = isWeeklyOff(date, saturdayPolicy);
    
    // Check if employee has attendance log with sessions (meaning they worked)
    const hasSessions = attendanceLog && attendanceLog.sessions && 
                       Array.isArray(attendanceLog.sessions) && 
                       attendanceLog.sessions.length > 0;
    
    if (weeklyOffFlag && !hasSessions) {
        // It's a weekly off day AND employee didn't work → Weekly Off
        status = 'Weekly Off';
        isWeeklyOffFlag = true;
        isWorkingDay = false;
        isAbsent = false;
        
        // Determine reason for weekly off
        const dayOfWeek = parseISTDate(getISTDateString(date)).getUTCDay();
        let weeklyOffReason = 'Weekly Off';
        if (dayOfWeek === 0) {
            weeklyOffReason = 'Sunday - Weekly Off';
        } else if (dayOfWeek === 6) {
            // Saturday - check policy
            if (saturdayPolicy === 'All Saturdays Off') {
                weeklyOffReason = 'Saturday - All Saturdays Off';
            } else if (saturdayPolicy === 'Week 1 & 3 Off' || saturdayPolicy === 'Week 2 & 4 Off') {
                weeklyOffReason = `Saturday - ${saturdayPolicy}`;
            }
        }
        
        return {
            status,
            statusReason: weeklyOffReason,
            isWorkingDay: false,
            isHoliday: false,
            isWeeklyOff: true,
            isLeave: false,
            isAbsent: false,
            isHalfDay: false,
            holidayInfo: null,
            leaveInfo: null
        };
    }
    // If weeklyOffFlag is true BUT hasSessions is true, skip weekly off status
    // and continue to check attendance log (employee worked on weekly off day → Present)
    
    // Check attendance log (if exists)
    if (attendanceLog) {
        // OVERRIDE GUARD: When admin has explicitly overridden this log, trust the stored
        // status unconditionally. Never recalculate from sessions. The stored attendanceStatus,
        // isHalfDay, overrideType, and overrideReason are the source of truth.
        if (attendanceLog.overriddenByAdmin === true) {
            return {
                status: attendanceLog.attendanceStatus || 'On-time',
                statusReason: attendanceLog.overrideReason
                    ? `Admin override: ${attendanceLog.overrideReason}`
                    : 'Admin override applied',
                halfDayReason: attendanceLog.isHalfDay
                    ? (attendanceLog.halfDayReasonText || attendanceLog.overrideReason || 'Admin override')
                    : null,
                halfDayReasonCode: attendanceLog.isHalfDay
                    ? (attendanceLog.halfDayReasonCode || 'MANUAL_ADMIN')
                    : null,
                halfDaySource: attendanceLog.halfDaySource || null,
                overriddenByAdmin: true,
                isWorkingDay: true,
                isHoliday: false,
                isWeeklyOff: false,
                isLeave: false,
                isAbsent: attendanceLog.attendanceStatus === 'Absent',
                isHalfDay: attendanceLog.isHalfDay || false,
                holidayInfo: null,
                leaveInfo: null
            };
        }
        
        // hasSessions already checked above (line 207-209), reuse it
        
        // Check if log has sessions OR if it's an override case (log exists but might not have sessions yet)
        // Also handle case where log exists but sessions array is empty
        if (hasSessions || (attendanceLog && !attendanceLog.overriddenByAdmin)) {
            // Has attendance log - use log status or determine from log
            let halfDayReason = null;
            let halfDayReasonCode = null;
            
            // If log exists but no sessions, still process based on log status
            // This handles cases like admin overrides or manual log creation
            if (!hasSessions && attendanceLog.attendanceStatus) {
                // No sessions but log exists - use stored status
                status = attendanceLog.attendanceStatus;
                isHalfDay = attendanceLog.isHalfDay || false;
                
                if (isHalfDay && attendanceLog.halfDayReasonText) {
                    halfDayReason = attendanceLog.halfDayReasonText;
                    halfDayReasonCode = attendanceLog.halfDayReasonCode || null;
                }
            } else if (hasSessions) {
                // Has sessions - normal processing
                    // NEW SHIFT MODEL: Use elapsed shift time (clockOutTime - clockInTime) for attendance status
                    // Policy: < 5 hrs elapsed = Absent; >= 5 hrs AND < 9 hrs elapsed = Half-day; >= 9 hrs elapsed = Full day
                    const { MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY, MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY } = require('../config/shiftPolicy');
                    
                    // Calculate elapsed shift time (includes breaks)
                    const shiftEnded = !!(attendanceLog.clockInTime && attendanceLog.clockOutTime);
                    let elapsedShiftHours = null;
                    if (shiftEnded) {
                        const elapsedShiftMinutes = (new Date(attendanceLog.clockOutTime) - new Date(attendanceLog.clockInTime)) / (1000 * 60);
                        elapsedShiftHours = elapsedShiftMinutes / 60;
                    }
                    
                    // Shift ended with 0 elapsed (instant in/out) counts as checked out — not still working
                    const hasCheckedOut = shiftEnded;
                    const belowHalfDayMinimum = hasCheckedOut && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY; // < 5 hrs elapsed (includes 0)
                    const hasHalfDayHours = hasCheckedOut && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY && elapsedShiftHours < MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY; // 5 to < 9 hrs elapsed
                    const hasSufficient = elapsedShiftHours != null && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY; // >= 9 hrs elapsed
                    const withinGrace = gracePeriodMinutes != null && (attendanceLog.lateMinutes || 0) <= gracePeriodMinutes;
                
                // PRIORITY 0: Elapsed shift time < 5 hrs → Absent
                if (belowHalfDayMinimum) {
                    status = 'Absent';
                    isHalfDay = false;
                    isAbsent = true;
                    halfDayReason = `Less than ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hours total shift time (${elapsedShiftHours.toFixed(1)} hours elapsed). Minimum ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_HALF_DAY} hrs for half-day, ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hrs for full day.`;
                    halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                } else if (withinGrace && hasSufficient) {
                // PRIORITY 1: If within grace period AND sufficient hours → On-time (NOT half-day)
                    // Should be On-time, not Half-day
                    status = 'On-time';
                    isHalfDay = false;
                    halfDayReason = null;
                    halfDayReasonCode = null;
                } else if (attendanceLog.isHalfDay || 
                    attendanceLog.attendanceStatus === 'Half-day' ||
                    attendanceLog.attendanceStatus === 'Half Day') {
                    // Only mark as half-day if conditions warrant it
                    status = 'Half-day';
                    isHalfDay = true;
                    
                    // PRIORITY 2: If insufficient hours AND within grace period, always use INSUFFICIENT_WORKING_HOURS
                    // This overrides any persisted "Late Arrival" reason when employee is within grace period
                    if (hasHalfDayHours && withinGrace) {
                        halfDayReason = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
                        halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                    } else if (hasHalfDayHours && !withinGrace) {
                        // 5 to < 9 hrs elapsed but beyond grace period - use insufficient hours reason
                        halfDayReason = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
                        halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                    } else if (attendanceLog.halfDayReasonText && !hasHalfDayHours) {
                        // Use persisted reason only if NOT insufficient hours AND beyond grace period
                        // Check if persisted reason is LATE_LOGIN and if it's actually beyond grace period
                        const persistedIsLate = (attendanceLog.halfDayReasonCode || '') === 'LATE_LOGIN';
                        if (persistedIsLate && withinGrace) {
                            // Persisted as LATE_LOGIN but actually within grace period - should not be late
                            // This handles cases where stored data is incorrect
                            if (hasSufficient) {
                                // Should be On-time, not Half-day
                                status = 'On-time';
                                isHalfDay = false;
                                halfDayReason = null;
                                halfDayReasonCode = null;
                            } else {
                                // Insufficient hours - use that reason
                                halfDayReason = `Insufficient shift time (${elapsedShiftHours.toFixed(1)} hours elapsed, minimum required: ${MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY} hours for full day)`;
                                halfDayReasonCode = 'INSUFFICIENT_WORKING_HOURS';
                            }
                        } else {
                            // Use persisted reason (EARLY_LOGOUT, MANUAL_ADMIN, etc.)
                            halfDayReason = attendanceLog.halfDayReasonText;
                            halfDayReasonCode = attendanceLog.halfDayReasonCode || null;
                        }
                    } else {
                        // Fallback: Determine reason from available data
                        if (gracePeriodMinutes != null && (attendanceLog.lateMinutes || 0) > gracePeriodMinutes) {
                            // Beyond grace period
                            halfDayReason = `Late arrival (${Math.round(attendanceLog.lateMinutes)} minutes late)`;
                            halfDayReasonCode = 'LATE_LOGIN';
                        } else if (attendanceLog.lateMinutes > 0 && gracePeriodMinutes == null) {
                            halfDayReason = `Late arrival (${Math.round(attendanceLog.lateMinutes)} minutes late)`;
                            halfDayReasonCode = 'LATE_LOGIN';
                        } else if (attendanceLog.autoLogoutReason) {
                            halfDayReason = `Early checkout: ${attendanceLog.autoLogoutReason}`;
                            halfDayReasonCode = 'EARLY_LOGOUT';
                        } else if (attendanceLog.logoutType === 'Manual' || attendanceLog.halfDaySource === 'MANUAL') {
                            halfDayReason = attendanceLog.overrideReason || 'Manual half-day marking';
                            halfDayReasonCode = 'MANUAL_ADMIN';
                        } else {
                            halfDayReason = 'Half-day marked';
                            halfDayReasonCode = null;
                        }
                    }
                } else if (attendanceLog.attendanceStatus) {
                    // Use existing status from log, but verify it's correct
                    // CRITICAL: If within grace period AND sufficient hours, should be On-time, not Late or Half-day
                    const { MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY } = require('../config/shiftPolicy');
                    
                    // Calculate elapsed shift time (includes breaks)
                    let elapsedShiftHours = null;
                    if (attendanceLog.clockInTime && attendanceLog.clockOutTime) {
                        const elapsedShiftMinutes = (new Date(attendanceLog.clockOutTime) - new Date(attendanceLog.clockInTime)) / (1000 * 60);
                        elapsedShiftHours = elapsedShiftMinutes / 60;
                    }
                    
                    const hasSufficient = elapsedShiftHours != null && elapsedShiftHours >= MINIMUM_ELAPSED_SHIFT_HOURS_FOR_FULL_DAY;
                    const withinGrace = gracePeriodMinutes != null && (attendanceLog.lateMinutes || 0) <= gracePeriodMinutes;
                    
                    if (withinGrace && hasSufficient && (attendanceLog.attendanceStatus === 'Late' || attendanceLog.attendanceStatus === 'Half-day')) {
                        // Stored status is incorrect - should be On-time
                        status = 'On-time';
                        isHalfDay = false;
                        halfDayReason = null;
                        halfDayReasonCode = null;
                    } else {
                        // Use existing status from log (Present, Late, etc.)
                        status = attendanceLog.attendanceStatus;
                        if (attendanceLog.attendanceStatus === 'Late' && attendanceLog.lateMinutes > 0) {
                            halfDayReason = `Late arrival (${Math.round(attendanceLog.lateMinutes)} minutes late)`;
                        }
                    }
                } else {
                    status = 'Present';
                }
            }
            
            isAbsent = (status === 'Absent');
            
            // Defensive assertion: Half-day must have reason
            if (isHalfDay && !halfDayReason) {
                console.warn(`[resolveAttendanceStatus] Half-day status but no reason found for date ${attendanceDate}`, {
                    attendanceLogId: attendanceLog._id,
                    hasPersistedReason: !!attendanceLog.halfDayReasonText
                });
                halfDayReason = 'Half-day marked (reason not specified)';
            }
            
            return {
                status,
                statusReason: halfDayReason || (attendanceLog.attendanceStatus === 'Late' ? `Late arrival (${Math.round(attendanceLog.lateMinutes || 0)} minutes)` : null),
                halfDayReason: halfDayReason,
                halfDayReasonCode: halfDayReasonCode,
                halfDaySource: attendanceLog.halfDaySource || null,
                overriddenByAdmin: attendanceLog.overriddenByAdmin || false,
                isWorkingDay: true,
                isHoliday: false,
                isWeeklyOff: false,
                isLeave: false,
                isAbsent: isAbsent,
                isHalfDay: isHalfDay || false,
                holidayInfo: null,
                leaveInfo: null
            };
        }
    }
    
    // No log, no holiday, no leave, not weekly off = Absent (only on working days)
    const weeklyOffCheck = isWeeklyOff(date, saturdayPolicy);
    if (isWorkingDay && !isHoliday && !weeklyOffCheck && !isLeave && !attendanceLog) {
        status = 'Absent';
        isAbsent = true;
        
        // Defensive assertion: Holiday/Leave/Weekly Off should never be Absent
        if (process.env.NODE_ENV === 'development') {
            if (isHoliday) {
                console.error('[resolveAttendanceStatus] CRITICAL: isHoliday=true but marking Absent!', {
                    attendanceDate,
                    isHoliday,
                    status
                });
            }
            if (isLeave) {
                console.error('[resolveAttendanceStatus] CRITICAL: isLeave=true but marking Absent!', {
                    attendanceDate,
                    isLeave,
                    status
                });
            }
            if (weeklyOffCheck) {
                console.error('[resolveAttendanceStatus] CRITICAL: isWeeklyOff=true but marking Absent!', {
                    attendanceDate,
                    weeklyOffCheck,
                    status
                });
            }
        }
        
        return {
            status,
            statusReason: 'No attendance logged',
            isWorkingDay: true,
            isHoliday: false,
            isWeeklyOff: false,
            isLeave: false,
            isAbsent: true,
            isHalfDay: false,
            holidayInfo: null,
            leaveInfo: null
        };
    }
    
    // Fallback: Handle edge case where log exists but doesn't match any condition
    // This can happen with admin overrides or manual log creation
    if (attendanceLog) {
        // Log exists but didn't match previous conditions - use stored status
        const logStatus = attendanceLog.attendanceStatus || 'Present';
        
        console.warn('[resolveAttendanceStatus] Using fallback with existing log', {
            attendanceDate,
            logId: attendanceLog._id,
            storedStatus: logStatus,
            hasSessions: !!(attendanceLog.sessions && Array.isArray(attendanceLog.sessions) && attendanceLog.sessions.length > 0),
            isHoliday,
            weeklyOffCheck: isWeeklyOff(date, saturdayPolicy),
            isLeave
        });
        
        return {
            status: logStatus,
            statusReason: attendanceLog.halfDayReasonText || (attendanceLog.overrideReason ? `Admin override: ${attendanceLog.overrideReason}` : null),
            halfDayReason: attendanceLog.halfDayReasonText || null,
            halfDayReasonCode: attendanceLog.halfDayReasonCode || null,
            halfDaySource: attendanceLog.halfDaySource || null,
            overriddenByAdmin: attendanceLog.overriddenByAdmin || false,
            isWorkingDay: true,
            isHoliday: false,
            isWeeklyOff: false,
            isLeave: false,
            isAbsent: logStatus === 'Absent',
            isHalfDay: attendanceLog.isHalfDay || false,
            holidayInfo: null,
            leaveInfo: null
        };
    }
    
    // True fallback - no log, no holiday, no leave, not weekly off = Absent
    console.warn('[resolveAttendanceStatus] Reached true fallback case (no log)', {
        attendanceDate,
        hasLog: false,
        isHoliday,
        weeklyOffCheck: isWeeklyOff(date, saturdayPolicy),
        isLeave
    });
    
    return {
        status: 'Absent',
        statusReason: 'No attendance logged',
        isWorkingDay: true,
        isHoliday: false,
        isWeeklyOff: false,
        isLeave: false,
        isAbsent: true,
        isHalfDay: false,
        holidayInfo: null,
        leaveInfo: null
    };
}

/**
 * Generate all dates in a range (IST)
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Array<string>} Array of date strings in YYYY-MM-DD format
 */
function generateDateRange(startDate, endDate) {
    const dates = [];
    const start = parseISTDate(startDate);
    const end = parseISTDate(endDate);
    
    let current = new Date(start);
    while (current <= end) {
        dates.push(getISTDateString(current));
        current.setDate(current.getDate() + 1);
    }
    
    return dates;
}

module.exports = {
    resolveAttendanceStatus,
    generateDateRange,
    getHolidayForDate,
    isWeeklyOff
};

