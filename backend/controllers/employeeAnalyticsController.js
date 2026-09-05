/**
 * EMPLOYEE ANALYTICS CONTROLLER
 * 
 * Handles individual employee detailed analytics requests.
 * Provides comprehensive attendance data for a single employee.
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSummaryService = require('../services/AttendanceSummaryService');
const { getISTDateString } = require('../utils/istTime');
const analyticsCacheService = require('../services/analyticsCacheService');

/**
 * Get detailed analytics for a single employee
 * 
 * GET /api/analytics/employee/:employeeId
 * 
 * Query params:
 * - month: MM (01-12)
 * - year: YYYY
 * 
 * Returns:
 * - employeeInfo: Basic employee details
 * - summary: KPI metrics (present days, leave days, etc.)
 * - dailyLogs: Array of daily attendance records
 */
async function getEmployeeDetailedAnalytics(req, res) {
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query;
        
        // Validate employee ID
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID format'
            });
        }
        
        // Validate month and year
        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Month and year are required'
            });
        }
        
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);
        
        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({
                success: false,
                message: 'Invalid month. Must be between 01 and 12'
            });
        }
        
        if (yearNum < 2000 || yearNum > 2100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid year'
            });
        }
        
        // Fetch employee details
        const employee = await User.findById(employeeId)
            .select('fullName employeeCode department designation email joiningDate resignationDate')
            .populate('shiftGroup', 'name shiftType startTime endTime')
            .lean();
        
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        
        // Calculate date range for the month
        const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        
        // Build cache key from employeeId + month + year
        const cacheFilters = { 
            employeeId, 
            month: monthNum, 
            year: yearNum, 
            type: 'employee-detail' 
        };
        
        // CHECK CACHE FIRST
        const cachedResult = await analyticsCacheService.getCachedAnalytics(cacheFilters);
        if (cachedResult) {
            console.log('[employeeAnalyticsController] ✅ Returning cached employee analytics');
            return res.status(200).json({
                success: true,
                data: cachedResult,
                cached: true
            });
        }
        
        // Adjust date range if employee joined mid-month or resigned
        let effectiveStartDate = startDate;
        let effectiveEndDate = endDate;
        
        if (employee.joiningDate) {
            const joiningDateStr = getISTDateString(employee.joiningDate);
            if (joiningDateStr > startDate) {
                effectiveStartDate = joiningDateStr;
            }
        }
        
        if (employee.resignationDate) {
            const resignationDateStr = getISTDateString(employee.resignationDate);
            if (resignationDateStr < endDate) {
                effectiveEndDate = resignationDateStr;
            }
        }
        
        // Get attendance summary data (resolved status)
        const summaryData = await AttendanceSummaryService.getEmployeeAttendanceSummary(
            employeeId,
            effectiveStartDate,
            effectiveEndDate
        );
        
        // Fetch detailed attendance logs with sessions and breaks
        const detailedLogs = await AttendanceLog.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(employeeId),
                    attendanceDate: { $gte: effectiveStartDate, $lte: effectiveEndDate }
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
                    attendanceDate: 1,
                    clockInTime: 1,
                    clockOutTime: 1,
                    totalWorkingHours: 1,
                    paidBreakMinutesTaken: 1,
                    unpaidBreakMinutesTaken: 1,
                    attendanceStatus: 1,
                    isHalfDay: 1,
                    halfDayReasonCode: 1,
                    halfDayReasonText: 1,
                    overriddenByAdmin: 1,
                    sessions: 1,
                    breaks: 1,
                    // Calculate total break time in hours
                    totalBreakTime: {
                        $divide: [
                            { $add: [
                                { $ifNull: ['$paidBreakMinutesTaken', 0] },
                                { $ifNull: ['$unpaidBreakMinutesTaken', 0] }
                            ]},
                            60
                        ]
                    }
                }
            },
            { $sort: { attendanceDate: 1 } }
        ]);
        
        // Create a map of detailed logs for quick lookup
        const logsMap = new Map();
        detailedLogs.forEach(log => {
            logsMap.set(log.attendanceDate, log);
        });
        
        // Calculate KPI metrics
        const metrics = calculateEmployeeKPIs(summaryData, employee.shiftGroup);
        
        // Build daily logs with resolved status
        const dailyLogs = summaryData.map(day => {
            const detailedLog = logsMap.get(day.date);
            const netHours = day.totalWorkingHours || 0;
            
            // FIXED: Overtime per day = net hours beyond 8.5 required hours
            const REQUIRED_NET_HOURS = 8.5;
            const isPresent = day.finalStatus === 'On-time' || day.finalStatus === 'Late' || day.finalStatus === 'Half-day';
            const dailyOvertime = isPresent && netHours > REQUIRED_NET_HOURS ? netHours - REQUIRED_NET_HOURS : 0;
            
            return {
                date: day.date,
                clockIn: detailedLog?.clockInTime || null,
                clockOut: detailedLog?.clockOutTime || null,
                workedTime: netHours,
                breakTime: detailedLog?.totalBreakTime || 0,
                totalTime: netHours + (detailedLog?.totalBreakTime || 0),
                overtimeHours: Math.round(dailyOvertime * 100) / 100,
                dayType: determineDayType(day, detailedLog),
                status: day.finalStatus,
                isHalfDay: day.isHalfDay,
                halfDayReason: day.halfDayReasonText || null,
                overriddenByAdmin: day.overriddenByAdmin || false
            };
        });
        
        // Build response
        const response = {
            success: true,
            data: {
                employeeInfo: {
                    id: employee._id,
                    fullName: employee.fullName,
                    employeeCode: employee.employeeCode,
                    department: employee.department || 'N/A',
                    designation: employee.designation || 'N/A',
                    email: employee.email,
                    shiftGroup: employee.shiftGroup?.name || 'N/A',
                    shiftType: employee.shiftGroup?.shiftType || 'N/A'
                },
                summary: metrics,
                dailyLogs,
                dateRange: {
                    startDate: effectiveStartDate,
                    endDate: effectiveEndDate,
                    month: monthNum,
                    year: yearNum
                }
            }
        };
        
        // STORE IN CACHE after computing (TTL: 5 minutes = 300 seconds)
        await analyticsCacheService.setCachedAnalytics(cacheFilters, response.data, 300);
        
        res.json({
            ...response,
            cached: false
        });
        
    } catch (error) {
        console.error('[EmployeeAnalyticsController] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employee analytics',
            error: error.message
        });
    }
}

/**
 * Calculate KPI metrics for employee
 * 
 * @param {Array} summaryData - Attendance summary data
 * @param {Object} shiftGroup - Employee's shift group
 * @returns {Object} KPI metrics
 */
function calculateEmployeeKPIs(summaryData, shiftGroup) {
    let presentDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let fullDays = 0;
    let totalNetHours = 0;
    let overtimeHours = 0;
    let nonWorkingDays = 0;
    
    // CORRECTED: Required net working hours = 8.5 hours (510 minutes)
    // totalWorkingHours in DB is already NET (breaks subtracted)
    // Overtime = net hours worked beyond 8.5 hours
    const REQUIRED_NET_HOURS = 8.5;
    const halfDayThreshold = 4.5; // Hours threshold for half day classification
    
    summaryData.forEach(day => {
        const status = day.finalStatus;
        const hours = day.totalWorkingHours || 0;
        
        // Count based on resolved status
        if (status === 'On-time' || status === 'Late' || status === 'Half-day') {
            // Present day
            presentDays += 1;
            totalNetHours += hours;
            
            // FIXED: Overtime = net hours beyond 8.5 required hours
            if (hours > REQUIRED_NET_HOURS) {
                overtimeHours += (hours - REQUIRED_NET_HOURS);
            }
            
            // Determine if half day or full day
            if (day.isHalfDay || status === 'Half-day') {
                halfDays += 1;
            } else {
                fullDays += 1;
            }
        } else if (status === 'Leave' || status === 'Approved Leave') {
            leaveDays += 1;
        } else if (status === 'Absent') {
            absentDays += 1;
        } else if (status === 'Holiday' || status === 'Weekly Off' || status === 'Weekend') {
            nonWorkingDays += 1;
        }
    });
    
    // Calculate derived metrics
    const avgWorkingHours = presentDays > 0 ? totalNetHours / presentDays : 0;
    
    return {
        presentDays: Math.round(presentDays * 10) / 10,
        leaveDays: Math.round(leaveDays * 10) / 10,
        absentDays: Math.round(absentDays * 10) / 10,
        nonWorkingDays: Math.round(nonWorkingDays * 10) / 10,
        totalNetHours: Math.round(totalNetHours * 100) / 100,
        avgWorkingHours: Math.round(avgWorkingHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        halfDays: Math.round(halfDays * 10) / 10,
        fullDays: Math.round(fullDays * 10) / 10
    };
}

/**
 * Determine day type (Full Day / Half Day)
 * 
 * @param {Object} day - Summary day object
 * @param {Object} detailedLog - Detailed log object
 * @returns {string} Day type
 */
function determineDayType(day, detailedLog) {
    const hours = day.totalWorkingHours || 0;
    const halfDayThreshold = 6;
    const fullDayThreshold = 8;
    
    if (day.finalStatus === 'Holiday' || day.finalStatus === 'Weekly Off' || day.finalStatus === 'Weekend') {
        return 'Non-Working';
    }
    
    if (day.finalStatus === 'Leave' || day.finalStatus === 'Approved Leave') {
        return 'Leave';
    }
    
    if (day.finalStatus === 'Absent') {
        return 'Absent';
    }
    
    // CRITICAL: If the status is already marked as Half-day, respect that
    // This handles cases like late arrival marking half-day even with full hours
    if (day.finalStatus === 'Half-day' || day.isHalfDay) {
        return 'Half Day';
    }
    
    // For present days without half-day status, determine based on hours
    if (hours < halfDayThreshold) {
        return 'Half Day';
    } else if (hours >= fullDayThreshold) {
        return 'Full Day';
    } else {
        return 'Partial Day';
    }
}

module.exports = {
    getEmployeeDetailedAnalytics
};
