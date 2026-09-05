// backend/services/leaveAttendanceSyncService.js
/**
 * Service to synchronize AttendanceLog records with LeaveRequest status changes.
 * This ensures Attendance is the single source of truth for daily status.
 */

const mongoose = require('mongoose');
const AttendanceLog = require('../models/AttendanceLog');
const User = require('../models/User');
const { recalculateLateStatus } = require('./dailyStatusService');
const { isHalfDayLeaveType } = require('../utils/halfDayLeave');

/**
 * Sync attendance records when a leave is approved.
 * Creates or updates AttendanceLog records for each leave date with status "Leave".
 * 
 * @param {Object} leaveRequest - The LeaveRequest document
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Array>} Array of created/updated AttendanceLog IDs
 */
const syncAttendanceOnLeaveApproval = async (leaveRequest, session) => {
    const employeeId = leaveRequest.employee;
    const leaveDates = leaveRequest.leaveDates || [];
    const updatedLogs = [];

    // Get employee - shiftGroup is optional for leave days
    // We don't need shiftGroup for leave days, so we won't populate it to avoid model registration issues
    const employee = await User.findById(employeeId).select('shiftGroup').session(session);
    if (!employee) {
        throw new Error('Employee not found for attendance sync');
    }

    // Get shift duration - use default if shiftGroup not available
    // For leave days, we don't need actual shift info, just a default duration
    let shiftDurationMinutes = 540; // Default 9 hours

    // Try to get shift duration if shiftGroup exists, but don't fail if it doesn't
    if (employee.shiftGroup) {
        try {
            // Only populate if we have a Shift model available
            const Shift = mongoose.model('Shift');
            if (Shift) {
                const shift = await Shift.findById(employee.shiftGroup).session(session);
                if (shift && shift.durationHours) {
                    shiftDurationMinutes = shift.durationHours * 60;
                }
            }
        } catch (err) {
            // Shift model not available or populate failed - use default
            console.warn(`Could not load shift for employee ${employeeId}, using default duration:`, err.message);
        }
    }

    const isHalfDayLeave = isHalfDayLeaveType(leaveRequest.leaveType);

    for (const leaveDate of leaveDates) {
        // Normalize date to YYYY-MM-DD format
        // Handle both Date objects and date strings
        let dateObj;
        if (leaveDate instanceof Date) {
            dateObj = leaveDate;
        } else if (typeof leaveDate === 'string') {
            // If it's already in YYYY-MM-DD format, use it directly
            if (/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
                dateObj = new Date(leaveDate + 'T00:00:00');
            } else {
                dateObj = new Date(leaveDate);
            }
        } else {
            dateObj = new Date(leaveDate);
        }

        // Ensure we get the date in YYYY-MM-DD format (local date, not UTC)
        // This prevents timezone issues where Dec 1 might become Nov 30 in UTC
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Check if attendance log already exists for this date
        const existingLog = await AttendanceLog.findOne({
            user: employeeId,
            attendanceDate: dateStr
        }).session(session);

        if (existingLog) {
            const hasClockIn = existingLog.clockInTime && existingLog.clockInTime instanceof Date;

            if (isHalfDayLeave) {
                // Half-day: employee works the other half — link leave only, never void working attendance
                existingLog.leaveRequest = leaveRequest._id;
                if (!hasClockIn) {
                    // Do not block check-in: clear legacy full-day Leave marker if present
                    if (existingLog.attendanceStatus === 'Leave') {
                        existingLog.attendanceStatus = 'Absent';
                        existingLog.isLate = false;
                        existingLog.isHalfDay = false;
                        existingLog.lateMinutes = 0;
                    }
                }
            } else if (hasClockIn) {
                // Full-day: STRICT POLICY — void attendance but keep audit trail in notes
                const auditNote = `[AUTO-VOID] Leave Approved. Voided Clock-In: ${existingLog.clockInTime?.toISOString()} - ${existingLog.clockOutTime?.toISOString() || 'Active'}`;

                existingLog.notes = existingLog.notes ? existingLog.notes + '; ' + auditNote : auditNote;
                existingLog.clockInTime = null;
                existingLog.clockOutTime = null;
                existingLog.attendanceStatus = 'Leave';
                existingLog.leaveRequest = leaveRequest._id;

                existingLog.totalWorkingHours = 0;
                existingLog.lateMinutes = 0;
                existingLog.isLate = false;
                existingLog.isHalfDay = false;
            } else {
                existingLog.attendanceStatus = 'Leave';
                existingLog.leaveRequest = leaveRequest._id;
                existingLog.isLate = false;
                existingLog.isHalfDay = false;
                existingLog.lateMinutes = 0;
            }

            await existingLog.save({ session });
            updatedLogs.push(existingLog._id);
        } else if (!isHalfDayLeave) {
            // Full-day only: pre-create Leave log. Half-day leave is tracked via LeaveRequest until check-in.
            const newLogData = {
                user: employeeId,
                attendanceDate: dateStr,
                attendanceStatus: 'Leave',
                leaveRequest: leaveRequest._id,
                shiftDurationMinutes: shiftDurationMinutes,
                penaltyMinutes: 0,
                paidBreakMinutesTaken: 0,
                unpaidBreakMinutesTaken: 0,
                isLate: false,
                isHalfDay: false,
                lateMinutes: 0,
                totalWorkingHours: 0
            };

            const newLog = await AttendanceLog.create([newLogData], { session });

            updatedLogs.push(newLog[0]._id);
        }
    }

    return updatedLogs;
};

/**
 * Revert attendance records when a leave is rejected or cancelled after approval.
 * If no clock-in exists, set status back to "Absent".
 * If clock-in exists, recalculate status based on clock-in time.
 * 
 * @param {Object} leaveRequest - The LeaveRequest document
 * @param {Object} session - MongoDB session for transaction
 * @returns {Promise<Array>} Array of updated AttendanceLog IDs
 */
const syncAttendanceOnLeaveRejection = async (leaveRequest, session) => {
    const employeeId = leaveRequest.employee;
    const leaveDates = leaveRequest.leaveDates || [];
    const updatedLogs = [];

    // Get employee - shiftGroup is optional for recalculation
    const employee = await User.findById(employeeId).select('shiftGroup').session(session);
    if (!employee) {
        throw new Error('Employee not found for attendance sync');
    }

    // Load shiftGroup for recalculation if needed
    let shiftGroup = null;
    if (employee.shiftGroup) {
        try {
            const Shift = mongoose.model('Shift');
            if (Shift) {
                shiftGroup = await Shift.findById(employee.shiftGroup).session(session);
            }
        } catch (err) {
            // Shift model not available - continue without it
        }
    }

    for (const leaveDate of leaveDates) {
        // Normalize date to YYYY-MM-DD format
        // Handle both Date objects and date strings
        let dateObj;
        if (leaveDate instanceof Date) {
            dateObj = leaveDate;
        } else if (typeof leaveDate === 'string') {
            // If it's already in YYYY-MM-DD format, use it directly
            if (/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
                dateObj = new Date(leaveDate + 'T00:00:00');
            } else {
                dateObj = new Date(leaveDate);
            }
        } else {
            dateObj = new Date(leaveDate);
        }

        // Ensure we get the date in YYYY-MM-DD format (local date, not UTC)
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Find attendance log for this date
        // First try to find log linked to this leave, but if not found, find any log for this date
        // This handles cases where employee worked on a date that was later marked as leave
        let existingLog = await AttendanceLog.findOne({
            user: employeeId,
            attendanceDate: dateStr,
            leaveRequest: leaveRequest._id // First try to find log linked to this leave
        }).session(session);

        // If not found by leaveRequest, find any log for this date (might have clock-in data)
        if (!existingLog) {
            existingLog = await AttendanceLog.findOne({
                user: employeeId,
                attendanceDate: dateStr
            }).session(session);
        }

        if (existingLog) {
            const hasClockIn = existingLog.clockInTime && existingLog.clockInTime instanceof Date;

            if (hasClockIn) {
                // Employee clocked in - recalculate status based on FIRST check-in time
                // CRITICAL FIX: Use FIRST session's startTime, not stored clockInTime
                const AttendanceSession = require('../models/AttendanceSession');
                const firstSession = await AttendanceSession.findOne({ 
                    attendanceLog: existingLog._id 
                }).sort({ startTime: 1 }).select('startTime').lean();
                
                let clockInTimeForRecalc;
                if (firstSession && firstSession.startTime) {
                    clockInTimeForRecalc = new Date(firstSession.startTime);
                } else if (existingLog.clockInTime) {
                    clockInTimeForRecalc = new Date(existingLog.clockInTime);
                } else {
                    console.warn(`[LEAVE_REVERT] No clock-in time found for log ${existingLog._id}`);
                    continue;
                }
                
                console.log(`[LEAVE_REVERT] Recalculating attendance for ${dateStr} - employee clocked in at ${clockInTimeForRecalc}`);
                if (shiftGroup && shiftGroup.startTime) {
                    const lateArrivalMarksHalfDay = !!(employee && employee.featurePermissions && employee.featurePermissions.lateArrivalMarksHalfDay);
                    const recalculatedStatus = await recalculateLateStatus(
                        clockInTimeForRecalc,
                        shiftGroup,
                        null, // gracePeriodMinutes (will be fetched from settings)
                        existingLog.totalWorkingHours, // Pass working hours for priority logic
                        lateArrivalMarksHalfDay
                    );
                    existingLog.attendanceStatus = recalculatedStatus.attendanceStatus;
                    existingLog.isLate = recalculatedStatus.isLate;
                    existingLog.isHalfDay = recalculatedStatus.isHalfDay;
                    existingLog.lateMinutes = recalculatedStatus.lateMinutes;
                    console.log(`[LEAVE_REVERT] Recalculated status: ${recalculatedStatus.attendanceStatus}`);
                } else {
                    // No shift info - default to On-time
                    existingLog.attendanceStatus = 'On-time';
                    existingLog.isLate = false;
                    existingLog.isHalfDay = false;
                    existingLog.lateMinutes = 0;
                    console.log(`[LEAVE_REVERT] No shift info - defaulting to On-time`);
                }
            } else {
                // No clock-in - check if log was created only for leave (no other data)
                // If log has no clock-in and was created for leave, we can delete it
                // Otherwise, set to Absent
                if (existingLog.leaveRequest && existingLog.leaveRequest.equals(leaveRequest._id) &&
                    !existingLog.clockInTime && !existingLog.clockOutTime && !existingLog.notes) {
                    // Log was created only for leave - delete it
                    await AttendanceLog.findByIdAndDelete(existingLog._id, { session });
                    console.log(`[LEAVE_REVERT] Deleted attendance log for ${dateStr} (created only for leave)`);
                    updatedLogs.push(existingLog._id);
                    continue;
                } else {
                    // Log has other data or wasn't created for this leave - set to Absent
                    existingLog.attendanceStatus = 'Absent';
                    existingLog.isLate = false;
                    existingLog.isHalfDay = false;
                    existingLog.lateMinutes = 0;
                    console.log(`[LEAVE_REVERT] Set status to Absent for ${dateStr} (no clock-in)`);
                }
            }

            // CRITICAL FIX: Remove leave reference and ensure status is updated
            existingLog.leaveRequest = null;
            // If log has no clock-in and was set to Leave, change to Absent
            if (!existingLog.clockInTime && existingLog.attendanceStatus === 'Leave') {
                existingLog.attendanceStatus = 'Absent';
                existingLog.isLate = false;
                existingLog.isHalfDay = false;
                existingLog.lateMinutes = 0;
            }
            await existingLog.save({ session });
            updatedLogs.push(existingLog._id);
        } else {
            console.log(`[LEAVE_REVERT] No attendance log found for ${dateStr} - nothing to revert`);
        }
        // If log doesn't exist or wasn't created for this leave, no action needed
    }

    return updatedLogs;
};

module.exports = {
    syncAttendanceOnLeaveApproval,
    syncAttendanceOnLeaveRejection
};

