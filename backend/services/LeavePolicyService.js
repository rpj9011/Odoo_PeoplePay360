// backend/services/LeavePolicyService.js
const User = require('../models/User');
const Holiday = require('../models/Holiday');
const LeaveRequest = require('../models/LeaveRequest');
const { logAction } = require('./auditLogger');
const { parseISTDate, getISTDateString, getISTNow } = require('../utils/istTime');

/**
 * SINGLE SOURCE OF TRUTH for all leave policy validations.
 * Consolidates rules from former LeavePolicyService and AntiExploitationLeaveService.
 * No leave policy logic should exist outside this service.
 */
class LeavePolicyService {
    /**
     * Normalize requestType for policy: Comp-Off -> Compensatory (backward compatibility).
     * @param {string} requestType
     * @returns {string}
     */
    static normalizeRequestType(requestType) {
        if (!requestType) return requestType;
        const t = String(requestType).trim();
        return t === 'Comp-Off' ? 'Compensatory' : t;
    }

    /**
     * Map requestType to User.leaveBalances field. Used for deduction and balance checks.
     * Backdated Leave returns 'backdated' (use resolveBalanceForBackdatedLeave for deduction).
     * @param {string} requestType
     * @returns {string|null} 'sick'|'casual'|'paid'|'backdated'|null
     */
    static getBalanceField(requestType) {
        if (!requestType) return null;
        const t = LeavePolicyService.normalizeRequestType(requestType);
        if (t === 'Sick') return 'sick';
        if (t === 'Planned') return 'paid';
        if (t === 'Casual') return 'casual';
        if (t === 'Backdated Leave') return 'backdated';
        return null; // LOP, Compensatory, YEAR_END, etc.
    }

    /**
     * Resolve how to deduct balance for Backdated Leave at approval time.
     * Permanent: deduct Sick first, then Casual; reject if combined insufficient.
     * Intern/Probation: no deduction (Backdated must be LOP only; no balance).
     * @param {Object} employee - Employee document with leaveBalances, employmentStatus
     * @param {number} duration - Leave duration in days
     * @returns {{ deduct: false } | { allowed: false, reason: string } | { allowed: true, deductions: Array<{ field: string, amount: number }> }}
     */
    static resolveBalanceForBackdatedLeave(employee, duration) {
        const status = employee.employmentStatus;
        if (status === 'Intern' || status === 'Probation') {
            return { deduct: false };
        }
        if (status !== 'Permanent') {
            return { deduct: false };
        }
        const sick = Math.max(0, employee.leaveBalances?.sick ?? 0);
        const casual = Math.max(0, employee.leaveBalances?.casual ?? 0);
        const total = sick + casual;
        if (total < duration) {
            return {
                allowed: false,
                reason: `Insufficient leave balance for backdated leave. Required ${duration} day(s); available Sick: ${sick}, Casual: ${casual} (combined: ${total}).`
            };
        }
        const sickDeduct = Math.min(sick, duration);
        const casualDeduct = duration - sickDeduct;
        const deductions = [];
        if (sickDeduct > 0) deductions.push({ field: 'sick', amount: sickDeduct });
        if (casualDeduct > 0) deductions.push({ field: 'casual', amount: casualDeduct });
        return { allowed: true, deductions };
    }

    /**
     * Check that requested leave dates do not overlap with existing Pending/Approved leaves.
     * @param {ObjectId} employeeId
     * @param {Array<string|Date>} leaveDates - Already normalized to YYYY-MM-DD or Date
     * @param {ObjectId} [excludeRequestId] - Leave request ID to exclude (e.g. when updating)
     * @returns {{ allowed: boolean, reason?: string, rule?: string }}
     */
    static async checkNoOverlappingLeaves(employeeId, leaveDates, excludeRequestId = null) {
        if (!leaveDates || leaveDates.length === 0) {
            return { allowed: true };
        }
        const setOfDates = new Set();
        for (const d of leaveDates) {
            const str = typeof d === 'string' ? d : getISTDateString(parseISTDate(d));
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) setOfDates.add(str);
        }
        if (setOfDates.size === 0) return { allowed: true };

        const query = {
            employee: employeeId,
            status: { $in: ['Pending', 'Approved', 'Returned'] },
            requestType: { $ne: 'YEAR_END' }
        };
        if (excludeRequestId) {
            query._id = { $ne: excludeRequestId };
        }
        const existing = await LeaveRequest.find(query).select('leaveDates').lean();
        for (const doc of existing) {
            for (const leaveDate of doc.leaveDates || []) {
                const existingStr = getISTDateString(parseISTDate(leaveDate));
                if (setOfDates.has(existingStr)) {
                    return {
                        allowed: false,
                        reason: `You already have a leave request that includes ${existingStr}. Overlapping leave dates are not allowed.`,
                        rule: 'OVERLAPPING_LEAVE'
                    };
                }
            }
        }
        return { allowed: true };
    }
    /**
     * Validate a leave request against all company policies
     * @param {String|ObjectId} employeeId - Employee ID
     * @param {Array} leaveDates - Array of leave dates
     * @param {String} requestType - Leave request type (Planned, Casual, Sick, etc.)
     * @param {String} leaveType - Leave type (Full Day, Half Day - First Half, etc.)
     * @param {String} adminOverrideReason - Optional override reason for admin approvals
     * @param {String} alternateDate - Optional alternate date for Compensatory leaves
     * @param {Object} options - Optional options object { excludeRequestId, appliedDate }
     * @returns {Object} Validation result with allowed flag and reason
     */
    static async validateRequest(employeeId, leaveDates, requestType, leaveType = 'Full Day', adminOverrideReason = null, alternateDate = null, options = {}) {
        const { excludeRequestId, appliedDate, isAdminUpdate } = options;
        try {
            // Fetch employee details
            const employee = await User.findById(employeeId);
            if (!employee) {
                return {
                    allowed: false,
                    reason: 'Employee not found',
                    rule: 'EMPLOYEE_NOT_FOUND'
                };
            }

            // Validate input parameters first (before admin override check)
            if (!leaveDates || !Array.isArray(leaveDates) || leaveDates.length === 0) {
                return {
                    allowed: false,
                    reason: 'Invalid leave dates provided',
                    rule: 'INVALID_DATES'
                };
            }

            // Normalize requestType (Comp-Off -> Compensatory) for all downstream logic
            requestType = this.normalizeRequestType(requestType);

            // Overlapping leave check (cannot be bypassed by admin override)
            const overlapCheck = await this.checkNoOverlappingLeaves(employeeId, leaveDates, excludeRequestId);
            if (!overlapCheck.allowed) {
                return { allowed: false, reason: overlapCheck.reason, rule: overlapCheck.rule };
            }

            // Employee type validation
            const employeeTypeCheck = this.validateEmployeeType(employee, requestType);
            if (!employeeTypeCheck.allowed) {
                return employeeTypeCheck;
            }

            // Backdated leave handling
            const backdatedCheck = this.handleBackdatedLeave(employee, leaveDates, requestType);
            if (!backdatedCheck.allowed) {
                return backdatedCheck;
            }

            // PRIORITY 1: Leave type specific validation (includes advance notice checks)
            // Pass appliedDate to use for advance notice calculation (for admin edits)
            // Pass isAdminUpdate to bypass advance notice checks for admin operations
            const typeSpecificCheck = await this.validateLeaveTypeSpecific(employee, leaveDates, requestType, leaveType, alternateDate, appliedDate, isAdminUpdate);
            if (!typeSpecificCheck.allowed) {
                return typeSpecificCheck;
            }

            // PRIORITY 1.5: Saturday Clubbing Leave Policy (no admin override allowed)
            const saturdayClubbingCheck = this.validateSaturdayClubbingLeavePolicy(employee, leaveDates, requestType);
            if (!saturdayClubbingCheck.allowed) {
                return saturdayClubbingCheck;
            }

            // PRIORITY 2: Context-aware monthly caps validation (Planned Leave exempt from working days cap)
            // CRITICAL FIX: Validate ALL months touched by the leave request
            const firstDate = leaveDates[0];
            const lastDate = leaveDates[leaveDates.length - 1];
            const monthSegments = this.splitLeaveByMonth(firstDate, lastDate);
            
            // Validate each month segment independently
            for (const segment of monthSegments) {
                const monthlyCheck = await this.validateMonthlyCapsIntelligent(
                    employee._id,
                    leaveDates,
                    leaveType,
                    requestType,
                    segment.month,
                    segment.year,
                    segment.startDate,
                    segment.endDate,
                    employee,
                    excludeRequestId
                );
                
                // If admin override is provided, allow bypass of weekday restrictions but NOT monthly caps
                if (!monthlyCheck.allowed) {
                    if (adminOverrideReason) {
                        // Admin override CANNOT bypass monthly caps - throw error
                        return {
                            allowed: false,
                            reason: `Admin override cannot bypass monthly limits. ${monthlyCheck.reason}`,
                            rule: 'ADMIN_OVERRIDE_MONTHLY_CAP_BLOCKED'
                        };
                    }
                    return monthlyCheck;
                }
            }

            // PRIORITY 3: Context-aware weekday validation (skip for valid advance notice)
            const weekdayCheck = await this.validateWeekdayRestrictionsIntelligent(employee, leaveDates, requestType, leaveType);
            if (!weekdayCheck.allowed) {
                // Admin override CAN bypass weekday restrictions
                if (adminOverrideReason) {
                    await this.logAdminOverride(employee, leaveDates, requestType, leaveType, adminOverrideReason);
                    return {
                        allowed: true,
                        reason: 'Admin override applied (weekday restriction bypassed)',
                        rule: 'ADMIN_OVERRIDE'
                    };
                }
                return weekdayCheck;
            }

            // If admin override reason is provided, log it (but all validations passed)
            if (adminOverrideReason) {
                await this.logAdminOverride(employee, leaveDates, requestType, leaveType, adminOverrideReason);
                return {
                    allowed: true,
                    reason: 'Admin override applied',
                    rule: 'ADMIN_OVERRIDE'
                };
            }


            // If all validations pass
            return {
                allowed: true,
                reason: 'Leave request meets all policy requirements',
                rule: 'APPROVED'
            };

        } catch (error) {
            console.error('Error in LeavePolicyService.validateRequest:', error);
            return {
                allowed: false,
                reason: 'Internal policy validation error',
                rule: 'SYSTEM_ERROR'
            };
        }
    }

    /**
     * Validate employee type eligibility for leave types
     */
    static validateEmployeeType(employee, requestType) {
        const employmentStatus = employee.employmentStatus;
        
        // Permanent employees can use all leave types
        if (employmentStatus === 'Permanent') {
            return { allowed: true };
        }
        
        // Probation and Intern employees - only LOP and Compensatory allowed (Backdated Leave not allowed)
        if (employmentStatus === 'Probation' || employmentStatus === 'Intern') {
            if (requestType === 'Loss of Pay' || requestType === 'Compensatory') {
                return { allowed: true };
            }
            
            const leaveTypeLabel = requestType === 'Casual' ? 'Casual' : 
                                 requestType === 'Sick' ? 'Sick' : 
                                 requestType === 'Planned' ? 'Planned' : requestType;
            
            return {
                allowed: false,
                reason: `During ${employmentStatus.toLowerCase()}, only Loss of Pay (LOP) leave is allowed. ${leaveTypeLabel} leave will be available after confirmation.`,
                rule: 'EMPLOYEE_TYPE_RESTRICTION'
            };
        }
        
        return { allowed: true };
    }

    /**
     * Handle backdated leave logic
     */
    static handleBackdatedLeave(employee, leaveDates, requestType) {
        const today = parseISTDate(getISTDateString());
        const firstLeaveDate = parseISTDate(leaveDates[0]);
        
        // Check if leave is backdated
        if (firstLeaveDate < today) {
            // Permanent employees can apply backdated Casual/Sick
            if (employee.employmentStatus === 'Permanent') {
                if (requestType === 'Casual' || requestType === 'Sick') {
                    return { allowed: true };
                }
            }
            
            // Probation/Intern - auto-convert to LOP for backdated
            if (employee.employmentStatus === 'Probation' || employee.employmentStatus === 'Intern') {
                if (requestType !== 'Loss of Pay') {
                    const daysPast = Math.floor((today - firstLeaveDate) / (1000 * 60 * 60 * 24));
                    return {
                        allowed: false,
                        reason: `This leave is for ${daysPast} day${daysPast > 1 ? 's' : ''} ago. During ${employee.employmentStatus.toLowerCase()}, backdated leave must be applied as Loss of Pay (LOP).`,
                        rule: 'BACKDATED_LOP_REQUIRED'
                    };
                }
            }
        }
        
        return { allowed: true };
    }

    /**
     * Validate Compensatory (Comp-Off) leave requests
     * Rules:
     * 1. Max 2 Comp-Off requests per month
     * 2. Worked date (Saturday or Sunday) must be from current month only
     * 3. Must be submitted by Thursday of the same week
     * 4. Alternate date must be a Saturday or Sunday; Saturday must be a working Saturday per policy; Sunday is always allowed
     */
    /**
         * Validate Compensatory (Comp-Off) leave requests
         * 
         * BUSINESS LOGIC:
         * - Comp-Off is ALLOWED when employee works on a scheduled Week Off or Holiday
         * - Comp-Off is REJECTED when the worked date was a regular Working Day
         * 
         * Rules:
         * 1. Must be submitted by Thursday of the same week
         * 2. Worked date must be from current month only
         * 3. Worked date must be a Saturday or Sunday
         * 4. Worked date must have been a scheduled Week Off or Holiday (NOT a working day)
         * 5. Employee must have attendance record for that date
         * 6. Max 2 Comp-Off requests per month
         * 7. No duplicate Comp-Off claims for the same worked date
         */
        static async validateCompensatoryLeave(employee, leaveDates, leaveType, alternateDate) {
            const today = parseISTDate(getISTDateString());
            const dayOfWeek = today.getDay();

            if (!alternateDate) {
                return {
                    allowed: false,
                    reason: 'Alternate date (worked Saturday or Sunday) is required for Comp-Off requests.',
                    rule: 'COMPOFF_ALTERNATE_DATE_REQUIRED'
                };
            }

            const workedDate = parseISTDate(alternateDate);
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            const workedDayOfWeek = workedDate.getDay();

            // Determine if the worked date is in a future week (start of week = Monday)
            const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const workedMidnight = new Date(workedDate.getFullYear(), workedDate.getMonth(), workedDate.getDate());
            // Get Monday of current week
            const currentWeekMonday = new Date(todayMidnight);
            currentWeekMonday.setDate(todayMidnight.getDate() - ((todayMidnight.getDay() + 6) % 7));
            // Get Monday of worked date's week
            const workedWeekMonday = new Date(workedMidnight);
            workedWeekMonday.setDate(workedMidnight.getDate() - ((workedMidnight.getDay() + 6) % 7));

            const isWorkedDateInFutureWeek = workedWeekMonday > currentWeekMonday;
            const isWorkedDateInCurrentWeek = workedWeekMonday.getTime() === currentWeekMonday.getTime();

            // Rule 1: Thursday deadline only applies when the worked date is in the current week
            // If the worked date is in a future week, the deadline check is not relevant yet
            if (!isWorkedDateInFutureWeek && dayOfWeek > 4) { // Friday, Saturday, Sunday of current week
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                return {
                    allowed: false,
                    reason: `Comp-Off requests must be submitted by Thursday of the same week. Today is ${dayNames[dayOfWeek]}, which is past the deadline.`,
                    rule: 'COMPOFF_THURSDAY_DEADLINE'
                };
            }

            // Rule 2: Worked date must be from current or future month only (not past months)
            const workedMonth = workedDate.getMonth();
            const workedYear = workedDate.getFullYear();
            const isPastMonth = workedYear < currentYear || (workedYear === currentYear && workedMonth < currentMonth);
            if (isPastMonth) {
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                   'July', 'August', 'September', 'October', 'November', 'December'];
                return {
                    allowed: false,
                    reason: `Worked date (Saturday or Sunday) must be from the current or a future month. You cannot claim Comp-Off for weekend days from past months.`,
                    rule: 'COMPOFF_CURRENT_MONTH_ONLY'
                };
            }

            // Rule 3: Alternate date must be a Saturday or Sunday
            if (workedDayOfWeek !== 6 && workedDayOfWeek !== 0) {
                return {
                    allowed: false,
                    reason: 'Alternate date must be a Saturday or Sunday. Comp-Off can only be claimed for working on Saturdays or Sundays.',
                    rule: 'COMPOFF_SATURDAY_OR_SUNDAY_ONLY'
                };
            }

            // Rule 4: Validate eligibility using helper function
            const eligibilityCheck = await this.validateCompOffEligibility(employee._id, workedDate, employee.alternateSaturdayPolicy);
            if (!eligibilityCheck.eligible) {
                return {
                    allowed: false,
                    reason: eligibilityCheck.reason,
                    rule: eligibilityCheck.rule
                };
            }

            // Rule 5: Max 2 Comp-Off requests per month (check against the worked date's month)
            const limitMonth = workedMonth;
            const limitYear = workedYear;
            const monthStart = new Date(limitYear, limitMonth, 1);
            const monthEnd = new Date(limitYear, limitMonth + 1, 0, 23, 59, 59, 999);

            const existingCompOffRequests = await LeaveRequest.find({
                employee: employee._id,
                requestType: 'Compensatory',
                status: { $in: ['Pending', 'Approved', 'Returned'] },
                createdAt: { $gte: monthStart, $lte: monthEnd }
            });

            if (existingCompOffRequests.length >= 2) {
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                   'July', 'August', 'September', 'October', 'November', 'December'];
                return {
                    allowed: false,
                    reason: `You have already submitted ${existingCompOffRequests.length} Comp-Off requests for ${monthNames[limitMonth]} ${limitYear}. Maximum allowed is 2 per month.`,
                    rule: 'COMPOFF_MONTHLY_LIMIT'
                };
            }

            return { allowed: true };
        }

        /**
         * Helper function to validate Comp-Off eligibility for a specific worked date
         *
         * CORE LOGIC:
         * - Comp-Off is ALLOWED when the worked date was a scheduled Week Off or Holiday
         * - Comp-Off is REJECTED when the worked date was a regular Working Day
         *
         * @param {ObjectId} employeeId - Employee ID
         * @param {Date} workedDate - The date employee claims to have worked
         * @param {String} saturdayPolicy - Employee's Saturday policy
         * @returns {Object} { eligible: boolean, reason?: string, rule?: string }
         */
        /**
             * Helper function to validate Comp-Off eligibility for a specific worked date
             * 
             * CORE LOGIC:
             * - Comp-Off is ALLOWED when the worked date was a scheduled Week Off or Holiday
             * - Comp-Off is REJECTED when the worked date was a regular Working Day
             * 
             * @param {ObjectId} employeeId - Employee ID
             * @param {Date} workedDate - The date employee claims to have worked
             * @param {String} saturdayPolicy - Employee's Saturday policy
             * @returns {Object} { eligible: boolean, reason?: string, rule?: string }
             */
            static async validateCompOffEligibility(employeeId, workedDate, saturdayPolicy) {
                const Holiday = require('../models/Holiday');
                const AttendanceLog = require('../models/AttendanceLog');
                const LeaveRequest = require('../models/LeaveRequest');

                const workedDayOfWeek = workedDate.getDay();

                // CRITICAL FIX: Format date correctly to avoid timezone issues
                // Extract date components directly from the Date object instead of using toISOString()
                // which converts to UTC and can shift the date
                const year = workedDate.getFullYear();
                const month = String(workedDate.getMonth() + 1).padStart(2, '0');
                const day = String(workedDate.getDate()).padStart(2, '0');
                const workedDateString = `${year}-${month}-${day}`; // YYYY-MM-DD

                // Debug logging (temporary)
                if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Worked Date Object:', workedDate);
                if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Worked Date String:', workedDateString);
                if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Employee ID:', employeeId);

                // CRITICAL FIX: Skip attendance validation for future dates
                // Employees can apply for Comp-Off in advance for future weekend work
                // Attendance validation will happen during approval when the date has passed
                const { startOfISTDay } = require('../utils/istTime');
                const today = startOfISTDay();
                const isFutureDate = workedDate > today;

                if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Is Future Date:', isFutureDate);

                // Only validate attendance for past or current dates
                if (!isFutureDate) {
                    // Check 1: Verify attendance record exists for the worked date
                    const attendanceRecord = await AttendanceLog.findOne({
                        user: employeeId,
                        attendanceDate: workedDateString
                    });

                    if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Attendance Record Found:', attendanceRecord ? 'YES' : 'NO');
                    if (attendanceRecord) {
                        if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Attendance Details:', {
                            date: attendanceRecord.attendanceDate,
                            clockInTime: attendanceRecord.clockInTime,
                            status: attendanceRecord.attendanceStatus
                        });
                    }

                    if (!attendanceRecord) {
                        return {
                            eligible: false,
                            reason: 'No attendance record found for the worked date. You must have clocked in on that day to claim Comp-Off.',
                            rule: 'COMPOFF_NO_ATTENDANCE_RECORD'
                        };
                    }

                    // Check 2: Ensure employee actually worked (has clock-in time)
                    if (!attendanceRecord.clockInTime) {
                        return {
                            eligible: false,
                            reason: 'No clock-in time found for the worked date. You must have actually worked on that day to claim Comp-Off.',
                            rule: 'COMPOFF_NO_CLOCK_IN'
                        };
                    }

                    // Check 3: Verify attendance status is not "Absent"
                    if (attendanceRecord.attendanceStatus === 'Absent') {
                        return {
                            eligible: false,
                            reason: 'Attendance record found but employee was marked absent. You must have been present to claim Comp-Off.',
                            rule: 'COMPOFF_MARKED_ABSENT'
                        };
                    }
                } else {
                    if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Skipping attendance validation for future date');
                }

                // Check 4: Prevent duplicate Comp-Off claims for the same worked date
                const existingCompOffForDate = await LeaveRequest.findOne({
                    employee: employeeId,
                    requestType: 'Compensatory',
                    alternateDate: workedDate, // Compare Date objects directly
                    status: { $in: ['Pending', 'Approved'] }
                });

                if (existingCompOffForDate) {
                    return {
                        eligible: false,
                        reason: 'You have already claimed Comp-Off for this worked date. Duplicate claims are not allowed.',
                        rule: 'COMPOFF_DUPLICATE_CLAIM'
                    };
                }

                // Check 5: Determine if the worked date was a scheduled Week Off or Holiday

                // Check if it's a Holiday
                const startOfDay = new Date(workedDate.getFullYear(), workedDate.getMonth(), workedDate.getDate(), 0, 0, 0, 0);
                const endOfDay = new Date(workedDate.getFullYear(), workedDate.getMonth(), workedDate.getDate(), 23, 59, 59, 999);

                const holiday = await Holiday.findOne({
                    date: {
                        $gte: startOfDay,
                        $lte: endOfDay
                    },
                    isTentative: false
                });

                if (holiday) {
                    // It's a holiday - Comp-Off is ALLOWED
                    if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Result: ALLOWED (Holiday)');
                    return { eligible: true };
                }

                // Check if it's a Sunday (always a week off)
                if (workedDayOfWeek === 0) {
                    // Sunday - Comp-Off is ALLOWED
                    if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Result: ALLOWED (Sunday)');
                    return { eligible: true };
                }

                // Check if it's a Saturday
                if (workedDayOfWeek === 6) {
                    const isWorkingDay = this.isWorkingSaturday(workedDate, saturdayPolicy);

                    if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Saturday Policy:', saturdayPolicy);
                    if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Is Working Saturday:', isWorkingDay);

                    if (isWorkingDay) {
                        // Saturday was a WORKING DAY - Comp-Off is REJECTED
                        if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Result: REJECTED (Working Saturday)');
                        return {
                            eligible: false,
                            reason: 'Comp-Off can only be claimed if you worked on a scheduled week off or holiday. This Saturday was a regular working day according to your Saturday policy.',
                            rule: 'COMPOFF_WORKING_DAY'
                        };
                    } else {
                        // Saturday was a WEEK OFF - Comp-Off is ALLOWED
                        if (process.env.NODE_ENV !== 'production') console.log('[validateCompOffEligibility] Result: ALLOWED (Week Off Saturday)');
                        return { eligible: true };
                    }
                }

                // If we reach here, it's a weekday (Mon-Fri) - should not happen due to earlier validation
                return {
                    eligible: false,
                    reason: 'Comp-Off can only be claimed for Saturdays or Sundays.',
                    rule: 'COMPOFF_INVALID_DAY'
                };
            }


    /**
     * Check if a Saturday is a working day based on employee policy
     */
    static isWorkingSaturday(date, saturdayPolicy) {
        if (date.getDay() !== 6) return false; // Not a Saturday
        
        const weekNum = Math.ceil(date.getDate() / 7);
        
        switch (saturdayPolicy) {
            case 'All Saturdays Working':
                return true;
            case 'All Saturdays Off':
                return false;
            case 'Week 1 & 3 Off':
                return !(weekNum === 1 || weekNum === 3);
            case 'Week 2 & 4 Off':
                return !(weekNum === 2 || weekNum === 4);
            default:
                return true; // Default to working if policy is unclear
        }
    }

    /**
     * Split leave request by calendar months
     * Returns an ordered array of month segments covered by the leave
     * @param {String|Date} startDate - First leave date
     * @param {String|Date} endDate - Last leave date
     * @returns {Array} Array of month segments with {year, month, startDate, endDate}
     */
    static splitLeaveByMonth(startDate, endDate) {
        const start = typeof startDate === 'string' ? parseISTDate(startDate) : startDate;
        const end = typeof endDate === 'string' ? parseISTDate(endDate) : endDate;
        
        const segments = [];
        let currentDate = new Date(start);
        
        while (currentDate <= end) {
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            
            // Calculate month boundaries
            const monthStart = new Date(year, month, 1);
            const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
            
            // Determine segment boundaries
            const segmentStart = currentDate > monthStart ? new Date(currentDate) : new Date(monthStart);
            const segmentEnd = end < monthEnd ? new Date(end) : new Date(monthEnd);
            
            segments.push({
                year: year,
                month: month,
                startDate: getISTDateString(segmentStart),
                endDate: getISTDateString(segmentEnd)
            });
            
            // Move to first day of next month
            currentDate = new Date(year, month + 1, 1);
        }
        
        return segments;
    }

    /**
     * Intelligent monthly caps validation - ALL leave types INCLUDING LOP count toward limits
     * @param {String|ObjectId} employeeId - Employee ID
     * @param {Array} leaveDates - Array of leave dates (or segment dates)
     * @param {String} leaveType - Leave type
     * @param {String} requestType - Request type
     * @param {Number} targetMonth - Optional target month (0-11) for segment validation
     * @param {Number} targetYear - Optional target year for segment validation
     * @param {String} segmentStartDate - Optional segment start date for working days calculation
     * @param {String} segmentEndDate - Optional segment end date for working days calculation
     * @param {Object} [employee] - Employee doc for Saturday policy in working days count
     * @param {ObjectId} [excludeRequestId] - Leave request ID to exclude from count (e.g., when updating/approving existing request)
     */
    static async validateMonthlyCapsIntelligent(employeeId, leaveDates, leaveType, requestType, targetMonth = null, targetYear = null, segmentStartDate = null, segmentEndDate = null, employee = null, excludeRequestId = null) {
        // Compensatory/Comp-Off have their own monthly limit (handled in validateCompensatoryLeave)
        if (requestType === 'Compensatory' || requestType === 'Comp-Off') {
            return { allowed: true };
        }
        
        // Use provided month/year for segment validation, or determine from first date
        const firstLeaveDate = parseISTDate(leaveDates[0]);
        const month = targetMonth !== null ? targetMonth : firstLeaveDate.getMonth();
        const year = targetYear !== null ? targetYear : firstLeaveDate.getFullYear();
        
        // Get month name for user-friendly messaging
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const monthName = monthNames[month];
        
        // Month boundaries in IST
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
        
        // CRITICAL FIX: Count ALL leave types INCLUDING LOP toward monthly request limit
        // LOP is NOT restricted by leave balance, but IS counted toward monthly limits
        // Count requests where ANY date overlaps the target month (not just startDate)
        // Exclude the current request if excludeRequestId is provided (e.g., when approving/updating existing request)
        const query = {
            employee: employeeId,
            status: { $in: ['Pending', 'Approved', 'Returned'] },
            requestType: { $nin: ['Compensatory', 'Comp-Off'] }, // Comp-Off has separate limit
            leaveDates: {
                $elemMatch: {
                    $gte: monthStart,
                    $lte: monthEnd
                }
            }
        };
        if (excludeRequestId) {
            query._id = { $ne: excludeRequestId };
        }
        const existingRequests = await LeaveRequest.find(query);
        
        // Check request count limit (4 per month) - ALL types including LOP count
        if (existingRequests.length >= 4) {
            return {
                allowed: false,
                reason: `You have already submitted ${existingRequests.length} leave request${existingRequests.length !== 1 ? 's' : ''} for ${monthName} ${year}. The maximum allowed is 4 requests per month (including LOP).`,
                rule: 'MONTHLY_REQUEST_LIMIT'
            };
        }
        
        // INTELLIGENT WORKING DAYS CAP: Planned Leave is EXEMPT, but LOP IS COUNTED
        if (requestType === 'Planned') {
            // Planned leave ignores the 5-day working days cap
            return { allowed: true };
        }
        
        // For other leave types (including LOP, excluding Planned and Comp-Off), enforce 5 working days cap
        const holidays = await Holiday.find({
            date: { $gte: monthStart, $lte: monthEnd }
        });
        
        let totalWorkingDays = 0;
        
        // Count existing working days (include LOP, exclude Planned Leave and Comp-Off)
        // For segment validation, only count days within the target month segment
        for (const request of existingRequests) {
            const reqType = this.normalizeRequestType(request.requestType);
            if (reqType === 'Planned' || reqType === 'Compensatory') {
                continue; // Skip planned leave and Compensatory from working days count
            }
            // LOP IS INCLUDED in working days count
            // Filter request dates to only include dates within the target month segment
            let requestDatesToCount = request.leaveDates;
            if (segmentStartDate && segmentEndDate) {
                const segmentStart = parseISTDate(segmentStartDate);
                const segmentEnd = parseISTDate(segmentEndDate);
                requestDatesToCount = request.leaveDates.filter(dateStr => {
                    const date = parseISTDate(dateStr);
                    return date >= segmentStart && date <= segmentEnd;
                });
            }
            const workingDays = this.countWorkingDays(requestDatesToCount, holidays, employee);
            const multiplier = request.leaveType === 'Full Day' ? 1 : 0.5;
            totalWorkingDays += workingDays * multiplier;
        }
        
        // Count current request working days (including LOP)
        // If segment dates provided, filter leaveDates to only include dates within segment
        let datesToCount = leaveDates;
        if (segmentStartDate && segmentEndDate) {
            const segmentStart = parseISTDate(segmentStartDate);
            const segmentEnd = parseISTDate(segmentEndDate);
            datesToCount = leaveDates.filter(dateStr => {
                const date = parseISTDate(dateStr);
                return date >= segmentStart && date <= segmentEnd;
            });
        }
        const currentWorkingDays = this.countWorkingDays(datesToCount, holidays, employee);
        const multiplier = leaveType === 'Full Day' ? 1 : 0.5;
        const newWorkingDays = currentWorkingDays * multiplier;
        const alreadyUsed = totalWorkingDays; // Working days from existing requests (before adding current)
        const totalAfterRequest = totalWorkingDays + newWorkingDays;
        
        // Block if total would exceed 5 working days (strict limit)
        if (totalAfterRequest > 5) {
            const remainingDays = Math.max(0, 5 - alreadyUsed);
            const excessDays = totalAfterRequest - 5;
            return {
                allowed: false,
                reason: `You have already used ${alreadyUsed} working day${alreadyUsed !== 1 ? 's' : ''} of leave in ${monthName} ${year}. This request of ${newWorkingDays} working day${newWorkingDays !== 1 ? 's' : ''} would exceed the monthly limit of 5 working days by ${excessDays} day${excessDays !== 1 ? 's' : ''}. You can apply for up to ${remainingDays} more working day${remainingDays !== 1 ? 's' : ''} this month. Planned leave is exempt from this limit.`,
                rule: 'MONTHLY_WORKING_DAYS_LIMIT',
                alreadyUsed: alreadyUsed,
                requestedDays: newWorkingDays,
                remainingDays: remainingDays,
                totalAfterRequest: totalAfterRequest
            };
        }
        
        // Return working days info even when allowed (for frontend warnings)
        // Always return this info so frontend can show warnings
        return {
            allowed: true,
            alreadyUsed: alreadyUsed,
            requestedDays: newWorkingDays,
            remainingDays: Math.max(0, 5 - totalAfterRequest),
            totalAfterRequest: totalAfterRequest
        };
    }

    /**
     * Count working days excluding Sundays, holidays, and non-working Saturdays (by policy).
     * @param {Array} leaveDates - Date strings or Dates
     * @param {Array} holidays - Holiday docs with .date
     * @param {Object} [employee] - Employee doc for alternateSaturdayPolicy
     */
    static countWorkingDays(leaveDates, holidays, employee = null) {
        let workingDays = 0;
        const saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
        for (const dateStr of leaveDates) {
            const date = parseISTDate(dateStr);
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0) continue; // Sunday
            if (dayOfWeek === 6 && this.isSaturdayOff(date, saturdayPolicy)) continue; // Non-working Saturday
            const isHoliday = holidays.some(holiday => {
                const holidayDate = parseISTDate(holiday.date);
                return getISTDateString(holidayDate) === getISTDateString(date);
            });
            if (isHoliday) continue;
            workingDays++;
        }
        return workingDays;
    }

    /**
     * Count working days between two dates (exclusive of start, inclusive of end)
     * Used for retrospective SL window validation
     * @param {Date|string} startDate - Start date (exclusive)
     * @param {Date|string} endDate - End date (inclusive)
     * @param {Object} [employee] - Employee doc for Saturday policy
     * @returns {Promise<number>} Number of working days
     */
    static async countWorkingDaysSinceDate(startDate, endDate, employee = null) {
        const start = parseISTDate(startDate);
        const end = parseISTDate(endDate);
        if (end <= start) return 0;
        
        // Fetch holidays in the date range
        const holidays = await Holiday.find({
            date: { $gte: start, $lte: end }
        }).lean();
        
        let workingDays = 0;
        const saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
        const currentDate = new Date(start);
        currentDate.setDate(currentDate.getDate() + 1); // Start from day after startDate
        
        while (currentDate <= end) {
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek === 0) { // Sunday
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
            }
            if (dayOfWeek === 6 && this.isSaturdayOff(currentDate, saturdayPolicy)) { // Non-working Saturday
                currentDate.setDate(currentDate.getDate() + 1);
                continue;
            }
            const dateStr = getISTDateString(currentDate);
            const isHoliday = holidays.some(holiday => {
                const holidayDate = parseISTDate(holiday.date);
                return getISTDateString(holidayDate) === dateStr;
            });
            if (!isHoliday) {
                workingDays++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return workingDays;
    }

    /**
     * Validate leave type specific rules with intelligent advance notice handling
     * @param {Object} employee - Employee object
     * @param {Array} leaveDates - Array of leave dates
     * @param {String} requestType - Leave request type
     * @param {String} leaveType - Leave type
     * @param {Date} alternateDate - Optional alternate date
     * @param {Date} appliedDate - Optional applied date (createdAt). If provided, advance notice is calculated from this date instead of today.
     */
    static async validateLeaveTypeSpecific(employee, leaveDates, requestType, leaveType, alternateDate = null, appliedDate = null, isAdminUpdate = false) {
        // Use applied date if provided (for admin edits), otherwise use today
        // appliedDate should be a Date object when passed from admin update
        const referenceDate = appliedDate 
            ? parseISTDate(getISTDateString(appliedDate))
            : parseISTDate(getISTDateString());
        const firstLeaveDate = parseISTDate(leaveDates[0]);
        const daysDiff = Math.floor((firstLeaveDate - referenceDate) / (1000 * 60 * 60 * 24));
        
        switch (requestType) {
            case 'Casual':
                // Only for Permanent employees
                if (employee.employmentStatus !== 'Permanent') {
                    return {
                        allowed: false,
                        reason: `During ${employee.employmentStatus.toLowerCase()}, only Loss of Pay (LOP) leave is allowed. Casual leave will be available after confirmation.`,
                        rule: 'CASUAL_PERMANENT_ONLY'
                    };
                }
                
                // Skip advance notice check for admin updates
                if (isAdminUpdate) {
                    return { allowed: true };
                }
                
                // Base rule: Casual leave requires at least 4 days prior notice
                if (daysDiff < 4) {
                    return {
                        allowed: false,
                        reason: `Casual leave must be applied at least 4 days in advance. You applied this leave only ${daysDiff} day${daysDiff !== 1 ? 's' : ''} before the start date. Alternatively, you can use Loss of Pay (LOP) which has no advance notice restrictions.`,
                        rule: 'CASUAL_ADVANCE_NOTICE'
                    };
                }
                
                // Casual leave is allowed if minimum notice is met
                return { allowed: true };
                
            case 'Planned':
                // Only for Permanent employees
                if (employee.employmentStatus !== 'Permanent') {
                    return {
                        allowed: false,
                        reason: `During ${employee.employmentStatus.toLowerCase()}, only Loss of Pay (LOP) leave is allowed. Planned leave will be available after confirmation.`,
                        rule: 'PLANNED_PERMANENT_ONLY'
                    };
                }
                
                // Skip advance notice check for admin updates
                if (isAdminUpdate) {
                    return { allowed: true };
                }
                
                // INTELLIGENT PLANNED LEAVE HANDLING: Calculate working days using IST (excludes holidays)
                const workingDaysCount = await this.countWorkingDaysForPlannedLeave(leaveDates, employee);
                let requiredDays;
                
                // Advance notice based on working days count
                if (workingDaysCount >= 5 && workingDaysCount <= 7) {
                    requiredDays = 30; // ≥30 days advance
                } else if (workingDaysCount > 7) {
                    requiredDays = 60; // ≥2 months advance
                } else {
                    requiredDays = 30; // Default 30 days
                }
                
                if (daysDiff < requiredDays) {
                    const requiredPeriod = requiredDays === 60 ? '2 months' : '1 month';
                    return {
                        allowed: false,
                        reason: `Planned leave of ${workingDaysCount} working day${workingDaysCount !== 1 ? 's' : ''} requires at least ${requiredPeriod} advance notice. Please apply earlier or contact Admin if this is an emergency.`,
                        rule: 'PLANNED_ADVANCE_NOTICE'
                    };
                }
                
                // If advance notice is satisfied, planned leave is allowed regardless of weekdays
                return { allowed: true };
                
            case 'Sick':
                // Only for Permanent employees
                if (employee.employmentStatus !== 'Permanent') {
                    return {
                        allowed: false,
                        reason: `During ${employee.employmentStatus.toLowerCase()}, only Loss of Pay (LOP) leave is allowed. Sick leave will be available after confirmation.`,
                        rule: 'SICK_PERMANENT_ONLY'
                    };
                }
                
                // NEW SL LOGIC: Allow same-day, retrospective (within window), and future-dated
                // No advance notice requirement - SL is unplanned leave
                // Retrospective window validation happens in validateApply, not here
                // Future-dated SL is allowed (e.g., scheduled medical appointment)
                return { allowed: true };
                
            case 'Compensatory':
                // CRITICAL FIX: Comprehensive Comp-Off validation
                return await this.validateCompensatoryLeave(employee, leaveDates, leaveType, alternateDate);
                
            case 'Loss of Pay':
                // LOP can be applied anytime; weekday restriction relaxed when >= 10 days notice
                return { allowed: true };

            case 'Backdated Leave':
                // Only Permanent allowed (enforced by validateEmployeeType). Balance checked in checkLeaveBalance.
                if (employee.employmentStatus !== 'Permanent') {
                    return {
                        allowed: false,
                        reason: `During ${employee.employmentStatus.toLowerCase()}, backdated leave must be applied as Loss of Pay (LOP).`,
                        rule: 'BACKDATED_LOP_REQUIRED'
                    };
                }
                return { allowed: true };

            case 'Comp-Off':
                // Backward compatibility: treat as Compensatory
                return await this.validateCompensatoryLeave(employee, leaveDates, leaveType, alternateDate);
        }

        return { allowed: true };
    }

    /**
     * Weekday restrictions - Friday and Monday are NOT allowed (except admin override).
     * Policy: If Casual or LOP is applied >= 10 calendar days before leave start, Friday/Monday restriction does NOT apply.
     * Note: Tuesday/Thursday advance restriction (10-day notice requirement) was removed per updated leave policy.
     * 
     * EXCEPTION: Planned Leave (Paid Leave) can be taken on Friday and Monday when Saturday clubbing applies
     * (i.e., when Saturday is a week off, it will be automatically included in the leave).
     */
    static async validateWeekdayRestrictionsIntelligent(employee, leaveDates, requestType, leaveType) {
        requestType = this.normalizeRequestType(requestType);

        // CRITICAL FIX: Compensatory leaves are exempt from weekday restrictions (they have their own rules)
        if (requestType === 'Compensatory') {
            return { allowed: true };
        }

        // NEW: Sick Leave is exempt from weekday restrictions (unplanned leave, can happen any day)
        if (requestType === 'Sick') {
            return { allowed: true };
        }

        const today = parseISTDate(getISTDateString());
        const firstLeaveDate = parseISTDate(leaveDates[0]);
        const daysDiff = Math.floor((firstLeaveDate - today) / (1000 * 60 * 60 * 24));

        // If Casual or LOP applied >= 10 days before start, skip Friday/Monday clubbing restriction
        if ((requestType === 'Casual' || requestType === 'Loss of Pay') && daysDiff >= 10) {
            return { allowed: true };
        }

        const saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // NEW: For Casual and LOP, check if leave span includes a working Saturday
        const isCasualOrLOP = requestType === 'Casual' || requestType === 'Loss of Pay';
        let hasWorkingSaturdayInSpan = false;
        if (isCasualOrLOP) {
            for (const dateStr of leaveDates) {
                const date = parseISTDate(dateStr);
                if (date.getDay() === 6 && this.isWorkingSaturday(date, saturdayPolicy)) {
                    hasWorkingSaturdayInSpan = true;
                    break;
                }
            }
        }

        // Block Friday and Monday (unless already allowed above)
        for (const dateStr of leaveDates) {
            const date = parseISTDate(dateStr);
            const dayOfWeek = date.getDay();
            const dayName = dayNames[dayOfWeek];

            // NEW: Allow Saturdays for Casual and LOP
            if (dayOfWeek === 6) { // Saturday
                if (isCasualOrLOP) {
                    // LOP: Allow both working and non-working Saturdays (no restrictions)
                    if (requestType === 'Loss of Pay') {
                        continue; // Allow all Saturdays for LOP
                    }
                    // Casual: Only allow working Saturdays
                    if (!this.isWorkingSaturday(date, saturdayPolicy)) {
                        const dateStrFormatted = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        return {
                            allowed: false,
                            reason: `Leave cannot be applied on non-working Saturday (${dateStrFormatted}). This Saturday is a week off according to your schedule.`,
                            rule: 'NON_WORKING_SATURDAY_BLOCKED'
                        };
                    }
                    // Working Saturday - allow for Casual
                    continue;
                }
            }

            // Block Friday (day 5) - EXCEPT Planned Leave when Saturday clubbing applies OR Casual/LOP with working Saturday
            if (dayOfWeek === 5) { // Friday
                // CRITICAL FIX: For Planned Leave, check Saturday after Friday
                if (requestType === 'Planned' && saturdayPolicy !== 'All Saturdays Working') {
                    const saturdayAfterFriday = new Date(date);
                    saturdayAfterFriday.setDate(saturdayAfterFriday.getDate() + 1);
                    const saturdayDate = parseISTDate(getISTDateString(saturdayAfterFriday));
                    
                    // ALLOW Friday for Planned Leave in two scenarios:
                    // 1. Saturday after is a WORKING day (no clubbing risk)
                    // 2. Saturday after is a WEEK OFF (Saturday will be clubbed automatically)
                    if (this.isWorkingSaturday(saturdayDate, saturdayPolicy)) {
                        // Saturday is working - no clubbing risk, allow Friday
                        continue;
                    } else if (this.isSaturdayOff(saturdayDate, saturdayPolicy)) {
                        // Saturday is week off - allow Friday (Saturday will be clubbed)
                        continue;
                    }
                }
                
                // For 'All Saturdays Working' policy, Planned Leave on Friday is always allowed
                if (requestType === 'Planned' && saturdayPolicy === 'All Saturdays Working') {
                    continue; // Allow Friday for Planned Leave
                }

                // NEW: Allow Friday for Casual/LOP if the Saturday after is a working Saturday in the leave span
                if (isCasualOrLOP) {
                    const saturdayAfterFriday = new Date(date);
                    saturdayAfterFriday.setDate(saturdayAfterFriday.getDate() + 1);
                    const saturdayDate = parseISTDate(getISTDateString(saturdayAfterFriday));
                    const saturdayDateStr = getISTDateString(saturdayAfterFriday);
                    
                    // LOP: Allow Friday without restrictions
                    if (requestType === 'Loss of Pay') {
                        continue; // Allow Friday for LOP
                    }
                    
                    // Casual: Check if Saturday is in leave span AND is a working Saturday
                    if (leaveDates.includes(saturdayDateStr) && this.isWorkingSaturday(saturdayDate, saturdayPolicy)) {
                        continue; // Allow Friday
                    }
                }
                
                const dateStrFormatted = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                return {
                    allowed: false,
                    reason: `Leave cannot be applied on Friday (${dateStrFormatted}). Employees are not allowed to apply leave on Friday. Please contact Admin if this is necessary.`,
                    rule: 'FRIDAY_BLOCKED'
                };
            }
            
            // Block Monday (day 1) - EXCEPT Planned Leave when Saturday clubbing applies OR Casual/LOP with working Saturday
            if (dayOfWeek === 1) { // Monday
                // CRITICAL FIX: For Planned Leave, check Saturday before Monday
                if (requestType === 'Planned' && saturdayPolicy !== 'All Saturdays Working') {
                    const saturdayBeforeMonday = new Date(date);
                    saturdayBeforeMonday.setDate(saturdayBeforeMonday.getDate() - 2);
                    const saturdayDate = parseISTDate(getISTDateString(saturdayBeforeMonday));
                    
                    // ALLOW Monday for Planned Leave in two scenarios:
                    // 1. Saturday before is a WORKING day (no clubbing risk)
                    // 2. Saturday before is a WEEK OFF (Saturday will be clubbed automatically)
                    if (this.isWorkingSaturday(saturdayDate, saturdayPolicy)) {
                        // Saturday is working - no clubbing risk, allow Monday
                        continue;
                    } else if (this.isSaturdayOff(saturdayDate, saturdayPolicy)) {
                        // Saturday is week off - allow Monday (Saturday will be clubbed)
                        continue;
                    }
                }
                
                // For 'All Saturdays Working' policy, Planned Leave on Monday is always allowed
                if (requestType === 'Planned' && saturdayPolicy === 'All Saturdays Working') {
                    continue; // Allow Monday for Planned Leave
                }

                // NEW: For Casual/LOP, check Saturday before Monday
                if (isCasualOrLOP) {
                    const saturdayBeforeMonday = new Date(date);
                    saturdayBeforeMonday.setDate(saturdayBeforeMonday.getDate() - 2);
                    const saturdayDate = parseISTDate(getISTDateString(saturdayBeforeMonday));
                    const saturdayDateStr = getISTDateString(saturdayBeforeMonday);
                    
                    // LOP: No Monday restrictions (allow Monday even after non-working Saturday)
                    if (requestType === 'Loss of Pay') {
                        continue; // Allow Monday for LOP
                    }
                    
                    // Casual: Block Monday if Saturday before is a non-working Saturday (weekend clubbing prevention)
                    if (!this.isWorkingSaturday(saturdayDate, saturdayPolicy)) {
                        const dateStrFormatted = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                        return {
                            allowed: false,
                            reason: `Monday (${dateStrFormatted}) leave cannot be applied as the Saturday before is a non-working day. This prevents weekend clubbing.`,
                            rule: 'MONDAY_AFTER_NON_WORKING_SATURDAY_BLOCKED'
                        };
                    }
                    
                    // Allow Monday only if Saturday is in leave span AND is a working Saturday
                    if (leaveDates.includes(saturdayDateStr) && this.isWorkingSaturday(saturdayDate, saturdayPolicy)) {
                        continue; // Allow Monday
                    }
                }
                
                const dateStrFormatted = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                return {
                    allowed: false,
                    reason: ` Monday (${dateStrFormatted}) leave applications are restricted by company leave policy due to weekend clubbing rules. Administrative approval is required to proceed.`,
                    rule: 'MONDAY_BLOCKED'
                };
            }
            
            // NOTE: Tuesday/Thursday advance restriction (10-day notice requirement) was intentionally removed
            // as per updated leave policy. Employees can now apply leave on Tuesday and Thursday regardless
            // of advance notice period. Friday and Monday restrictions remain in effect.
        }
        
        return { allowed: true };
    }

    /**
     * Count working days for Planned Leave (IST-based). Excludes Sundays, non-working Saturdays, and holidays.
     * @param {Array<string|Date>} leaveDates
     * @param {Object} employee - Employee doc (alternateSaturdayPolicy)
     * @returns {Promise<number>}
     */
    static async countWorkingDaysForPlannedLeave(leaveDates, employee) {
        if (!leaveDates || leaveDates.length === 0) return 0;
        const first = parseISTDate(leaveDates[0]);
        const last = parseISTDate(leaveDates[leaveDates.length - 1]);
        const rangeStart = new Date(first.getFullYear(), first.getMonth(), first.getDate());
        const rangeEnd = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
        const holidays = await Holiday.find({
            date: { $gte: rangeStart, $lte: rangeEnd }
        }).lean();
        let workingDays = 0;
        const saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
        for (const dateStr of leaveDates) {
            const date = parseISTDate(dateStr);
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0) continue; // Sunday
            if (dayOfWeek === 6 && this.isSaturdayOff(date, saturdayPolicy)) continue; // Non-working Saturday
            const isHoliday = holidays.some(h => {
                if (!h.date || h.isTentative) return false;
                return getISTDateString(parseISTDate(h.date)) === getISTDateString(date);
            });
            if (isHoliday) continue;
            workingDays++;
        }
        return workingDays;
    }

    /**
     * Check if Saturday is OFF based on policy
     */
    static isSaturdayOff(date, saturdayPolicy) {
        if (date.getDay() !== 6) return false;
        
        const weekNum = Math.ceil(date.getDate() / 7);
        
        switch (saturdayPolicy) {
            case 'All Saturdays Off':
                return true;
            case 'All Saturdays Working':
                return false;
            case 'Week 1 & 3 Off':
                return (weekNum === 1 || weekNum === 3);
            case 'Week 2 & 4 Off':
                return (weekNum === 2 || weekNum === 4);
            default:
                return false;
        }
    }

    /**
     * Validate Saturday Clubbing Leave Policy
     * 
     * BUSINESS RULES:
     * 1. If a week contains a Saturday that is "Weekly Off" (based on employee's Saturday policy),
     *    then employee CANNOT take leave on:
     *    - Friday immediately BEFORE that Saturday
     *    - Monday immediately AFTER that Saturday
     * 
     * 2. Leave Type Restrictions:
     *    - Casual Leave: NOT ALLOWED at all under Saturday clubbing scenarios
     *    - Planned Leave (Paid Leave): ALLOWED - Saturday can be clubbed automatically
     *    - LOP (Loss of Pay) Leave: ALLOWED (no restrictions)
     * 
     * This prevents employees from clubbing:
     * - Friday + Saturday + Sunday
     * - Saturday + Sunday + Monday
     * - Friday + Saturday + Sunday + Monday
     * 
     * EXCEPTION: Planned Leave (Paid Leave) can be clubbed on Saturday - if employee takes
     * leave on Friday and Monday, Saturday (if it's a week off) will be automatically included.
     * 
     * @param {Object} employee - Employee document with alternateSaturdayPolicy
     * @param {Array<string|Date>} leaveDates - Array of leave dates (normalized to YYYY-MM-DD or Date)
     * @param {string} requestType - Leave request type (Casual, Planned, Loss of Pay, etc.)
     * @returns {{ allowed: boolean, reason?: string, rule?: string }}
     */
    static validateSaturdayClubbingLeavePolicy(employee, leaveDates, requestType) {
        if (!leaveDates || leaveDates.length === 0) {
            return { allowed: true };
        }

        const saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';
        
        // If all Saturdays are working, no restrictions apply
        if (saturdayPolicy === 'All Saturdays Working') {
            return { allowed: true };
        }

        // Check each leave date
        for (const leaveDate of leaveDates) {
            const date = parseISTDate(leaveDate);
            const dateStr = getISTDateString(date);
            const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
            
            let isRestricted = false;
            let restrictionType = null; // 'friday' or 'monday'
            let saturdayDate = null;

            // Check if leave date is Friday (day 5)
            if (dayOfWeek === 5) {
                // Get Saturday in the same week (next day)
                saturdayDate = new Date(date);
                saturdayDate.setDate(saturdayDate.getDate() + 1);
                // Normalize to IST to ensure consistency
                saturdayDate = parseISTDate(getISTDateString(saturdayDate));
                
                // Check if this Saturday is a weekly off
                if (this.isSaturdayOff(saturdayDate, saturdayPolicy)) {
                    isRestricted = true;
                    restrictionType = 'friday';
                }
            }
            // Check if leave date is Monday (day 1)
            else if (dayOfWeek === 1) {
                // Get Saturday in the previous week (2 days before)
                saturdayDate = new Date(date);
                saturdayDate.setDate(saturdayDate.getDate() - 2); // Monday - 2 days = Saturday
                // Normalize to IST to ensure consistency
                saturdayDate = parseISTDate(getISTDateString(saturdayDate));
                
                // Check if this Saturday is a weekly off
                if (this.isSaturdayOff(saturdayDate, saturdayPolicy)) {
                    isRestricted = true;
                    restrictionType = 'monday';
                }
            }

            // If this date is restricted, apply leave type rules
            if (isRestricted) {
                // NEW: Sick Leave is exempt from Saturday clubbing (unplanned leave)
                if (requestType === 'Sick') {
                    // Continue checking other dates - no restriction
                    continue;
                }

                // Rule 2.1: Casual Leave is NOT ALLOWED
                if (requestType === 'Casual') {
                    const dayName = restrictionType === 'friday' ? 'Friday' : 'Monday';
                    const saturdayStr = getISTDateString(saturdayDate);
                    return {
                        allowed: false,
                        reason: `Leave request rejected due to Saturday clubbing policy. You cannot apply Casual Leave on ${dayName} (${dateStr}) before or after a weekly-off Saturday (${saturdayStr}). Only Planned Leave (Paid Leave), Sick Leave, or Loss of Pay (LOP) Leave is allowed.`,
                        rule: 'SATURDAY_CLUBBING_CASUAL_BLOCKED'
                    };
                }

                // Rule 2.2: Planned Leave (Paid Leave) is ALLOWED - Saturday can be clubbed
                // No advance notice requirement for Planned Leave clubbing
                if (requestType === 'Planned') {
                    // Planned leave is allowed - continue checking other dates
                    continue;
                }

                // Rule 2.3: LOP Leave is ALLOWED - no restrictions
                // Continue checking other dates
            }
        }

        // All dates passed validation
        return { allowed: true };
    }

    /**
     * Automatically club Saturday in leave dates for Planned Leave (Paid Leave) ONLY.
     *
     * BUSINESS RULE: If an employee takes Planned Leave on Friday and Monday, and the
     * Saturday between them is a "Week off", that Saturday is automatically included —
     * BUT ONLY when the leave was applied at least 30 days before the first leave date
     * (i.e. the standard Planned Leave advance-notice requirement is satisfied).
     *
     * Saturday clubbing NEVER applies to Casual, Sick, or Loss of Pay leave.
     *
     * @param {Object}           employee    - Employee document with alternateSaturdayPolicy
     * @param {Array<string|Date>} leaveDates - Leave dates (YYYY-MM-DD strings or Date objects)
     * @param {string}           requestType - Leave request type
     * @param {Date|string|null} appliedDate - Date the leave was applied (defaults to today).
     *                                         Used to enforce the ≥30-day advance-notice guard.
     * @returns {Array<string>} Updated leave-dates array with Saturday clubbed (if eligible)
     */
    static clubSaturdayInLeaveDates(employee, leaveDates, requestType, appliedDate = null) {
        // Only applies to Planned (Paid) Leave — Casual / Sick / LOP are never eligible
        if (requestType !== 'Planned') {
            return leaveDates.map(d => typeof d === 'string' ? d : getISTDateString(parseISTDate(d)));
        }

        const saturdayPolicy = employee?.alternateSaturdayPolicy || 'All Saturdays Working';

        // If all Saturdays are working days, clubbing is irrelevant
        if (saturdayPolicy === 'All Saturdays Working') {
            return leaveDates.map(d => typeof d === 'string' ? d : getISTDateString(parseISTDate(d)));
        }

        // ── ADVANCE-NOTICE GUARD ────────────────────────────────────────────────
        // Saturday clubbing is only allowed when the Planned Leave was applied at
        // least 30 days before the first leave date.  Last-minute Planned Leave must
        // NOT silently absorb a week-off Saturday.
        const referenceDate = appliedDate
            ? parseISTDate(getISTDateString(appliedDate instanceof Date ? appliedDate : new Date(appliedDate)))
            : parseISTDate(getISTDateString());          // default: today
        const firstDateStr = typeof leaveDates[0] === 'string'
            ? leaveDates[0]
            : getISTDateString(leaveDates[0]);
        const normalizedFirst = parseISTDate(firstDateStr);
        const daysDiff = Math.floor((normalizedFirst - referenceDate) / (1000 * 60 * 60 * 24));
        if (daysDiff < 30) {
            // Advance notice not satisfied — return dates unchanged, no Saturday clubbed
            return leaveDates.map(d => typeof d === 'string' ? d : getISTDateString(parseISTDate(d)));
        }
        // ────────────────────────────────────────────────────────────────────────

        // Convert all dates to normalized strings
        const normalizedDates = leaveDates.map(d => {
            const date = parseISTDate(d);
            return getISTDateString(date);
        });

        // Create a Set for quick lookup
        const dateSet = new Set(normalizedDates);
        const resultDates = [...normalizedDates];

        // Check if leave includes Friday and Monday
        let hasFriday = false;
        let hasMonday = false;
        let fridayDate = null;
        let mondayDate = null;

        for (const dateStr of normalizedDates) {
            const date = parseISTDate(dateStr);
            const dayOfWeek = date.getDay();
            
            if (dayOfWeek === 5) { // Friday
                hasFriday = true;
                fridayDate = date;
            } else if (dayOfWeek === 1) { // Monday
                hasMonday = true;
                mondayDate = date;
            }
        }

        // If both Friday and Monday are present, check for Saturday clubbing
        if (hasFriday && hasMonday) {
            // When both Friday and Monday are present, there's only one Saturday between them
            // Check Saturday after Friday (which is also Saturday before Monday)
            if (fridayDate) {
                const saturdayAfterFriday = new Date(fridayDate);
                saturdayAfterFriday.setDate(saturdayAfterFriday.getDate() + 1);
                const saturdayStr = getISTDateString(parseISTDate(getISTDateString(saturdayAfterFriday)));
                
                // Check if this Saturday is a week off and not already in leave dates
                if (this.isSaturdayOff(parseISTDate(saturdayStr), saturdayPolicy) && !dateSet.has(saturdayStr)) {
                    resultDates.push(saturdayStr);
                    dateSet.add(saturdayStr); // Add to set to prevent duplicates
                }
            }
        } else if (hasFriday) {
            // Only Friday - check Saturday after Friday
            if (fridayDate) {
                const saturdayAfterFriday = new Date(fridayDate);
                saturdayAfterFriday.setDate(saturdayAfterFriday.getDate() + 1);
                const saturdayStr = getISTDateString(parseISTDate(getISTDateString(saturdayAfterFriday)));
                
                // Check if this Saturday is a week off and not already in leave dates
                if (this.isSaturdayOff(parseISTDate(saturdayStr), saturdayPolicy) && !dateSet.has(saturdayStr)) {
                    resultDates.push(saturdayStr);
                }
            }
        } else if (hasMonday) {
            // Only Monday - check Saturday before Monday
            if (mondayDate) {
                const saturdayBeforeMonday = new Date(mondayDate);
                saturdayBeforeMonday.setDate(saturdayBeforeMonday.getDate() - 2);
                const saturdayStr = getISTDateString(parseISTDate(getISTDateString(saturdayBeforeMonday)));
                
                // Check if this Saturday is a week off and not already in leave dates
                if (this.isSaturdayOff(parseISTDate(saturdayStr), saturdayPolicy) && !dateSet.has(saturdayStr)) {
                    resultDates.push(saturdayStr);
                }
            }
        }

        // Sort dates and return
        return resultDates.sort();
    }

    /**
     * Log admin override actions for audit purposes
     * @param {Object} employee - Employee object
     * @param {Array} leaveDates - Array of leave dates
     * @param {String} requestType - Leave request type
     * @param {String} leaveType - Leave type
     * @param {String} overrideReason - Admin override reason
     */
    static async logAdminOverride(employee, leaveDates, requestType, leaveType, overrideReason) {
        try {
            await logAction({
                action: 'LEAVE_POLICY_ADMIN_OVERRIDE',
                userId: employee._id.toString(),
                details: {
                    employeeCode: employee.employeeCode,
                    employeeName: employee.fullName,
                    requestType: requestType,
                    leaveType: leaveType,
                    leaveDates: leaveDates.map(d => getISTDateString(parseISTDate(d))),
                    overrideReason: overrideReason,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error logging admin override:', error);
        }
    }

    /**
     * Validate leave application (employee apply flow). Single entry for all apply-time rules.
     * Includes: overlap check, policy (monthly cap, weekdays, type-specific), sick cert, balance.
     * @param {Object} request - { requestType, leaveType, leaveDates, alternateDate, medicalCertificate }
     * @param {Object} employee - Employee document
     * @param {Object} [context] - { excludeRequestId } for update flows
     * @returns {Promise<{ valid: boolean, errors: string[], warnings: string[] }>}
     */
    static async validateApply(request, employee, context = {}) {
        const errors = [];
        const warnings = [];
        let { requestType, leaveType, leaveDates, alternateDate, medicalCertificate, reason } = request;
        const { excludeRequestId } = context;

        requestType = this.normalizeRequestType(requestType);

        if (!leaveDates || leaveDates.length === 0) {
            return { valid: false, errors: ['Leave dates are required.'], warnings: [] };
        }

        // CRITICAL: Apply Saturday clubbing for Planned Leave BEFORE validation.
        // Saturday is only clubbed when advance notice ≥ 30 days is met (enforced inside
        // clubSaturdayInLeaveDates). Casual / Sick / LOP are never affected.
        if (requestType === 'Planned') {
            const clubbedDates = this.clubSaturdayInLeaveDates(employee, leaveDates, requestType, null /* appliedDate = today */);
            // Convert clubbed date strings back to Date objects or keep as strings (depending on input format)
            leaveDates = clubbedDates.map(d => {
                // If input was Date objects, return Date objects; if strings, return strings
                const originalWasDate = leaveDates.some(ld => ld instanceof Date);
                return originalWasDate ? parseISTDate(d) : d;
            });
            // Update request object with clubbed dates for downstream use
            request.leaveDates = leaveDates;
        }

        // Reason minimum length (parity with frontend: 100 characters)
        if (reason !== undefined && reason !== null) {
            const trimmed = String(reason).trim();
            if (trimmed.length < 100) {
                return { valid: false, errors: ['Reason must be at least 100 characters long.'], warnings: [] };
            }
        }

        // NEW SICK LEAVE LOGIC: Medical certificate is optional at application time
        if (requestType === 'Sick') {
            const { getRetrospectiveWindowDays, getMedicalCertThresholdDays, getMedicalProofDeadlineDays } = require('../utils/sickLeaveConfig');
            const { parseISTDate, getISTDateString } = require('../utils/istTime');
            
            const today = parseISTDate(getISTDateString());
            const firstLeaveDate = parseISTDate(leaveDates[0]);
            const lastLeaveDate = parseISTDate(leaveDates[leaveDates.length - 1]);
            const daysDiff = Math.floor((firstLeaveDate - today) / (1000 * 60 * 60 * 24));
            const daysSinceLeaveEnd = Math.floor((today - lastLeaveDate) / (1000 * 60 * 60 * 24));
            const duration = leaveDates.length * (leaveType === 'Full Day' ? 1 : 0.5);
            
            // Validate retrospective window (if applying after leave date)
            if (daysSinceLeaveEnd > 0) {
                const retrospectiveWindow = await getRetrospectiveWindowDays();
                // Count working days since leave end (excluding weekends/holidays)
                const workingDaysSinceLeave = await this.countWorkingDaysSinceDate(lastLeaveDate, today, employee);
                if (workingDaysSinceLeave > retrospectiveWindow) {
                    return {
                        valid: false,
                        errors: [`Sick leave must be applied within ${retrospectiveWindow} working day${retrospectiveWindow !== 1 ? 's' : ''} after the leave date. This leave ended ${workingDaysSinceLeave} working day${workingDaysSinceLeave !== 1 ? 's' : ''} ago.`],
                        warnings: []
                    };
                }
            }
            
            // Medical certificate is OPTIONAL at application time
            // Determine proof status based on leave timing and duration
            const hasCertificate = medicalCertificate && (typeof medicalCertificate === 'string' ? medicalCertificate.trim() : medicalCertificate);
            const isFutureDated = daysDiff > 0;
            const isSameDay = daysDiff === 0;
            const isRetrospective = daysSinceLeaveEnd > 0;
            
            // Determine if certificate will be required (based on consecutive days threshold)
            const certThreshold = await getMedicalCertThresholdDays();
            const willRequireCert = duration >= certThreshold;
            
            // Set medical proof status
            let medicalProofStatus = 'NotRequired';
            let medicalProofRequired = false;
            let medicalProofDeadline = null;
            
            if (hasCertificate) {
                medicalProofStatus = 'Provided';
            } else if (isFutureDated && willRequireCert) {
                // Future-dated SL that will require certificate
                medicalProofStatus = 'Pending';
                medicalProofRequired = true;
                const proofDeadlineDays = await getMedicalProofDeadlineDays();
                const deadline = new Date(lastLeaveDate);
                deadline.setDate(deadline.getDate() + proofDeadlineDays);
                medicalProofDeadline = deadline;
            } else if (isFutureDated) {
                // Future-dated but below threshold - optional
                medicalProofStatus = 'NotRequired';
            } else if (isRetrospective && willRequireCert) {
                // Retrospective SL that requires certificate
                medicalProofStatus = 'Pending';
                medicalProofRequired = true;
                const proofDeadlineDays = await getMedicalProofDeadlineDays();
                const deadline = new Date(today);
                deadline.setDate(deadline.getDate() + proofDeadlineDays);
                medicalProofDeadline = deadline;
            } else if (isSameDay && willRequireCert) {
                // Same-day SL that requires certificate
                medicalProofStatus = 'Pending';
                medicalProofRequired = true;
                const proofDeadlineDays = await getMedicalProofDeadlineDays();
                const deadline = new Date(today);
                deadline.setDate(deadline.getDate() + proofDeadlineDays);
                medicalProofDeadline = deadline;
            }
            
            // Add warnings for future-dated SL without certificate
            if (isFutureDated && !hasCertificate && willRequireCert) {
                warnings.push(`Medical certificate will be required for this ${duration}-day sick leave. Please upload it by ${medicalProofDeadline.toLocaleDateString()} or after the leave date.`);
            }
            
            // Store proof status in request object (will be saved to DB)
            request.medicalProofStatus = medicalProofStatus;
            request.medicalProofRequired = medicalProofRequired;
            request.medicalProofDeadline = medicalProofDeadline;
            if (hasCertificate) {
                request.medicalCertificateUploadedAt = new Date();
            }
        }

        const policyCheck = await this.validateRequest(
            employee._id,
            leaveDates,
            requestType,
            leaveType || 'Full Day',
            null,
            alternateDate,
            { excludeRequestId }
        );
        if (!policyCheck.allowed) {
            const result = { valid: false, errors: [policyCheck.reason], warnings: [] };
            // Include monthly limit details for frontend warning
            if (policyCheck.rule === 'MONTHLY_WORKING_DAYS_LIMIT') {
                result.alreadyUsed = policyCheck.alreadyUsed;
                result.requestedDays = policyCheck.requestedDays;
                result.remainingDays = policyCheck.remainingDays;
                result.totalAfterRequest = policyCheck.totalAfterRequest;
            }
            return result;
        }

        const leaveDuration = leaveDates.length * (leaveType === 'Full Day' ? 1 : 0.5);
        const balanceCheck = this.checkLeaveBalance(employee, requestType, leaveDuration);
        if (!balanceCheck.sufficient) {
            return { valid: false, errors: [balanceCheck.reason], warnings: [] };
        }

        // Return validation result with medical proof status fields for Sick Leave
        const result = { valid: true, errors: [], warnings: [] };

        // Extract monthly working days info from policy check for frontend warnings
        // Always include monthly limit info for non-Planned, non-Compensatory leaves
        if (policyCheck.alreadyUsed !== undefined && requestType !== 'Planned' && requestType !== 'Compensatory') {
            const remaining = policyCheck.remainingDays !== undefined ? policyCheck.remainingDays : Math.max(0, 5 - (policyCheck.totalAfterRequest || 0));
            // Always store monthly limit info in result for frontend (even when allowed)
            result.alreadyUsed = policyCheck.alreadyUsed;
            result.requestedDays = policyCheck.requestedDays;
            result.remainingDays = remaining;
            result.totalAfterRequest = policyCheck.totalAfterRequest;
            
            // Add warning if close to limit or would exceed
            if (policyCheck.totalAfterRequest > 5) {
                result.warnings.push(`This request would exceed the monthly limit of 5 working days. You have already used ${policyCheck.alreadyUsed} working day${policyCheck.alreadyUsed !== 1 ? 's' : ''} and this request adds ${policyCheck.requestedDays} more, totaling ${policyCheck.totalAfterRequest} working days.`);
            } else if (remaining <= 1 && remaining >= 0) {
                result.warnings.push(`Warning: You have already used ${policyCheck.alreadyUsed} working day${policyCheck.alreadyUsed !== 1 ? 's' : ''} of leave this month. This request of ${policyCheck.requestedDays} working day${policyCheck.requestedDays !== 1 ? 's' : ''} will leave you with ${remaining} working day${remaining !== 1 ? 's' : ''} remaining for the month.`);
            }
        }
        if (requestType === 'Sick') {
            result.medicalProofStatus = request.medicalProofStatus;
            result.medicalProofRequired = request.medicalProofRequired;
            result.medicalProofDeadline = request.medicalProofDeadline;
            if (request.medicalCertificateUploadedAt) {
                result.medicalCertificateUploadedAt = request.medicalCertificateUploadedAt;
            }
        }
        return result;
    }

    /**
     * Validate that approval is allowed (e.g. balance sufficient at approval time). Used in PATCH status.
     * Prevents approving when balance has been consumed since apply.
     * @param {Object} request - LeaveRequest document (with leaveDates, leaveType, requestType)
     * @param {Object} employee - Employee document (with leaveBalances)
     * @returns {{ allowed: boolean, reason?: string }}
     */
    static validateApproval(request, employee) {
        const requestType = this.normalizeRequestType(request.requestType);
        const leaveField = this.getBalanceField(requestType);
        const duration = request.leaveDates.length * (request.leaveType === 'Full Day' ? 1 : 0.5);

        // Backdated Leave: use resolver (Permanent = sick then casual; Intern/Probation = no deduction)
        if (leaveField === 'backdated') {
            const resolved = this.resolveBalanceForBackdatedLeave(employee, duration);
            if (resolved.deduct === false) return { allowed: true };
            if (resolved.allowed === false) return { allowed: false, reason: resolved.reason };
            return { allowed: true };
        }

        if (!leaveField) {
            return { allowed: true }; // LOP, Compensatory, etc. - no balance check
        }
        const balance = employee.leaveBalances?.[leaveField] ?? 0;
        if (balance < duration) {
            return {
                allowed: false,
                reason: `Insufficient leave balance at approval time. Required ${duration} day(s), available ${balance}.`
            };
        }
        return { allowed: true };
    }

    /**
     * Validate admin update (PUT) when dates/type/status change and result would be Approved.
     * Re-runs policy with optional admin override.
     * @param {Object} oldRequest - Current LeaveRequest document
     * @param {Object} newRequest - New payload (leaveDates, requestType, leaveType, status)
     * @param {Object} employee - Employee document
     * @param {Object} [context] - { adminOverrideReason }
     * @returns {Promise<{ allowed: boolean, reason?: string }>}
     */
    static async validateAdminUpdate(oldRequest, newRequest, employee, context = {}) {
        const { adminOverrideReason, isAdminUpdate } = context;
        const newDates = newRequest.leaveDates || oldRequest.leaveDates;
        const newRequestType = newRequest.requestType ?? oldRequest.requestType;
        const newLeaveType = newRequest.leaveType ?? oldRequest.leaveType;
        const newStatus = newRequest.status ?? oldRequest.status;
        if (newStatus !== 'Approved') {
            return { allowed: true };
        }
        // Use the applied date (createdAt) from the request for advance notice calculation
        // Prefer newRequest.createdAt if it was updated, otherwise use oldRequest.createdAt
        const appliedDate = newRequest.createdAt || oldRequest.createdAt;
        const policyCheck = await this.validateRequest(
            employee._id,
            newDates,
            newRequestType,
            newLeaveType,
            adminOverrideReason || `Admin update by admin`,
            newRequest.alternateDate ?? oldRequest.alternateDate,
            { 
                excludeRequestId: oldRequest._id, 
                appliedDate,
                isAdminUpdate // Pass the flag to bypass advance notice checks
            }
        );
        if (!policyCheck.allowed) {
            return { allowed: false, reason: policyCheck.reason };
        }
        const duration = newDates.length * (newLeaveType === 'Full Day' ? 1 : 0.5);
        const balanceCheck = this.checkLeaveBalance(employee, newRequestType, duration);
        if (!balanceCheck.sufficient) {
            return { allowed: false, reason: balanceCheck.reason };
        }
        return { allowed: true };
    }

    /**
     * Check if an employee has sufficient leave balance
     * @param {Object} employee - Employee object
     * @param {String} requestType - Leave request type
     * @param {Number} leaveDuration - Duration of leave in days
     * @returns {Object} Balance check result
     */
    static checkLeaveBalance(employee, requestType, leaveDuration) {
        if (!employee.leaveBalances) {
            return {
                sufficient: false,
                reason: 'Your leave balance information is not available. Please contact HR to resolve this issue.'
            };
        }

        requestType = this.normalizeRequestType(requestType);

        // Backdated Leave: Intern/Probation no deduction; Permanent must have Sick + Casual >= duration
        if (requestType === 'Backdated Leave') {
            if (employee.employmentStatus === 'Intern' || employee.employmentStatus === 'Probation') {
                return { sufficient: true, reason: 'No balance check required (LOP only for your status).' };
            }
            if (employee.employmentStatus === 'Permanent') {
                const sick = employee.leaveBalances.sick ?? 0;
                const casual = employee.leaveBalances.casual ?? 0;
                const total = sick + casual;
                if (total < leaveDuration) {
                    return {
                        sufficient: false,
                        reason: `Insufficient leave balance for backdated leave. You have ${sick} sick and ${casual} casual (combined: ${total}) day(s), but this request requires ${leaveDuration} day(s). Deduction uses sick leave first, then casual.`
                    };
                }
                return { sufficient: true, reason: 'Sufficient balance available (sick + casual).' };
            }
            return { sufficient: true, reason: 'No balance check required.' };
        }

        let balanceField;
        let leaveTypeName;
        switch (requestType) {
            case 'Sick':
                balanceField = 'sick';
                leaveTypeName = 'sick';
                break;
            case 'Planned':
                balanceField = 'paid';
                leaveTypeName = 'planned';
                break;
            case 'Casual':
                balanceField = 'casual';
                leaveTypeName = 'casual';
                break;
            case 'Loss of Pay':
            case 'Compensatory':
                return { sufficient: true, reason: 'No balance check required' };
            default:
                return {
                    sufficient: false,
                    reason: `Unable to process this leave type. Please contact HR for assistance.`
                };
        }

        const availableBalance = employee.leaveBalances[balanceField] || 0;
        if (availableBalance < leaveDuration) {
            const dayText = leaveDuration === 1 ? 'day' : 'days';
            const balanceText = availableBalance === 1 ? 'day' : 'days';
            return {
                sufficient: false,
                reason: `You have ${availableBalance} ${balanceText} of ${leaveTypeName} leave remaining, but this request requires ${leaveDuration} ${dayText}. Please reduce the duration or contact HR if you need additional leave.`
            };
        }

        return {
            sufficient: true,
            reason: 'Sufficient balance available'
        };
    }
}

module.exports = LeavePolicyService;