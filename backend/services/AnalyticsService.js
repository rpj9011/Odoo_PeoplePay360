/**
 * ANALYTICS SERVICE V2 - REFACTORED
 * 
 * CRITICAL: Uses AttendanceSummaryService as SINGLE SOURCE OF TRUTH
 * 
 * Previous Issue:
 * - Analytics used raw AttendanceLog.attendanceStatus field
 * - Did not apply status resolution logic (holidays, weekly offs, etc.)
 * - Showed different counts than Attendance Summary Calendar
 * - Fetched totalWorkingHours separately from AttendanceLog
 * 
 * New Approach (V3 - Admin Override Support):
 * - Uses AttendanceSummaryService.getEmployeeAttendanceSummary()
 * - Calculates metrics from resolved finalStatus
 * - Uses totalWorkingHours from summary data (includes admin overrides)
 * - Matches Attendance Summary Calendar exactly
 * - Single source of truth for ALL attendance data including working hours
 * - Respects admin overrides automatically
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Shift = require('../models/Shift');
const AttendanceSummaryService = require('./AttendanceSummaryService');
const { getGracePeriodMinutes } = require('../utils/gracePeriod');

/**
 * Convert decimal hours to HH:MM format
 * 
 * @param {number} decimalHours - Hours in decimal format (e.g., 8.5)
 * @returns {string} Time in HH:MM format (e.g., "08:30")
 */
function formatHoursToHHMM(decimalHours) {
    if (!decimalHours || decimalHours < 0) return '00:00';
    
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Calculate attendance metrics for filtered employees
 * 
 * @param {Object} filters - Filter criteria
 * @param {string} filters.startDate - Start date (YYYY-MM-DD)
 * @param {string} filters.endDate - End date (YYYY-MM-DD)
 * @param {string} [filters.department] - Department filter
 * @param {string} [filters.location] - Location filter
 * @param {string} [filters.shiftType] - Shift type filter ('Fixed' | 'Flexible')
 * @param {string} [filters.employmentStatus] - Employment status filter ('Active' | 'Inactive')
 * @param {number} [filters.page=1] - Page number for pagination
 * @param {number} [filters.limit=50] - Records per page
 * 
 * @returns {Promise<Object>} Analytics result with summary and employee metrics
 */
async function calculateAttendanceMetrics(filters) {
    try {
        // Validate required parameters
        if (!filters.startDate || !filters.endDate) {
            throw new Error('Start date and end date are required');
        }
        
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(filters.startDate) || !dateRegex.test(filters.endDate)) {
            throw new Error('Invalid date format. Use YYYY-MM-DD');
        }
        
        // Validate date range
        if (filters.startDate > filters.endDate) {
            throw new Error('Start date must be before or equal to end date');
        }
        
        // Set pagination defaults
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.min(1000, Math.max(1, parseInt(filters.limit) || 50));
        const skip = (page - 1) * limit;
        
        // Build user filter query
        const userQuery = buildUserFilterQuery(filters);
        
        // CRITICAL: Only include ACTIVE employees
        userQuery.isActive = true;
        
        // Get filtered employee IDs
        let employeeQuery = User.find(userQuery).select('_id fullName employeeCode department designation');
        
        // Apply shift type filter if specified
        if (filters.shiftType) {
            const shifts = await Shift.find({ shiftType: filters.shiftType }).select('_id');
            const shiftIds = shifts.map(s => s._id);
            employeeQuery = employeeQuery.where('shiftGroup').in(shiftIds);
        }
        
        const employees = await employeeQuery.lean();
        
        if (employees.length === 0) {
            return {
                summary: {
                    totalEmployees: 0,
                    presentDays: 0,
                    leaveDays: 0,
                    absentDays: 0,
                    nonWorkingDays: 0,
                    attendancePercentage: 0,
                    totalNetHours: 0,
                    averageWorkingHours: 0,
                    overtimeHours: 0
                },
                employeeAnalytics: [],
                pagination: {
                    currentPage: page,
                    totalPages: 0,
                    totalRecords: 0,
                    limit
                }
            };
        }
        
        console.log(`[AnalyticsService V2] Processing ${employees.length} employees...`);
        
        // PERFORMANCE: Fetch shared data once for all employees
        // Previously fetched inside each getEmployeeAttendanceSummary call (N+1 problem)
        const [sharedHolidays, sharedGracePeriod] = await Promise.all([
            // Fetch holidays for the entire date range — same for all employees
            AttendanceSummaryService.fetchHolidaysForDateRange(filters.startDate, filters.endDate),
            
            // Fetch grace period from settings once — same for all employees
            getGracePeriodMinutes()
        ]);
        
        const sharedData = {
            holidays: sharedHolidays,
            gracePeriodMinutes: sharedGracePeriod
        };
        
        console.log(`[AnalyticsService V2] Shared data fetched: ${sharedHolidays.length} holidays, grace period: ${sharedGracePeriod}min`);
        
        // PERFORMANCE: Process all employees concurrently
        // All employee queries run simultaneously instead of waiting for each other
        const employeeMetricsResults = await Promise.all(
            employees.map(async (employee) => {
                try {
                    const summaryData = await AttendanceSummaryService.getEmployeeAttendanceSummary(
                        employee._id,
                        filters.startDate,
                        filters.endDate,
                        sharedData  // Pass pre-fetched shared data to skip redundant DB queries
                    );
                    return calculateEmployeeMetrics(employee, summaryData);
                } catch (error) {
                    console.error(`[AnalyticsService V2] Error processing employee ${employee.employeeCode}:`, error.message);
                    return null; // Return null for failed employees instead of crashing all
                }
            })
        );
        
        // Filter out failed employees (nulls)
        const employeeMetrics = employeeMetricsResults.filter(Boolean);
        
        // Sort by attendance percentage DESC, then by avg working hours DESC
        employeeMetrics.sort((a, b) => {
            if (b.attendancePercentage !== a.attendancePercentage) {
                return b.attendancePercentage - a.attendancePercentage;
            }
            return b.avgWorkingHours - a.avgWorkingHours;
        });
        
        // Add rank to each employee
        employeeMetrics.forEach((emp, index) => {
            emp.rank = index + 1;
            
            // Validate metrics
            validateMetrics(emp, `${emp.employeeName} (${emp.employeeCode})`);
        });
        
        // Calculate summary metrics
        const summary = calculateSummaryMetrics(employeeMetrics);
        
        // Apply pagination
        const totalRecords = employeeMetrics.length;
        const totalPages = Math.ceil(totalRecords / limit);
        const paginatedEmployees = employeeMetrics.slice(skip, skip + limit);
        
        console.log(`[AnalyticsService V2] Completed. Total employees: ${totalRecords}`);
        
        return {
            summary,
            employeeAnalytics: paginatedEmployees,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                limit
            }
        };
    } catch (error) {
        console.error('[AnalyticsService V2] Error calculating attendance metrics:', error);
        throw error;
    }
}

/**
 * Calculate metrics for a single employee from attendance summary data
 * 
 * @param {Object} employee - Employee object with _id, fullName, employeeCode, department, designation
 * @param {Array} summaryData - Array of attendance summary objects with finalStatus and totalWorkingHours
 * @returns {Object} Employee metrics
 */
function calculateEmployeeMetrics(employee, summaryData) {
    let presentDays = 0;
    let leaveDays = 0;
    let absentDays = 0;
    let totalNetHours = 0;
    let overtimeHours = 0;
    
    // CORRECTED: Required net working hours per day is 8.5 hours (510 min)
    // totalWorkingHours in DB is already NET (breaks excluded)
    // Overtime = hours worked beyond 8.5 hours net
    const REQUIRED_NET_HOURS = 8.5; // 510 minutes / 60
    
    summaryData.forEach(day => {
        const status = day.finalStatus;
        
        // Get working hours from summary data (includes admin overrides)
        // This is already NET hours (breaks excluded) from AttendanceLog.totalWorkingHours
        const hours = day.totalWorkingHours || 0;
        
        // CRITICAL: Half-day counts as 1 full Present Day (not 0.5)
        // This is per user requirement
        const dayValue = 1; // Always count as 1, regardless of isHalfDay
        
        // Count based on finalStatus (resolved status from AttendanceSummaryService)
        if (status === 'On-time' || status === 'Late' || status === 'Half-day') {
            // Present day - includes Half-day as full present
            presentDays += dayValue;
            totalNetHours += hours;
            
            // FIXED: Overtime = net hours worked beyond 8.5 required hours
            if (hours > REQUIRED_NET_HOURS) {
                overtimeHours += (hours - REQUIRED_NET_HOURS);
            }
        } else if (status === 'Leave' || status === 'Approved Leave') {
            // Leave day - counts as non-working (not present)
            leaveDays += dayValue;
        } else if (status === 'Absent') {
            // Absent day - should have been a working day but employee was absent
            absentDays += dayValue;
        }
        // Note: Holiday, Weekly Off, Weekend are NOT counted in any category
        // They are excluded from all metrics as they are not working days
    });
    
    // Calculate derived metrics
    // Non-Working Days = Leave Days + Absent Days (excludes weekends/holidays)
    const nonWorkingDays = leaveDays + absentDays;
    
    // Working days in period = present + leave + absent (excludes weekends/holidays)
    const workingDaysInPeriod = presentDays + leaveDays + absentDays;
    const avgWorkingHours = presentDays > 0 ? totalNetHours / presentDays : 0;
    // Attendance % = present days / (present + absent) days (excludes leave and non-working)
    const attendableDays = presentDays + absentDays;
    const attendancePercentage = workingDaysInPeriod > 0 ? (presentDays / workingDaysInPeriod) * 100 : 0;
    
    return {
        employeeId: employee._id,
        employeeName: employee.fullName,
        employeeCode: employee.employeeCode,
        department: employee.department || 'N/A',
        designation: employee.designation || 'N/A',
        presentDays: Math.round(presentDays * 10) / 10,
        leaveDays: Math.round(leaveDays * 10) / 10,
        absentDays: Math.round(absentDays * 10) / 10,
        nonWorkingDays: Math.round(nonWorkingDays * 10) / 10,
        totalNetHours: Math.round(totalNetHours * 100) / 100,
        totalNetHoursFormatted: formatHoursToHHMM(totalNetHours),
        avgWorkingHours: Math.round(avgWorkingHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        overtimeHoursFormatted: formatHoursToHHMM(overtimeHours),
        attendancePercentage: Math.round(attendancePercentage * 100) / 100
    };
}

/**
 * Build user filter query for MongoDB
 * 
 * @param {Object} filters - Filter criteria
 * @returns {Object} MongoDB query object
 */
function buildUserFilterQuery(filters) {
    const query = {};
    
    // CRITICAL: Exclude admin users from analytics
    query.role = { $ne: 'Admin' };
    
    if (filters.department) {
        query.department = filters.department;
    }
    
    if (filters.location) {
        query.location = filters.location;
    }
    
    if (filters.employmentStatus) {
        query.isActive = filters.employmentStatus === 'Active';
    }
    
    // Add search functionality for employee name or employee code
    if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i'); // Case-insensitive search
        query.$or = [
            { fullName: searchRegex },
            { employeeCode: searchRegex }
        ];
        console.log('[AnalyticsService] Search filter applied:', filters.search);
    }
    
    console.log('[AnalyticsService] Built user query:', JSON.stringify(query));
    return query;
}

/**
 * Validate metrics integrity
 * 
 * @param {Object} metrics - Metrics object
 * @param {string} context - Context for logging
 * @returns {boolean} True if valid
 */
function validateMetrics(metrics, context = 'unknown') {
    const errors = [];
    
    // CRITICAL: Non-Working Days MUST equal Leave Days + Absent Days
    const expectedNonWorking = (metrics.leaveDays || 0) + (metrics.absentDays || 0);
    const actualNonWorking = metrics.nonWorkingDays || 0;
    
    // Allow small floating point tolerance (0.01)
    if (Math.abs(actualNonWorking - expectedNonWorking) > 0.01) {
        errors.push({
            check: 'Non-Working Days Invariant',
            severity: 'CRITICAL',
            message: `Non-Working Days (${actualNonWorking}) ≠ Leave Days (${metrics.leaveDays}) + Absent Days (${metrics.absentDays}) = ${expectedNonWorking}`
        });
    }
    
    // Check: Avg Working Hours > 0 implies Present Days > 0
    if ((metrics.avgWorkingHours || 0) > 0 && (metrics.presentDays || 0) === 0) {
        errors.push({
            check: 'Average Hours Validation',
            severity: 'ERROR',
            message: 'Average Working Hours > 0 but Present Days = 0'
        });
    }
    
    if (errors.length > 0) {
        console.error(`[AnalyticsService V2] ❌ Validation failed for ${context}:`, errors);
        
        const criticalErrors = errors.filter(e => e.severity === 'CRITICAL');
        if (criticalErrors.length > 0) {
            throw new Error(`CRITICAL validation failure for ${context}: ${criticalErrors[0].message}`);
        }
    }
    
    return errors.length === 0;
}

/**
 * Calculate summary metrics from employee metrics
 * 
 * @param {Array} employeeMetrics - Array of employee metrics
 * @returns {Object} Summary metrics
 */
function calculateSummaryMetrics(employeeMetrics) {
    if (!employeeMetrics || employeeMetrics.length === 0) {
        return {
            totalEmployees: 0,
            presentDays: 0,
            leaveDays: 0,
            absentDays: 0,
            nonWorkingDays: 0,
            attendancePercentage: 0,
            totalNetHours: 0,
            averageWorkingHours: 0,
            overtimeHours: 0
        };
    }
    
    // Sum all metrics
    const totals = employeeMetrics.reduce((acc, emp) => {
        acc.presentDays += emp.presentDays || 0;
        acc.leaveDays += emp.leaveDays || 0;
        acc.absentDays += emp.absentDays || 0;
        acc.nonWorkingDays += emp.nonWorkingDays || 0;
        acc.totalNetHours += emp.totalNetHours || 0;
        acc.overtimeHours += emp.overtimeHours || 0;
        return acc;
    }, {
        presentDays: 0,
        leaveDays: 0,
        absentDays: 0,
        nonWorkingDays: 0,
        totalNetHours: 0,
        overtimeHours: 0
    });
    
    // Calculate derived metrics
    const workingDaysInPeriod = totals.presentDays + totals.leaveDays + totals.absentDays;
    const averageWorkingHours = totals.presentDays > 0 ? totals.totalNetHours / totals.presentDays : 0;
    const attendancePercentage = workingDaysInPeriod > 0 ? (totals.presentDays / workingDaysInPeriod) * 100 : 0;
    
    const summary = {
        totalEmployees: employeeMetrics.length,
        presentDays: Math.round(totals.presentDays * 10) / 10,
        leaveDays: Math.round(totals.leaveDays * 10) / 10,
        absentDays: Math.round(totals.absentDays * 10) / 10,
        nonWorkingDays: Math.round(totals.nonWorkingDays * 10) / 10,
        attendancePercentage: Math.round(attendancePercentage * 100) / 100,
        totalNetHours: Math.round(totals.totalNetHours * 100) / 100,
        totalNetHoursFormatted: formatHoursToHHMM(totals.totalNetHours),
        averageWorkingHours: Math.round(averageWorkingHours * 100) / 100,
        overtimeHours: Math.round(totals.overtimeHours * 100) / 100,
        overtimeHoursFormatted: formatHoursToHHMM(totals.overtimeHours)
    };
    
    // Validate summary
    validateMetrics(summary, 'summary');
    
    return summary;
}

module.exports = {
    calculateAttendanceMetrics,
    calculateEmployeeMetrics,
    calculateSummaryMetrics,
    validateMetrics
};
