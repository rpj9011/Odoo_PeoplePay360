// backend/services/attendanceRecalculationService.js
/**
 * Service to recalculate and sync attendance records with leave requests.
 * Used for fixing historical data and ensuring consistency.
 */

const AttendanceLog = require('../models/AttendanceLog');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const { syncAttendanceOnLeaveApproval, syncAttendanceOnLeaveRejection } = require('./leaveAttendanceSyncService');

/**
 * Recalculate attendance status for a date range by syncing with approved leaves.
 * This ensures all attendance records reflect the current leave status.
 * 
 * @param {string} userId - User ID (optional, if null processes all users)
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Summary of recalculation
 */
const recalculateAttendanceForDateRange = async (userId = null, startDate, endDate) => {
    const results = {
        processedUsers: 0,
        processedLeaves: 0,
        updatedLogs: 0,
        createdLogs: 0,
        errors: []
    };

    try {
        // Build user query
        const userQuery = userId ? { _id: userId } : { isActive: true };
        const users = await User.find(userQuery).select('_id fullName');

        for (const user of users) {
            try {
                // Find all approved leave requests for this user in the date range
                const approvedLeaves = await LeaveRequest.find({
                    employee: user._id,
                    status: 'Approved',
                    leaveDates: {
                        $elemMatch: {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate)
                        }
                    }
                });

                for (const leave of approvedLeaves) {
                    try {
                        // Check which leave dates fall within the range
                        const relevantDates = leave.leaveDates.filter(date => {
                            const dateStr = new Date(date).toISOString().slice(0, 10);
                            return dateStr >= startDate && dateStr <= endDate;
                        });

                        if (relevantDates.length === 0) continue;

                        // Create a temporary leave request with only relevant dates
                        const tempLeave = {
                            ...leave.toObject(),
                            leaveDates: relevantDates
                        };

                        // Sync attendance for this leave (this will create/update logs)
                        // We need to check if logs already exist and have correct status
                        for (const leaveDate of relevantDates) {
                            const dateStr = new Date(leaveDate).toISOString().slice(0, 10);
                            const existingLog = await AttendanceLog.findOne({
                                user: user._id,
                                attendanceDate: dateStr
                            });

                            if (existingLog) {
                                // Check if status needs update
                                if (existingLog.attendanceStatus !== 'Leave' || 
                                    existingLog.leaveRequest?.toString() !== leave._id.toString()) {
                                    existingLog.attendanceStatus = 'Leave';
                                    existingLog.leaveRequest = leave._id;
                                    await existingLog.save();
                                    results.updatedLogs++;
                                }
                            } else {
                                // Create new log for leave day
                                const userDoc = await User.findById(user._id).populate('shiftGroup');
                                await AttendanceLog.create({
                                    user: user._id,
                                    attendanceDate: dateStr,
                                    attendanceStatus: 'Leave',
                                    leaveRequest: leave._id,
                                    clockInTime: null,
                                    clockOutTime: null,
                                    shiftDurationMinutes: userDoc.shiftGroup?.durationHours ? userDoc.shiftGroup.durationHours * 60 : 540,
                                    penaltyMinutes: 0,
                                    paidBreakMinutesTaken: 0,
                                    unpaidBreakMinutesTaken: 0,
                                    isLate: false,
                                    isHalfDay: false,
                                    lateMinutes: 0,
                                    totalWorkingHours: 0
                                });
                                results.createdLogs++;
                            }
                        }

                        results.processedLeaves++;
                    } catch (leaveError) {
                        results.errors.push({
                            type: 'leave_processing',
                            leaveId: leave._id,
                            userId: user._id,
                            error: leaveError.message
                        });
                    }
                }

                results.processedUsers++;
            } catch (userError) {
                results.errors.push({
                    type: 'user_processing',
                    userId: user._id,
                    error: userError.message
                });
            }
        }

        return results;
    } catch (error) {
        throw new Error(`Recalculation failed: ${error.message}`);
    }
};

/**
 * Clean up orphaned leave references in attendance logs.
 * Removes leaveRequest references from logs where leave is no longer approved.
 * 
 * @param {string} userId - User ID (optional)
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Summary of cleanup
 */
const cleanupOrphanedLeaveReferences = async (userId = null, startDate, endDate) => {
    const results = {
        checkedLogs: 0,
        cleanedLogs: 0,
        errors: []
    };

    try {
        const query = {
            leaveRequest: { $ne: null },
            attendanceDate: { $gte: startDate, $lte: endDate }
        };

        if (userId) {
            query.user = userId;
        }

        const logsWithLeaveRef = await AttendanceLog.find(query).populate('leaveRequest');

        for (const log of logsWithLeaveRef) {
            results.checkedLogs++;

            if (!log.leaveRequest || log.leaveRequest.status !== 'Approved') {
                // Leave is no longer approved or doesn't exist
                // Revert log status based on clock-in
                if (log.clockInTime) {
                    // Has clock-in - recalculate status
                    const user = await User.findById(log.user).populate('shiftGroup');
                    if (user && user.shiftGroup) {
                        const { recalculateLateStatus } = require('./dailyStatusService');
                        const lateArrivalMarksHalfDay = !!(user.featurePermissions && user.featurePermissions.lateArrivalMarksHalfDay);
                        const recalculated = await recalculateLateStatus(
                            log.clockInTime,
                            user.shiftGroup,
                            null, // gracePeriodMinutes (will be fetched from settings)
                            log.totalWorkingHours, // Pass working hours for priority logic
                            lateArrivalMarksHalfDay
                        );
                        log.attendanceStatus = recalculated.attendanceStatus;
                        log.isLate = recalculated.isLate;
                        log.isHalfDay = recalculated.isHalfDay;
                        log.lateMinutes = recalculated.lateMinutes;
                    } else {
                        log.attendanceStatus = 'On-time';
                    }
                } else {
                    // No clock-in - set to Absent
                    log.attendanceStatus = 'Absent';
                }
                log.leaveRequest = null;
                await log.save();
                results.cleanedLogs++;
            }
        }

        return results;
    } catch (error) {
        throw new Error(`Cleanup failed: ${error.message}`);
    }
};

module.exports = {
    recalculateAttendanceForDateRange,
    cleanupOrphanedLeaveReferences
};




