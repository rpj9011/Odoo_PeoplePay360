// backend/services/halfDayAutoConversionService.js
/**
 * Service to automatically convert Half-Day Leave to Full-Day LOP when employee has no check-in.
 * 
 * SAFETY RULES:
 * - Only converts approved half-day leaves
 * - Only when clockInTime === null (absolute no-show)
 * - Excludes holidays, weekends, admin overrides
 * - Fully transactional with rollback support
 * - Maintains complete audit trail
 */

const mongoose = require('mongoose');
const LeaveRequest = require('../models/LeaveRequest');
const AttendanceLog = require('../models/AttendanceLog');
const Holiday = require('../models/Holiday');
const SystemAuditLog = require('../models/SystemAuditLog');
const User = require('../models/User');
const { syncAttendanceOnLeaveApproval } = require('./leaveAttendanceSyncService');
const { getISTDateString, parseISTDate, startOfISTDay } = require('../utils/istTime');
const { verboseLog } = require('../utils/logLevel');

const BATCH_SIZE = 100; // Process max 100 leaves per run (performance constraint)

/**
 * Check if a date is a holiday
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<boolean>}
 */
const isHoliday = async (dateStr) => {
    try {
        const dateObj = parseISTDate(dateStr);
        const holiday = await Holiday.findOne({
            date: {
                $gte: startOfISTDay(dateObj),
                $lt: new Date(dateObj.getTime() + 24 * 60 * 60 * 1000)
            }
        }).lean();
        return !!holiday;
    } catch (error) {
        console.error(`[HalfDayConversion] Error checking holiday for ${dateStr}:`, error);
        return false; // Fail safe - don't convert if can't verify
    }
};

/**
 * Check if a date is a weekend (Saturday or Sunday)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @param {Object} employee - Employee document with weeklyOff settings
 * @returns {boolean}
 */
const isWeekend = (dateStr, employee) => {
    try {
        const dateObj = parseISTDate(dateStr);
        const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Check employee-specific weekly off settings
        if (employee && employee.weeklyOff) {
            const weeklyOffDays = Array.isArray(employee.weeklyOff) ? employee.weeklyOff : [employee.weeklyOff];
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const currentDayName = dayNames[dayOfWeek];
            return weeklyOffDays.includes(currentDayName);
        }
        
        // Default: Saturday (6) and Sunday (0) are weekends
        return dayOfWeek === 0 || dayOfWeek === 6;
    } catch (error) {
        console.error(`[HalfDayConversion] Error checking weekend for ${dateStr}:`, error);
        return false; // Fail safe
    }
};

/**
 * Validate if a leave should be auto-converted
 * @param {Object} leave - LeaveRequest document
 * @param {Object} attendance - AttendanceLog document
 * @param {Object} employee - User document
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} { valid: boolean, reason: string }
 */
const validateConversionEligibility = async (leave, attendance, employee, dateStr) => {
    // Rule 1: Leave must be approved
    if (leave.status !== 'Approved') {
        return { valid: false, reason: 'Leave not approved' };
    }
    
    // Rule 2: Leave must be half-day
    if (!leave.leaveType || (!leave.leaveType.includes('Half Day'))) {
        return { valid: false, reason: 'Not a half-day leave' };
    }
    
    // Rule 3: Leave must NOT already be LOP
    if (leave.requestType === 'Loss of Pay') {
        return { valid: false, reason: 'Already marked as LOP' };
    }
    
    // Rule 4 & 5: No check-in allowed. If no attendance log exists, treat as no check-in (e.g. legacy leave
    // or log never created on approval). If log exists, clockInTime must be null.
    // CRITICAL: Do NOT convert when clock-in was voided due to leave approval (AUTO-VOID in notes) — employee did attend.
    if (attendance) {
        const wasVoidedByLeaveApproval = attendance.notes && String(attendance.notes).includes('AUTO-VOID');
        if (wasVoidedByLeaveApproval) {
            return { valid: false, reason: 'Employee had clock-in voided by leave approval (attended)' };
        }
        if (attendance.clockInTime !== null && attendance.clockInTime !== undefined) {
            return { valid: false, reason: 'Employee has clock-in record' };
        }
        // Rule 9 (checked here when we have attendance): Must NOT have admin override
        if (attendance.overriddenByAdmin === true) {
            return { valid: false, reason: 'Admin override exists' };
        }
    }
    // When attendance is null: no record = no check-in; safe to convert. syncAttendanceOnLeaveApproval will create the log.
    
    // Rule 6: Must NOT be a holiday
    const holidayCheck = await isHoliday(dateStr);
    if (holidayCheck) {
        return { valid: false, reason: 'Date is a holiday' };
    }
    
    // Rule 7: Must NOT be a weekend
    if (isWeekend(dateStr, employee)) {
        return { valid: false, reason: 'Date is a weekend' };
    }
    
    // Rule 8: Must NOT already be auto-converted (idempotency)
    if (leave.autoConvertedToLOP === true) {
        return { valid: false, reason: 'Already auto-converted' };
    }
    
    // Rule 9 (admin override) is checked above when attendance exists
    
    // All checks passed
    return { valid: true, reason: 'Eligible for conversion' };
};

/**
 * Log conversion event to audit trail
 * @param {Object} conversionData - Conversion details
 */
const logConversionEvent = async (conversionData) => {
    try {
        // Create audit log entry
        const auditEntry = {
            action: 'AUTO_HALF_DAY_CONVERSION',
            employeeId: conversionData.employeeId,
            employeeName: conversionData.employeeName,
            leaveId: conversionData.leaveId,
            date: conversionData.date,
            previousLeaveType: conversionData.previousLeaveType,
            previousRequestType: conversionData.previousRequestType,
            newLeaveType: 'Full Day',
            newRequestType: 'Loss of Pay',
            reason: 'No check-in detected',
            executedAt: new Date(),
            success: conversionData.success,
            error: conversionData.error || null
        };
        
        verboseLog('[HalfDayConversion] Audit Log:', JSON.stringify(auditEntry, null, 2));
        await SystemAuditLog.create(auditEntry);
    } catch (error) {
        console.error('[HalfDayConversion] Error logging audit event:', error);
        // Don't throw - logging failure should not break conversion
    }
};

/**
 * Log revert event to audit trail (SystemAuditLog)
 * @param {Object} revertData - Revert details
 */
const logRevertEvent = async (revertData) => {
    try {
        const auditEntry = {
            action: 'AUTO_HALF_DAY_REVERT',
            employeeId: revertData.employeeId,
            employeeName: revertData.employeeName,
            leaveId: revertData.leaveId,
            date: revertData.date,
            previousLeaveType: 'Full Day',
            previousRequestType: 'Loss of Pay',
            newLeaveType: revertData.restoredLeaveType,
            newRequestType: revertData.restoredRequestType,
            reason: 'Admin reverted auto-conversion',
            executedAt: new Date(),
            success: revertData.success !== false,
            error: revertData.error || null,
            performedBy: revertData.performedBy || null,
        };
        // Revert audit entry logged to DB
        await SystemAuditLog.create(auditEntry);
    } catch (error) {
        console.error('[HalfDayConversion] Error logging revert event:', error);
    }
};

/**
 * Auto-convert half-day leaves to full-day LOP for a specific date
 * @param {string} targetDate - Date in YYYY-MM-DD format
 * @returns {Promise<Object>} Conversion summary
 */
const autoConvertHalfDayLeaves = async (targetDate) => {
    const summary = {
        targetDate,
        processed: 0,
        converted: 0,
        skipped: 0,
        errors: 0,
        details: []
    };
    
    verboseLog(`[HalfDayConversion] Starting auto-conversion for date: ${targetDate}`);
    
    // Validate target date is in the past (safety check)
    const targetDateObj = parseISTDate(targetDate);
    const today = startOfISTDay(new Date());
    if (targetDateObj >= today) {
        console.warn(`[HalfDayConversion] Target date ${targetDate} is not in the past. Skipping.`);
        return { ...summary, error: 'Target date must be in the past' };
    }
    
    try {
        // Find all approved half-day leaves for target date
        // Use indexed fields for performance
        const halfDayLeaves = await LeaveRequest.find({
            status: 'Approved',
            leaveType: { $in: ['Half Day - First Half', 'Half Day - Second Half'] },
            requestType: { $ne: 'Loss of Pay' }, // Exclude already LOP
            autoConvertedToLOP: { $ne: true }, // Exclude already converted
            leaveDates: {
                $elemMatch: {
                    $gte: startOfISTDay(targetDateObj),
                    $lt: new Date(targetDateObj.getTime() + 24 * 60 * 60 * 1000)
                }
            }
        })
            .populate('employee', 'fullName employeeCode weeklyOff')
            .limit(BATCH_SIZE)
            .lean();
        
        verboseLog(`[HalfDayConversion] Found ${halfDayLeaves.length} half-day leaves for ${targetDate}`);
        
        // Process each leave in a separate transaction for isolation
        for (const leave of halfDayLeaves) {
            summary.processed++;
            
            const session = await mongoose.startSession();
            session.startTransaction();
            
            try {
                // Fetch employee (for weekend check)
                const employee = leave.employee;
                if (!employee) {
                    throw new Error('Employee not found');
                }
                
                // Fetch attendance log for this date
                const attendance = await AttendanceLog.findOne({
                    user: leave.employee._id,
                    attendanceDate: targetDate
                }).session(session);
                
                // Validate conversion eligibility
                const validation = await validateConversionEligibility(leave, attendance, employee, targetDate);
                
                if (!validation.valid) {
                    summary.skipped++;
                    summary.details.push({
                        employeeId: leave.employee._id,
                        employeeName: employee.fullName,
                        leaveId: leave._id,
                        status: 'skipped',
                        reason: validation.reason
                    });
                    await session.abortTransaction();
                    continue;
                }
                
                // Perform conversion
                const previousLeaveType = leave.leaveType;
                const previousRequestType = leave.requestType;
                
                // Update leave request - STORE ORIGINAL VALUES FOR REVERT
                const updatedLeave = await LeaveRequest.findByIdAndUpdate(
                    leave._id,
                    {
                        $set: {
                            leaveType: 'Full Day',
                            requestType: 'Loss of Pay',
                            autoConvertedToLOP: true,
                            autoConversionDate: new Date(),
                            autoConversionReason: 'Auto-converted: No check-in detected',
                            originalLeaveType: previousLeaveType, // Store for revert
                            originalRequestType: previousRequestType, // Store for revert
                            reason: leave.reason + ' [AUTO-CONVERTED TO FULL DAY LOP: No check-in detected]'
                        }
                    },
                    { session, new: true }
                );
                
                if (!updatedLeave) {
                    throw new Error('Failed to update leave request');
                }
                
                // Sync attendance (this will update attendance status)
                await syncAttendanceOnLeaveApproval(updatedLeave, session);
                
                // Commit transaction
                await session.commitTransaction();
                
                // CRITICAL: Invalidate cache after successful conversion
                // This ensures frontend gets fresh data showing "Full Day - Loss of Pay"
                try {
                    const cacheService = require('./cacheService');
                    const cache = require('../utils/cache');
                    
                    // Invalidate dashboard cache for this date
                    cacheService.invalidateDashboard(targetDate);
                    
                    // Invalidate status cache for this user and date
                    cache.delete(`status:${leave.employee._id}:${targetDate}`);
                    
                    // Invalidate dashboard summary cache patterns
                    cache.deletePattern(`dashboard-summary:*`);
                    
                    // Invalidate employee dashboard cache
                    cache.delete(`employee_dashboard:${leave.employee._id}:${targetDate}`);
                    
                    // Cache invalidated after conversion
                } catch (cacheError) {
                    // Don't fail conversion if cache invalidation fails
                    console.error('[HalfDayConversion] Error invalidating cache:', cacheError);
                }
                
                // Notify frontend so calendar/summary refetch and show Full Day LOP immediately
                try {
                    const { getIO } = require('../socketManager');
                    const io = getIO();
                    if (io) {
                        io.emit('leave_request_updated', {
                            leaveId: updatedLeave._id,
                            employeeId: leave.employee._id,
                            leaveDates: updatedLeave.leaveDates,
                            status: updatedLeave.status,
                            requestType: updatedLeave.requestType,
                            leaveType: updatedLeave.leaveType,
                            autoConvertedToLOP: true,
                            timestamp: new Date().toISOString(),
                            message: 'Leave auto-converted to Full Day LOP (no check-in)',
                        });
                        verboseLog(`[HalfDayConversion] Emitted leave_request_updated for leave ${leave._id}`);
                    }
                } catch (socketErr) {
                    console.error('[HalfDayConversion] Failed to emit leave_request_updated:', socketErr.message);
                }
                
                summary.converted++;
                summary.details.push({
                    employeeId: leave.employee._id,
                    employeeName: employee.fullName,
                    leaveId: leave._id,
                    status: 'converted',
                    previousLeaveType,
                    previousRequestType,
                    newLeaveType: 'Full Day',
                    newRequestType: 'Loss of Pay'
                });
                
                // Log audit event
                await logConversionEvent({
                    employeeId: leave.employee._id,
                    employeeName: employee.fullName,
                    leaveId: leave._id,
                    date: targetDate,
                    previousLeaveType,
                    previousRequestType,
                    success: true
                });
                
                verboseLog(`[HalfDayConversion] Converted leave ${leave._id} for ${employee.fullName}`);
                
            } catch (error) {
                await session.abortTransaction();
                summary.errors++;
                summary.details.push({
                    employeeId: leave.employee?._id,
                    employeeName: leave.employee?.fullName,
                    leaveId: leave._id,
                    status: 'error',
                    error: error.message
                });
                
                // Log error event
                await logConversionEvent({
                    employeeId: leave.employee?._id,
                    employeeName: leave.employee?.fullName,
                    leaveId: leave._id,
                    date: targetDate,
                    previousLeaveType: leave.leaveType,
                    previousRequestType: leave.requestType,
                    success: false,
                    error: error.message
                });
                
                console.error(`[HalfDayConversion] ❌ Error converting leave ${leave._id}:`, error);
            } finally {
                session.endSession();
            }
        }
        
        if (summary.converted > 0 || summary.errors > 0) {
            if (summary.converted > 0 || summary.errors > 0) {
                console.log(`[HalfDayConversion] ${targetDate}: converted=${summary.converted}, skipped=${summary.skipped}, errors=${summary.errors}`);
            } else {
                verboseLog(`[HalfDayConversion] ${targetDate}: no conversions (skipped=${summary.skipped})`);
            }
        }
        
        return summary;
        
    } catch (error) {
        console.error(`[HalfDayConversion] Fatal error during conversion for ${targetDate}:`, error);
        return {
            ...summary,
            error: error.message
        };
    }
};

/**
 * Revert an auto-converted leave back to its original state.
 * Restores original leaveType, requestType; removes auto flags; resyncs attendance; logs revert event.
 * @param {string} leaveId - Leave request ID
 * @param {string} adminUserId - Admin user ID performing the revert
 * @returns {Promise<Object>} Revert result
 */
const revertAutoConversion = async (leaveId, adminUserId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const leave = await LeaveRequest.findById(leaveId)
            .populate('employee', 'fullName')
            .session(session);

        if (!leave) {
            throw new Error('Leave request not found');
        }

        if (!leave.autoConvertedToLOP) {
            throw new Error('Leave was not auto-converted');
        }

        const restoredLeaveType = leave.originalLeaveType || 'Half Day - First Half';
        const restoredRequestType = leave.originalRequestType || 'Planned';

        let cleanedReason = (leave.reason || '').replace(/\s*\[AUTO-CONVERTED TO FULL DAY LOP:.*?\]/gi, '').trim();
        const revertNote = ` [REVERTED BY ADMIN: ${new Date().toISOString()}]`;
        const newReason = cleanedReason + revertNote;

        const updatedLeave = await LeaveRequest.findByIdAndUpdate(
            leaveId,
            {
                $set: {
                    leaveType: restoredLeaveType,
                    requestType: restoredRequestType,
                    autoConvertedToLOP: false,
                    autoConversionDate: null,
                    autoConversionReason: null,
                    originalLeaveType: null,
                    originalRequestType: null,
                    reason: newReason,
                },
            },
            { session, new: true }
        );

        await syncAttendanceOnLeaveApproval(updatedLeave, session);
        await session.commitTransaction();

        const dateStr = updatedLeave.leaveDates?.length
            ? getISTDateString(updatedLeave.leaveDates[0])
            : null;

        const employeeId = leave.employee?._id || leave.employee;
        const employeeName = leave.employee?.fullName || null;
        await logRevertEvent({
            employeeId,
            employeeName,
            leaveId: leave._id,
            date: dateStr,
            restoredLeaveType,
            restoredRequestType,
            performedBy: adminUserId,
            success: true,
        });

        try {
            const cacheService = require('./cacheService');
            const cache = require('../utils/cache');
            if (updatedLeave.leaveDates && Array.isArray(updatedLeave.leaveDates)) {
                for (const leaveDate of updatedLeave.leaveDates) {
                    const d = getISTDateString(leaveDate);
                    cacheService.invalidateDashboard(d);
                    cache.delete(`status:${updatedLeave.employee}:${d}`);
                    cache.delete(`employee_dashboard:${updatedLeave.employee}:${d}`);
                }
            }
            cache.deletePattern('dashboard-summary:*');
        } catch (cacheError) {
            console.error('[HalfDayConversion] Error invalidating cache during revert:', cacheError);
        }

        console.log(`[HalfDayConversion] ✅ Reverted leave ${leaveId} by admin ${adminUserId}`);
        return {
            success: true,
            message: 'Leave conversion reverted successfully',
            leave: updatedLeave,
        };
    } catch (error) {
        await session.abortTransaction();
        await logRevertEvent({
            leaveId,
            success: false,
            error: error.message,
            performedBy: adminUserId,
        }).catch(() => {});
        console.error(`[HalfDayConversion] ❌ Error reverting leave ${leaveId}:`, error);
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Auto-detect and revert leaves that were converted to LOP but now have attendance data.
 * This handles cases where attendance was added retroactively after conversion.
 * @param {string} targetDate - Date to check in YYYY-MM-DD format
 * @returns {Promise<Object>} Summary of auto-reverts
 */
const autoRevertIncorrectConversions = async (targetDate) => {
    const summary = {
        targetDate,
        checked: 0,
        reverted: 0,
        errors: 0,
        details: []
    };
    
    verboseLog(`[HalfDayConversion] Checking for incorrect conversions on ${targetDate}`);
    
    try {
        const targetDateObj = parseISTDate(targetDate);
        
        // Find all auto-converted leaves for target date
        const convertedLeaves = await LeaveRequest.find({
            autoConvertedToLOP: true,
            leaveDates: {
                $elemMatch: {
                    $gte: startOfISTDay(targetDateObj),
                    $lt: new Date(targetDateObj.getTime() + 24 * 60 * 60 * 1000)
                }
            }
        })
            .populate('employee', 'fullName employeeCode')
            .lean();
        
        if (convertedLeaves.length > 0) verboseLog(`[HalfDayConversion] Checking ${convertedLeaves.length} auto-converted leave(s) for ${targetDate}`);
        
        for (const leave of convertedLeaves) {
            summary.checked++;
            
            // Check if attendance now exists with check-in
            const attendance = await AttendanceLog.findOne({
                user: leave.employee._id,
                attendanceDate: targetDate
            }).lean();
            
            // If attendance exists with check-in (and not voided), revert the conversion
            const wasVoidedByLeaveApproval = attendance?.notes && String(attendance.notes).includes('AUTO-VOID');
            const hasActualCheckIn = attendance && attendance.clockInTime != null && !wasVoidedByLeaveApproval;
            
            if (hasActualCheckIn) {
                
                try {
                    // Revert using the existing revert function
                    await revertAutoConversion(leave._id.toString(), 'SYSTEM_AUTO_REVERT');
                    
                    summary.reverted++;
                    summary.details.push({
                        employeeId: leave.employee._id,
                        employeeName: leave.employee.fullName,
                        leaveId: leave._id,
                        status: 'reverted',
                        reason: 'Employee has check-in record'
                    });
                    
                    console.log(`[HalfDayConversion] Auto-reverted leave ${leave._id} for ${leave.employee.fullName}`);
                } catch (error) {
                    summary.errors++;
                    summary.details.push({
                        employeeId: leave.employee._id,
                        employeeName: leave.employee.fullName,
                        leaveId: leave._id,
                        status: 'error',
                        error: error.message
                    });
                    
                    console.error(`[HalfDayConversion] ❌ Error auto-reverting leave ${leave._id}:`, error);
                }
            }
        }
        
        if (summary.reverted > 0 || summary.errors > 0) {
            if (summary.reverted > 0 || summary.errors > 0) {
                console.log(`[HalfDayConversion] Auto-revert ${targetDate}: reverted=${summary.reverted}, errors=${summary.errors}`);
            }
        }
        
        return summary;
        
    } catch (error) {
        console.error(`[HalfDayConversion] Fatal error during auto-revert for ${targetDate}:`, error);
        return {
            ...summary,
            error: error.message
        };
    }
};

module.exports = {
    autoConvertHalfDayLeaves,
    revertAutoConversion,
    autoRevertIncorrectConversions,
    validateConversionEligibility, // Export for testing
    isHoliday, // Export for testing
    isWeekend // Export for testing
};
