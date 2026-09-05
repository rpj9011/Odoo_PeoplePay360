/**
 * ATTENDANCE SUMMARY SERVICE
 * 
 * SINGLE SOURCE OF TRUTH for attendance summary logic.
 * Extracted from /api/attendance/summary route to be reusable across the application.
 * 
 * This service provides resolved attendance status for employees over a date range,
 * applying the same logic as the Admin Attendance Summary page.
 * 
 * STATUS PRECEDENCE (enforced by attendanceStatusResolver):
 * 1. Holiday
 * 2. Approved Leave
 * 3. Weekly Off (Saturday/Sunday based on policy)
 * 4. Present (has attendance sessions)
 * 5. Half-day (marked as half-day)
 * 6. Absent (working day with no attendance)
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const { resolveAttendanceStatus, generateDateRange } = require('../utils/attendanceStatusResolver');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');
const { getISTDateString, parseISTDate } = require('../utils/istTime');

/**
 * Get employee attendance summary with full status resolution
 * 
 * @param {string|ObjectId} employeeId - Employee user ID
 * @param {string|Date} startDate - Start date (YYYY-MM-DD or Date object)
 * @param {string|Date} endDate - End date (YYYY-MM-DD or Date object)
 * @param {Object} [sharedData=null] - Optional pre-fetched shared data to avoid duplicate queries
 * @param {Array} [sharedData.holidays] - Pre-fetched holidays array
 * @param {number} [sharedData.gracePeriodMinutes] - Pre-fetched grace period in minutes
 * @returns {Promise<Array>} Array of attendance summary objects with resolved status
 * 
 * Each object contains:
 * - date: 'YYYY-MM-DD'
 * - finalStatus: 'Present' | 'Half-day' | 'Absent' | 'Holiday' | 'Weekly Off' | 'Leave'
 * - isHalfDay: boolean
 * - isHoliday: boolean
 * - isWeeklyOff: boolean
 * - isLeave: boolean
 * - isAbsent: boolean
 * - halfDayReasonCode: string | null
 * - halfDayReasonText: string | null
 * - totalWorkingHours: number (in hours, includes admin overrides)
 */
async function getEmployeeAttendanceSummary(employeeId, startDate, endDate, sharedData = null) {
    // Normalize dates to YYYY-MM-DD format
    const startDateStr = typeof startDate === 'string' ? startDate : getISTDateString(startDate);
    const endDateStr = typeof endDate === 'string' ? endDate : getISTDateString(endDate);
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDateStr) || !dateRegex.test(endDateStr)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD.');
    }
    
    // Validate employee ID
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        throw new Error('Invalid employee ID format.');
    }
    
    const dateRange = generateDateRange(startDateStr, endDateStr);
    
    // Fetch all required data in parallel
    const [employee, logs, leaveRequests, userWithShift] = await Promise.all([
        // Fetch employee to get Saturday policy
        User.findById(employeeId).select('alternateSaturdayPolicy').lean(),
        
        // Fetch attendance logs for date range with sessions and breaks
        AttendanceLog.aggregate([
            { 
                $match: { 
                    user: new mongoose.Types.ObjectId(employeeId), 
                    attendanceDate: { $gte: startDateStr, $lte: endDateStr } 
                } 
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'user',
                    foreignField: '_id',
                    as: 'userData'
                }
            },
            {
                $unwind: {
                    path: '$userData',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'shiftgroups',
                    localField: 'userData.shiftGroup',
                    foreignField: '_id',
                    as: 'shiftGroupData'
                }
            },
            {
                $unwind: {
                    path: '$shiftGroupData',
                    preserveNullAndEmptyArrays: true
                }
            },
            { 
                $lookup: { 
                    from: 'attendancesessions', 
                    localField: '_id', 
                    foreignField: 'attendanceLog', 
                    as: 'sessions' 
                } 
            },
            { 
                $lookup: { 
                    from: 'breaklogs', 
                    localField: '_id', 
                    foreignField: 'attendanceLog', 
                    as: 'breaks' 
                } 
            },
            { 
                $project: { 
                    _id: 1, 
                    attendanceDate: 1, 
                    attendanceStatus: 1,
                    clockInTime: 1, 
                    clockOutTime: 1, 
                    notes: 1, 
                    isLate: 1,
                    isHalfDay: 1,
                    halfDayReasonCode: 1,
                    halfDayReasonText: 1,
                    halfDaySource: 1,
                    overriddenByAdmin: 1,
                    lateMinutes: 1,
                    totalWorkingHours: 1,
                    leaveRequest: 1,
                    user: {
                        _id: '$userData._id',
                        shiftGroup: {
                            _id: '$shiftGroupData._id',
                            startTime: '$shiftGroupData.startTime'
                        }
                    },
                    sessions: { 
                        $map: { 
                            input: "$sessions", 
                            as: "s", 
                            in: { 
                                startTime: "$$s.startTime", 
                                endTime: "$$s.endTime" 
                            } 
                        } 
                    }
                } 
            },
            { $sort: { attendanceDate: 1 } }
        ]),
        
        // Fetch all approved leave requests for the date range
        LeaveRequest.find({
            employee: new mongoose.Types.ObjectId(employeeId),
            status: 'Approved',
            leaveDates: {
                $elemMatch: {
                    $gte: parseISTDate(startDateStr),
                    $lte: parseISTDate(endDateStr + 'T23:59:59+05:30')
                }
            }
        }).sort({ createdAt: 1 }).lean(),
        
        // Fetch user with shiftGroup for lateMinutes recalculation
        User.findById(employeeId).populate('shiftGroup').lean()
    ]);
    
    // Use shared data if available, otherwise fetch
    const holidays = sharedData?.holidays || await (async () => {
        const startDateIST = parseISTDate(startDateStr);
        const endDateIST = parseISTDate(endDateStr);
        return Holiday.find({
            date: {
                $gte: startDateIST,
                $lte: endDateIST
            },
            isTentative: { $ne: true }
        }).sort({ date: 1 }).lean();
    })();
    
    const gracePeriodMinutes = sharedData?.gracePeriodMinutes !== undefined 
        ? sharedData.gracePeriodMinutes 
        : await getGracePeriodMinutes();
    
    // Validate employee exists
    if (!employee) {
        throw new Error(`Employee not found for ID: ${employeeId}`);
    }
    
    // Get Saturday policy (from User.alternateSaturdayPolicy field)
    let saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
    
    // Defensive check: Validate saturdayPolicy value
    const validPolicies = ['Week 1 & 3 Off', 'Week 2 & 4 Off', 'All Saturdays Working', 'All Saturdays Off'];
    if (!validPolicies.includes(saturdayPolicy)) {
        console.warn(`[AttendanceSummaryService] Invalid saturdayPolicy for userId ${employeeId}: ${saturdayPolicy}, defaulting to 'All Saturdays Working'`);
        saturdayPolicy = 'All Saturdays Working';
    }
    
    // Create maps for quick lookup
    const logsMap = new Map();
    logs.forEach(log => {
        logsMap.set(log.attendanceDate, log);
    });
    
    const leaveRequestsMap = new Map();
    // Only map leaves that are actually approved
    leaveRequests.forEach(leave => {
        if (!leave || leave.status !== 'Approved') {
            return; // Skip non-approved or null leaves
        }
        
        if (Array.isArray(leave.leaveDates) && leave.leaveDates.length > 0) {
            leave.leaveDates.forEach(leaveDate => {
                const leaveDateStr = getISTDateString(leaveDate);
                if (leaveDateStr >= startDateStr && leaveDateStr <= endDateStr) {
                    if (!leaveRequestsMap.has(leaveDateStr)) {
                        leaveRequestsMap.set(leaveDateStr, leave);
                    }
                }
            });
        }
    });
    
    // Clean up attendance logs that reference deleted leaves
    const validLeaveIds = new Set(leaveRequests.map(l => l._id.toString()));
    
    for (const log of logs) {
        const leaveRefId = log.leaveRequest?.toString();
        const hasOrphanedLeaveRef = leaveRefId && !validLeaveIds.has(leaveRefId);
        const hasLeaveStatusButNoLeave = log.attendanceStatus === 'Leave' && !leaveRequestsMap.has(log.attendanceDate);
        
        if (hasOrphanedLeaveRef || hasLeaveStatusButNoLeave) {
            // Clean up the log object for this response
            log.leaveRequest = null;
            if (!log.clockInTime && !log.clockOutTime && log.attendanceStatus === 'Leave') {
                log.attendanceStatus = 'Absent';
                log.isLate = false;
                log.isHalfDay = false;
                log.lateMinutes = 0;
            }
        }
    }
    
    // Process each date in the range and resolve status
    const resolvedLogs = dateRange.map(attendanceDate => {
        const log = logsMap.get(attendanceDate) || null;
        let leaveRequest = leaveRequestsMap.get(attendanceDate) || null;
        
        // If log has leaveRequest reference, verify it's still valid
        if (log && log.leaveRequest && !leaveRequest) {
            leaveRequest = null; // Don't use the orphaned reference
        }
        
        const statusInfo = resolveAttendanceStatus({
            attendanceDate,
            attendanceLog: log,
            holidays: holidays || [],
            leaveRequest,
            saturdayPolicy,
            gracePeriodMinutes
        });
        
        // Handle half-day leave with no check-in
        let effectiveLeaveInfo = statusInfo.leaveInfo;
        const isHalfDayLeaveDoc = leaveRequest && (leaveRequest.leaveType === 'Half Day - First Half' || leaveRequest.leaveType === 'Half Day - Second Half');
        const wasVoidedByLeaveApproval = log?.notes && String(log.notes).includes('AUTO-VOID');
        const hasActualCheckIn = log && log.clockInTime != null && !wasVoidedByLeaveApproval;
        const hasNoCheckIn = !log || (log.clockInTime == null && !wasVoidedByLeaveApproval);
        
        if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasNoCheckIn) {
            effectiveLeaveInfo = {
                ...effectiveLeaveInfo,
                leaveType: 'Full Day',
                requestType: 'Loss of Pay',
            };
        } else if (effectiveLeaveInfo && isHalfDayLeaveDoc && hasActualCheckIn && leaveRequest.autoConvertedToLOP) {
            effectiveLeaveInfo = {
                ...effectiveLeaveInfo,
                leaveType: leaveRequest.originalLeaveType || leaveRequest.leaveType,
                requestType: leaveRequest.originalRequestType || 'Planned',
            };
        }
        const effectiveIsHalfDayLeave = effectiveLeaveInfo && (effectiveLeaveInfo.leaveType === 'Half Day - First Half' || effectiveLeaveInfo.leaveType === 'Half Day - Second Half');
        
        // Build simplified response object for probation tracker
        return {
            date: attendanceDate,
            finalStatus: statusInfo.status,
            isHalfDay: statusInfo.isLeave ? effectiveIsHalfDayLeave : statusInfo.isHalfDay,
            isHoliday: statusInfo.isHoliday,
            isWeeklyOff: statusInfo.isWeeklyOff,
            isLeave: statusInfo.isLeave,
            isAbsent: statusInfo.isAbsent,
            halfDayReasonCode: statusInfo.halfDayReasonCode || null,
            halfDayReasonText: statusInfo.halfDayReason || null,
            overriddenByAdmin: statusInfo.overriddenByAdmin || false,
            totalWorkingHours: log?.totalWorkingHours || 0  // Include working hours for Analytics
        };
    });
    
    return resolvedLogs;
}

/**
 * Fetch holidays for a date range
 * 
 * @param {string|Date} startDate - Start date (YYYY-MM-DD or Date object)
 * @param {string|Date} endDate - End date (YYYY-MM-DD or Date object)
 * @returns {Promise<Array>} Array of holiday objects
 */
async function fetchHolidaysForDateRange(startDate, endDate) {
    const startDateStr = typeof startDate === 'string' ? startDate : getISTDateString(startDate);
    const endDateStr = typeof endDate === 'string' ? endDate : getISTDateString(endDate);
    
    const startDateIST = parseISTDate(startDateStr);
    const endDateIST = parseISTDate(endDateStr);
    
    const holidays = await Holiday.find({
        date: {
            $gte: startDateIST,
            $lte: endDateIST
        },
        isTentative: { $ne: true }
    }).sort({ date: 1 }).lean();
    
    return holidays;
}

module.exports = {
    getEmployeeAttendanceSummary,
    fetchHolidaysForDateRange
};
