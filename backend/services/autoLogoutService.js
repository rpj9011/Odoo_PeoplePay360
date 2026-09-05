// backend/services/autoLogoutService.js
/**
 * Intelligent Auto Logout Service
 * 
 * This service enforces automatic logout for employees who forget to log out.
 * It runs as a backend cron job and does NOT depend on frontend being open.
 * 
 * Rules:
 * 1. Expected logout = shiftStart + shiftDuration + unpaidBreak + approvedOvertime (if any)
 * 2. Auto logout triggers exactly 90 minutes after required logout time
 * 3. Auto logout = expected logout + 90 minutes (configurable)
 */

const mongoose = require('mongoose');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const BreakLog = require('../models/BreakLog');
const User = require('../models/User');
const Setting = require('../models/Setting');
const { getUserDailyStatus } = require('./dailyStatusService');
const NewNotificationService = require('./NewNotificationService');
const logAction = require('./logAction');
const cacheService = require('./cacheService');

const { isNightShiftEmployee } = require('../utils/istTime');
const { verboseLog } = require('../utils/logLevel');

// Note: We cannot import computeCalculatedLogoutTime directly as it requires sessions/breaks arrays
// Instead, we use getUserDailyStatus which internally computes the logout time correctly

// Configurable constants (can be overridden by settings)
const DEFAULT_AUTO_LOGOUT_BUFFER_MINUTES = 90; // 90 minutes buffer after expected logout time

/**
 * Calculate expected logout time for an employee based on their shift and breaks
 * Uses getUserDailyStatus which contains the authoritative logout calculation logic
 */
const calculateExpectedLogoutTime = async (userId, attendanceDate) => {
    try {
        // Get daily status which includes the calculated logout time
        // This uses the same logic as the frontend and ensures consistency
        const dailyStatus = await getUserDailyStatus(
            userId,
            attendanceDate,
            { includeSessions: true, includeBreaks: true, includeAutoBreak: true }
        );

        if (dailyStatus && dailyStatus.calculatedLogoutTime) {
            const logoutTime = new Date(dailyStatus.calculatedLogoutTime);
            // Validate that the logout time is a valid date
            if (isNaN(logoutTime.getTime())) {
                console.error(`[autoLogoutService] Invalid logout time calculated for user ${userId}, date ${attendanceDate}`);
                return null;
            }
            return logoutTime;
        }

        // Fallback: If calculatedLogoutTime is not available, try to calculate from shift
        // This handles edge cases where getUserDailyStatus might not return a calculated time
        if (dailyStatus && dailyStatus.shift && dailyStatus.attendanceLog) {
            const user = await User.findById(userId).populate('shiftGroup').lean();
            if (user && user.shiftGroup) {
                const shift = user.shiftGroup;
                const attendanceLog = await AttendanceLog.findOne({ user: userId, attendanceDate }).lean();
                if (attendanceLog && attendanceLog.clockInTime) {
                    // Basic calculation: clockInTime + shift duration (9 hours)
                    const clockInTime = new Date(attendanceLog.clockInTime);
                    const shiftDurationMinutes = shift.durationHours ? shift.durationHours * 60 : 540; // Default 9 hours
                    const expectedLogout = new Date(clockInTime.getTime() + shiftDurationMinutes * 60 * 1000);
                    verboseLog(`[autoLogoutService] ⚠️ Using fallback calculation for user ${userId}: ${expectedLogout.toISOString()}`);
                    return expectedLogout;
                }
            }
        }

        return null;
    } catch (error) {
        console.error('[autoLogoutService] Error calculating expected logout time:', error);
        console.error('[autoLogoutService]   Error stack:', error.stack);
        return null;
    }
};

/**
 * Check if auto logout feature is enabled
 */
const isAutoLogoutEnabled = async () => {
    try {
        const cached = cacheService.getSetting('enableAutoLogout');
        if (cached !== null && cached !== undefined) {
            return cached === true || cached === 'true' || cached === '1';
        }
        const setting = await Setting.findOne({ key: 'enableAutoLogout' });
        const value = (setting !== null && setting !== undefined)
            ? (setting.value === true || setting.value === 'true' || setting.value === '1')
            : true;
        cacheService.setSetting('enableAutoLogout', value);
        return value;
    } catch (error) {
        console.error('[autoLogoutService] Error checking auto logout enable setting:', error);
        return true; // Default: enabled on error
    }
};

/**
 * Get auto logout buffer minutes from settings or use default
 */
const getAutoLogoutBufferMinutes = async () => {
    try {
        const cached = cacheService.getSetting('autoLogoutBufferMinutes');
        if (cached !== null && cached !== undefined && !isNaN(Number(cached))) {
            const cachedBuffer = Number(cached);
            if (cachedBuffer >= 30 && cachedBuffer <= 480) return cachedBuffer;
        }
        const setting = await Setting.findOne({ key: 'autoLogoutBufferMinutes' });
        if (setting && !isNaN(Number(setting.value))) {
            const buffer = Number(setting.value);
            if (buffer >= 30 && buffer <= 480) {
                cacheService.setSetting('autoLogoutBufferMinutes', buffer);
                return buffer;
            }
        }
    } catch (error) {
        console.error('[autoLogoutService] Error fetching auto logout buffer setting:', error);
    }
    return DEFAULT_AUTO_LOGOUT_BUFFER_MINUTES;
};

/**
 * Calculate auto logout threshold time
 * Auto logout time = expected logout + buffer (default 90 minutes)
 */
const calculateAutoLogoutThreshold = async (expectedLogoutTime) => {
    if (!expectedLogoutTime) return null;
    
    const bufferMinutes = await getAutoLogoutBufferMinutes();
    const autoLogoutTime = new Date(expectedLogoutTime);
    autoLogoutTime.setMinutes(autoLogoutTime.getMinutes() + bufferMinutes);
    return autoLogoutTime;
};

/**
 * Perform auto logout for a specific attendance session
 */
const performAutoLogout = async (attendanceLog, activeSession, user, preloadedBufferMinutes = null) => {
    try {
        const now = new Date();
        
        // Get buffer minutes (use preloaded value from cycle if available, else fetch once)
        const bufferMinutes = preloadedBufferMinutes !== null ? preloadedBufferMinutes : await getAutoLogoutBufferMinutes();
        
        // CRITICAL: Atomic duplicate prevention - check and lock in single operation
        // Use findOneAndUpdate to atomically check and mark as in-progress
        const logCheck = await AttendanceLog.findOneAndUpdate(
            { 
                _id: attendanceLog._id, 
                clockOutTime: null // Only if still open
            },
            {
                $set: {
                    _autoLogoutLock: new Date() // Temporary lock timestamp
                }
            },
            { 
                new: true,
                lean: true
            }
        );

        // If logCheck is null, the log was already closed by another process
        if (!logCheck) {
            verboseLog(`[autoLogoutService] ⚠️ User ${user.email} already has clockOutTime set (race condition prevented), skipping duplicate auto-logout`);
            return false;
        }

        // CRITICAL: Check if session is still active (prevent duplicate auto-logouts)
        const sessionCheck = await AttendanceSession.findOneAndUpdate(
            {
                _id: activeSession._id,
                endTime: null // Only if still active
            },
            {
                $set: {
                    _autoLogoutLock: new Date() // Temporary lock timestamp
                }
            },
            {
                new: true,
                lean: true
            }
        );

        if (!sessionCheck) {
            // Session was already closed - clean up the lock we set
            await AttendanceLog.findByIdAndUpdate(attendanceLog._id, {
                $unset: { _autoLogoutLock: 1 }
            });
            verboseLog(`[autoLogoutService] ⚠️ Session ${activeSession._id} already has endTime set, skipping duplicate auto-logout`);
            return false;
        }

        // For past dates, use the expected logout time + buffer as the logout time
        // For today, use current time
        // CRITICAL: Use IST timezone for date comparison to ensure accuracy
        const attendanceDateStr = attendanceLog.attendanceDate; // YYYY-MM-DD format
        // Get today's date in IST timezone
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayDateStr = nowIST.toISOString().slice(0, 10); // Get YYYY-MM-DD
        const isPastDate = attendanceDateStr < todayDateStr;

        // Calculate expected logout time once (used for both past date handling and overrun calculation)
        const expectedLogoutTime = await calculateExpectedLogoutTime(user._id, attendanceLog.attendanceDate);
        
        // CRITICAL: If we can't calculate expected logout time, we can't safely auto-logout
        // This prevents logging out users with invalid shift configurations
        if (!expectedLogoutTime) {
            console.error(`[autoLogoutService] ❌ Cannot auto-logout ${user.email}: Could not calculate expected logout time`);
            return false;
        }
        
        let logoutTime = now;
        if (isPastDate) {
            // For past dates, calculate the auto-logout threshold time
            const threshold = await calculateAutoLogoutThreshold(expectedLogoutTime); // CRITICAL: await async function
            if (threshold) {
                // Use threshold time, but don't go beyond the session start time + reasonable max (e.g., 24 hours)
                const maxSessionDuration = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
                const sessionStartTime = new Date(activeSession.startTime);
                const maxLogoutTime = new Date(sessionStartTime.getTime() + maxSessionDuration);
                logoutTime = threshold < maxLogoutTime ? threshold : maxLogoutTime;
                verboseLog(`[autoLogoutService] 📅 Using calculated logout time for past date: ${logoutTime.toISOString()}`);
            }
        }
        
        // End the active session (bufferMinutes already declared at function start)
        // Use findOneAndUpdate to ensure atomicity - only update if we hold the lock
        const sessionUpdateResult = await AttendanceSession.findOneAndUpdate(
            {
                _id: activeSession._id,
                endTime: null, // Only update if still active (double-check)
                _autoLogoutLock: { $exists: true } // Only if we hold the lock
            },
            {
                $set: {
                    endTime: logoutTime,
                    logoutType: 'AUTO',
                    autoLogoutReason: `Auto-logged out after exceeding allowed session time (${bufferMinutes} minutes buffer)`
                },
                $unset: { _autoLogoutLock: 1 } // Remove lock
            },
            { new: true }
        );

        if (!sessionUpdateResult) {
            // Session was closed by another process - clean up
            await AttendanceLog.findByIdAndUpdate(attendanceLog._id, {
                $unset: { _autoLogoutLock: 1 }
            });
            verboseLog(`[autoLogoutService] ⚠️ Session ${activeSession._id} was closed by another process, aborting auto-logout`);
            return false;
        }

        // Recalculate total working hours
        const allSessions = await AttendanceSession.find({ attendanceLog: attendanceLog._id }).sort({ startTime: 1 });
        const breaks = await BreakLog.find({ attendanceLog: attendanceLog._id });

        let totalWorkingMinutes = 0;
        let totalBreakMinutes = 0;

        // Calculate total session time
        allSessions.forEach(session => {
            if (session.endTime) {
                const sessionMinutes = (new Date(session.endTime) - new Date(session.startTime)) / (1000 * 60);
                totalWorkingMinutes += sessionMinutes;
            }
        });

        // Calculate total break time
        breaks.forEach(breakLog => {
            if (breakLog.endTime) {
                const breakMinutes = (new Date(breakLog.endTime) - new Date(breakLog.startTime)) / (1000 * 60);
                totalBreakMinutes += breakMinutes;
            }
        });

        // Net working hours (excluding breaks)
        const netWorkingMinutes = Math.max(0, totalWorkingMinutes - totalBreakMinutes);
        const totalWorkingHours = netWorkingMinutes / 60;

        // Calculate overrun duration (expectedLogoutTime already calculated above)
        const overrunMinutes = expectedLogoutTime ? Math.round((logoutTime - expectedLogoutTime) / (1000 * 60)) : 0;

        // Update attendance log with clock-out time and auto-logout info (atomic update)
        const logUpdateResult = await AttendanceLog.findOneAndUpdate(
            {
                _id: attendanceLog._id,
                clockOutTime: null, // Only update if still open (double-check)
                _autoLogoutLock: { $exists: true } // Only if we hold the lock
            },
            {
                $set: {
                    clockOutTime: logoutTime,
                    totalWorkingHours: totalWorkingHours,
                    logoutType: 'AUTO',
                    autoLogoutReason: `Auto-logged out after exceeding allowed session time (${bufferMinutes} minutes buffer)`
                },
                $unset: { _autoLogoutLock: 1 } // Remove lock
            },
            { new: true }
        );

        if (!logUpdateResult) {
            // Log was closed by another process - rollback session update
            console.error(`[autoLogoutService] ⚠️ Attendance log ${attendanceLog._id} was closed by another process during auto-logout, rolling back session`);
            // Attempt to rollback session (best effort)
            await AttendanceSession.findByIdAndUpdate(activeSession._id, {
                $unset: { 
                    endTime: 1,
                    logoutType: 1,
                    autoLogoutReason: 1,
                    _autoLogoutLock: 1
                }
            });
            return false;
        }

        // Format logout time for display
        const logoutTimeIST = new Date(logoutTime).toLocaleTimeString('en-US', { 
            timeZone: 'Asia/Kolkata', 
            hour12: true,
            hour: '2-digit',
            minute: '2-digit'
        });

        // Create activity log entry (timeline entry)
        try {
            await logAction(user._id, 'AUTO_LOGOUT', {
                attendanceLogId: attendanceLog._id.toString(),
                attendanceDate: attendanceLog.attendanceDate,
                logoutTime: logoutTime.toISOString(),
                expectedLogoutTime: expectedLogoutTime ? expectedLogoutTime.toISOString() : null,
                overrunMinutes: overrunMinutes,
                totalWorkingHours: totalWorkingHours,
                reason: `Exceeded allowed session time by ${overrunMinutes} minutes`
            });
            verboseLog(`[autoLogoutService] ✅ Activity log entry created for auto logout`);
        } catch (logError) {
            console.error(`[autoLogoutService] ❌ Failed to create activity log entry:`, logError);
            // Don't fail the auto logout if logging fails
        }

        // Send notification to employee
        try {
            await NewNotificationService.createAndEmitNotification({
                message: `You were auto logged out at ${logoutTimeIST} due to exceeding allowed session time.`,
                userId: user._id,
                userName: user.fullName,
                type: 'system',
                recipientType: 'user',
                category: 'attendance',
                priority: 'high',
                navigationData: { page: 'dashboard' },
                metadata: {
                    eventType: 'AUTO_LOGOUT',
                    logoutTime: logoutTime.toISOString(),
                    attendanceDate: attendanceLog.attendanceDate,
                    overrunMinutes: overrunMinutes
                }
            });
            verboseLog(`[autoLogoutService] ✅ Employee notification sent`);
        } catch (notifError) {
            console.error(`[autoLogoutService] ❌ Failed to send employee notification:`, notifError);
            // Don't fail the auto logout if notification fails
        }

        // Send notification to admins
        try {
            await NewNotificationService.broadcastToAdmins({
                message: `${user.fullName} was auto logged out (Exceeded allowed time by ${overrunMinutes} minutes)`,
                type: 'system',
                category: 'attendance',
                priority: 'high',
                isSystemNotification: true, // Ensure it appears in activity logs
                navigationData: { 
                    page: 'attendance', 
                    params: { userId: user._id.toString() } 
                },
                metadata: {
                    eventType: 'AUTO_LOGOUT',
                    userId: user._id.toString(),
                    userName: user.fullName,
                    logoutTime: logoutTime.toISOString(),
                    attendanceDate: attendanceLog.attendanceDate,
                    overrunMinutes: overrunMinutes,
                    expectedLogoutTime: expectedLogoutTime ? expectedLogoutTime.toISOString() : null
                }
            }, user._id);
            verboseLog(`[autoLogoutService] ✅ Admin notification sent`);
        } catch (notifError) {
            console.error(`[autoLogoutService] ❌ Failed to send admin notification:`, notifError);
            console.error(`[autoLogoutService]   Error details:`, notifError.message, notifError.stack);
            // Don't fail the auto logout if notification fails
        }

        console.log(`[autoLogoutService] Auto-logged out ${user.fullName} (${user.email}) at ${logoutTime.toISOString()}`);
        verboseLog(`[autoLogoutService]   Total working hours: ${totalWorkingHours.toFixed(2)}h, date: ${attendanceLog.attendanceDate}, overrun: ${overrunMinutes} min`);

        return true;
    } catch (error) {
        console.error(`[autoLogoutService] ❌ Error performing auto-logout for user ${user?.email}:`, error);
        console.error(`[autoLogoutService]   Error stack:`, error.stack);
        return false;
    }
};

/**
 * Clean up legacy/orphan sessions that cannot be processed normally
 * These are sessions with missing/invalid user references or very old sessions
 */
const cleanupLegacySessions = async () => {
    try {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        // Find attendance logs with no clockOutTime that have issues
        const problematicLogs = await AttendanceLog.find({
            clockOutTime: null,
            isLegacySession: { $ne: true } // Not already marked as legacy
        }).populate('user').lean();

        let legacyCount = 0;

        for (const log of problematicLogs) {
            try {
                // Identify legacy sessions
                const isLegacy = 
                    !log.user || 
                    !log.user._id || 
                    log.user._id.toString() === 'unknown' ||
                    !log.user.isActive ||
                    (log.createdAt && new Date(log.createdAt) < oneDayAgo);

                if (!isLegacy) {
                    continue;
                }

                // Get active session for this log
                const activeSession = await AttendanceSession.findOne({
                    attendanceLog: log._id,
                    endTime: null,
                    isLegacySession: { $ne: true }
                }).lean();

                if (!activeSession) {
                    // No active session, but clockOutTime is null - close the log
                    const sessionStartTime = log.clockInTime || log.createdAt || now;
                    await AttendanceLog.findByIdAndUpdate(log._id, {
                        $set: {
                            clockOutTime: sessionStartTime,
                            totalWorkingHours: 0,
                            logoutType: 'SYSTEM',
                            autoLogoutReason: 'Legacy session closed (pre-auto-logout)',
                            isLegacySession: true
                        }
                    });
                    legacyCount++;
                    continue;
                }

                // Force close the legacy session
                const sessionStartTime = new Date(activeSession.startTime || log.clockInTime || log.createdAt || now);
                
                // Close the session
                await AttendanceSession.findByIdAndUpdate(activeSession._id, {
                    $set: {
                        endTime: sessionStartTime,
                        logoutType: 'SYSTEM',
                        autoLogoutReason: 'Legacy session closed (pre-auto-logout)',
                        isLegacySession: true
                    }
                });

                // Close the attendance log
                await AttendanceLog.findByIdAndUpdate(log._id, {
                    $set: {
                        clockOutTime: sessionStartTime,
                        totalWorkingHours: 0,
                        paidBreakMinutesTaken: 0,
                        unpaidBreakMinutesTaken: 0,
                        logoutType: 'SYSTEM',
                        autoLogoutReason: 'Legacy session closed (pre-auto-logout)',
                        isLegacySession: true
                    }
                });

                legacyCount++;
            } catch (error) {
                console.error(`[autoLogoutService] ❌ Error cleaning up legacy session ${log._id}:`, error);
            }
        }

        if (legacyCount > 0) {
            verboseLog(`[autoLogoutService] ✅ Closed ${legacyCount} legacy session(s) (pre-auto-logout)`);
        }

        return legacyCount;
    } catch (error) {
        console.error('[autoLogoutService] ❌ Error in legacy session cleanup:', error);
        return 0;
    }
};

/**
 * Check and auto-logout employees who have exceeded their logout threshold
 * This is the main function called by the cron job
 */
const checkAndAutoLogout = async () => {
    const checkStartTime = new Date();
    verboseLog(`[autoLogoutService] 🔍 Running auto-logout check at ${checkStartTime.toISOString()}`);

    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
        verboseLog('[autoLogoutService] ⚠️ Database not connected, skipping auto-logout check');
        return;
    }

    // CRITICAL: Check if auto logout feature is enabled
    const featureEnabled = await isAutoLogoutEnabled();
    if (!featureEnabled) {
        verboseLog('[autoLogoutService] ℹ️ Auto logout feature is disabled, skipping check');
        return;
    }

    // CRITICAL: Clean up legacy sessions first (one-time cleanup)
    await cleanupLegacySessions();

    try {
        const now = new Date();

        // Find all attendance logs with active sessions (no clockOutTime and active session)
        // CRITICAL: Exclude legacy sessions that have been cleaned up
        const activeAttendanceLogs = await AttendanceLog.find({
            clockOutTime: null, // Not yet logged out
            isLegacySession: { $ne: true } // Exclude legacy sessions
        }).populate('user').lean();

        if (!activeAttendanceLogs || activeAttendanceLogs.length === 0) {
            verboseLog('[autoLogoutService] ℹ️ No active attendance sessions found');
            return;
        }

        verboseLog(`[autoLogoutService] 📊 Found ${activeAttendanceLogs.length} active attendance log(s) to check`);

        // Performance: fetch buffer setting once per cycle (not per user) and bulk-fetch sessions
        const cycleBufferMinutes = await getAutoLogoutBufferMinutes();
        
        // Bulk-fetch all active AttendanceSessions in one $in query (N+1 fix)
        const activeLogIds = activeAttendanceLogs.map(log => log._id);
        const allActiveSessions = await AttendanceSession.find({
            attendanceLog: { $in: activeLogIds },
            endTime: null,
            isLegacySession: { $ne: true }
        }).sort({ startTime: -1 }).lean();
        
        // Build a map: logId -> [sessions] for O(1) lookup per user
        const sessionsByLogId = {};
        for (const session of allActiveSessions) {
            const key = session.attendanceLog.toString();
            if (!sessionsByLogId[key]) sessionsByLogId[key] = [];
            sessionsByLogId[key].push(session);
        }

        let autoLogoutCount = 0;
        let skippedCount = 0;
        let processedCount = 0;

        for (const attendanceLog of activeAttendanceLogs) {
            try {
                processedCount++;
                
                // CRITICAL: Handle legacy/orphan sessions - close them immediately
                if (!attendanceLog.user || !attendanceLog.user._id || !attendanceLog.user.isActive) {
                    // This is a legacy session - close it immediately
                    const activeSession = await AttendanceSession.findOne({
                        attendanceLog: attendanceLog._id,
                        endTime: null
                    }).lean();

                    if (activeSession) {
                        const sessionStartTime = new Date(activeSession.startTime || attendanceLog.clockInTime || attendanceLog.createdAt || now);
                        
                        // Close session
                        await AttendanceSession.findByIdAndUpdate(activeSession._id, {
                            $set: {
                                endTime: sessionStartTime,
                                logoutType: 'SYSTEM',
                                autoLogoutReason: 'Legacy session closed (pre-auto-logout)',
                                isLegacySession: true
                            }
                        });

                        // Close attendance log
                        await AttendanceLog.findByIdAndUpdate(attendanceLog._id, {
                            $set: {
                                clockOutTime: sessionStartTime,
                                totalWorkingHours: 0,
                                paidBreakMinutesTaken: 0,
                                unpaidBreakMinutesTaken: 0,
                                logoutType: 'SYSTEM',
                                autoLogoutReason: 'Legacy session closed (pre-auto-logout)',
                                isLegacySession: true
                            }
                        });

                        verboseLog(`[autoLogoutService] 🧹 Closed legacy session for ${attendanceLog.user?.email || 'unknown user'}`);
                        autoLogoutCount++; // Count as processed
                    } else {
                        // No active session, just close the log
                        const logStartTime = attendanceLog.clockInTime || attendanceLog.createdAt || now;
                        await AttendanceLog.findByIdAndUpdate(attendanceLog._id, {
                            $set: {
                                clockOutTime: logStartTime,
                                totalWorkingHours: 0,
                                logoutType: 'SYSTEM',
                                autoLogoutReason: 'Legacy session closed (pre-auto-logout)',
                                isLegacySession: true
                            }
                        });
                        verboseLog(`[autoLogoutService] 🧹 Closed legacy log for ${attendanceLog.user?.email || 'unknown user'}`);
                        autoLogoutCount++;
                    }
                    continue; // Skip normal processing
                }

                // Get active sessions from pre-fetched bulk map (eliminates N+1 DB queries)
                const activeSessions = sessionsByLogId[attendanceLog._id.toString()] || [];

                // If multiple active sessions exist, log a warning and use the most recent
                if (activeSessions.length > 1) {
                    verboseLog(`[autoLogoutService] ⚠️ WARNING: User ${attendanceLog.user?.email || 'unknown'} has ${activeSessions.length} active sessions. Using most recent.`);
                }

                const activeSession = activeSessions.length > 0 ? activeSessions[0] : null;

                if (!activeSession) {
                    // No active session, but clockOutTime is null - data inconsistency
                    // This can happen if a session was manually closed but clockOutTime wasn't updated
                    // Try to fix this by setting clockOutTime to the last session's endTime
                    const lastSession = await AttendanceSession.findOne({
                        attendanceLog: attendanceLog._id
                    }).sort({ endTime: -1 }).lean();
                    
                    if (lastSession && lastSession.endTime) {
                        verboseLog(`[autoLogoutService] 🔧 Fixing data inconsistency for ${attendanceLog.user?.email || 'unknown'}: Setting clockOutTime to last session endTime`);
                        await AttendanceLog.findByIdAndUpdate(attendanceLog._id, {
                            $set: { clockOutTime: lastSession.endTime }
                        });
                    }
                    skippedCount++;
                    continue;
                }

                // Populate user with shift group
                const user = await User.findById(attendanceLog.user._id || attendanceLog.user).populate('shiftGroup');
                
                // CRITICAL: Skip auto-logout for night-shift employees
                // Night-shift employees have extended attendance day until 6 AM
                if (user && isNightShiftEmployee(user._id.toString())) {
                    verboseLog(`[autoLogoutService] ⏰ Skipping auto-logout for ${user.email} - night-shift employee (attendance day extends until 6 AM)`);
                    skippedCount++;
                    continue;
                }
                
                if (!user || !user.shiftGroup) {
                    // User exists but has no shift - this might be a legacy case
                    // Check if session is very old (> 24 hours)
                    const sessionForCheck = await AttendanceSession.findOne({
                        attendanceLog: attendanceLog._id,
                        endTime: null
                    }).lean();
                    
                    if (sessionForCheck) {
                        const sessionAge = now - new Date(sessionForCheck.startTime || attendanceLog.clockInTime || attendanceLog.createdAt);
                        const hoursOld = sessionAge / (1000 * 60 * 60);
                        
                        if (hoursOld > 24) {
                            // Very old session without shift - treat as legacy
                            const sessionStartTime = new Date(sessionForCheck.startTime || attendanceLog.clockInTime || attendanceLog.createdAt);
                            
                            await AttendanceSession.findByIdAndUpdate(sessionForCheck._id, {
                                $set: {
                                    endTime: sessionStartTime,
                                    logoutType: 'SYSTEM',
                                    autoLogoutReason: 'Legacy session closed (no shift assigned, >24h old)',
                                    isLegacySession: true
                                }
                            });
                            
                            await AttendanceLog.findByIdAndUpdate(attendanceLog._id, {
                                $set: {
                                    clockOutTime: sessionStartTime,
                                    totalWorkingHours: 0,
                                    logoutType: 'SYSTEM',
                                    autoLogoutReason: 'Legacy session closed (no shift assigned, >24h old)',
                                    isLegacySession: true
                                }
                            });
                            
                            verboseLog(`[autoLogoutService] 🧹 Closed legacy session (no shift, >24h old) for ${attendanceLog.user?.email || 'unknown'}`);
                            autoLogoutCount++;
                            continue;
                        }
                    }
                    
                    verboseLog(`[autoLogoutService] ⚠️ User ${attendanceLog.user?.email || 'unknown'} has no shift assigned, skipping`);
                    skippedCount++;
                    continue;
                }

                // Log attendance date for debugging
                // CRITICAL: Use IST timezone for accurate date comparison
                const attendanceDateStr = attendanceLog.attendanceDate; // YYYY-MM-DD format
                // Get today's date in IST timezone
                const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                const todayDateStr = nowIST.toISOString().slice(0, 10); // Get YYYY-MM-DD
                
                // Calculate days difference using date strings (timezone-safe)
                const attendanceDateObj = new Date(attendanceDateStr + 'T00:00:00+05:30'); // IST
                const todayDateObj = new Date(todayDateStr + 'T00:00:00+05:30'); // IST
                const daysDiff = Math.floor((todayDateObj - attendanceDateObj) / (1000 * 60 * 60 * 24));
                
                if (daysDiff > 0) {
                    verboseLog(`[autoLogoutService] 📅 Processing ${daysDiff} day(s) old attendance log for ${user.email} (date: ${attendanceLog.attendanceDate})`);
                    
                    // Warn if log is very old (more than 7 days) - might indicate data inconsistency
                    if (daysDiff > 7) {
                        verboseLog(`[autoLogoutService] ⚠️ WARNING: Very old attendance log (${daysDiff} days) for ${user.email}. This might indicate a data inconsistency.`);
                    }
                }

                // Calculate expected logout time using the daily status service
                // This ensures we use the same calculation logic as everywhere else
                const expectedLogoutTime = await calculateExpectedLogoutTime(
                    user._id,
                    attendanceLog.attendanceDate
                );

                if (!expectedLogoutTime) {
                    verboseLog(`[autoLogoutService] ⚠️ Could not calculate expected logout time for user ${user.email} (date: ${attendanceLog.attendanceDate}), skipping`);
                    skippedCount++;
                    continue;
                }

                // Calculate auto logout threshold (async - needs to fetch settings)
                const autoLogoutThreshold = await calculateAutoLogoutThreshold(expectedLogoutTime);

                if (!autoLogoutThreshold) {
                    verboseLog(`[autoLogoutService] ⚠️ Could not calculate auto-logout threshold for user ${user.email}, skipping`);
                    skippedCount++;
                    continue;
                }

                // CRITICAL: Handle overnight shifts
                // For overnight shifts, the logout time might be on the next day
                // Check if the expected logout time is actually on the next day compared to attendance date
                // Use IST timezone for accurate comparison
                const expectedLogoutIST = new Date(new Date(expectedLogoutTime).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                const expectedLogoutDateStr = expectedLogoutIST.toISOString().slice(0, 10);
                const isOvernightShift = expectedLogoutDateStr > attendanceDateStr;
                
                if (isOvernightShift) {
                    verboseLog(`[autoLogoutService] 🌙 Detected overnight shift for ${user.email} (logout on next day)`);
                }

                // CRITICAL: For past dates (yesterday or older), auto-logout immediately if threshold has passed
                // For today's date, check if threshold has been exceeded
                // For overnight shifts, also check if we're past the threshold
                const shouldAutoLogout = now >= autoLogoutThreshold;

                // CRITICAL: Safety check - Don't auto-logout if session is too new
                // This prevents logging out users who just clocked in
                const sessionStartTime = new Date(activeSession.startTime);
                const sessionAgeMinutes = (now - sessionStartTime) / (1000 * 60);
                const bufferMinutes = cycleBufferMinutes;
                const minSessionAge = bufferMinutes; // Don't logout sessions newer than buffer period
                
                if (shouldAutoLogout && sessionAgeMinutes < minSessionAge) {
                    verboseLog(`[autoLogoutService] ⚠️ Skipping auto-logout for ${user.email}: Session is too new (${Math.round(sessionAgeMinutes)} minutes old, minimum ${minSessionAge} minutes required)`);
                    skippedCount++;
                    continue;
                }

                if (shouldAutoLogout) {
                    verboseLog(`[autoLogoutService] ⏰ User ${user.email} exceeded auto-logout threshold`);
                    verboseLog(`[autoLogoutService]   Attendance Date: ${attendanceLog.attendanceDate}`);
                    verboseLog(`[autoLogoutService]   Expected logout: ${expectedLogoutTime.toISOString()}`);
                    verboseLog(`[autoLogoutService]   Auto-logout threshold: ${autoLogoutThreshold.toISOString()}`);
                    verboseLog(`[autoLogoutService]   Current time: ${now.toISOString()}`);
                    verboseLog(`[autoLogoutService]   Time exceeded by: ${Math.round((now - autoLogoutThreshold) / (1000 * 60))} minutes`);
                    verboseLog(`[autoLogoutService]   Session age: ${Math.round(sessionAgeMinutes)} minutes`);
                    
                    // Perform auto logout
                    const success = await performAutoLogout(attendanceLog, activeSession, user, cycleBufferMinutes);
                    if (success) {
                        autoLogoutCount++;
                        verboseLog(`[autoLogoutService] ✅ Successfully auto-logged out ${user.email}`);
                    } else {
                        verboseLog(`[autoLogoutService] ❌ Failed to auto-logout ${user.email}`);
                    }
                } else {
                    // Not yet time for auto-logout
                    const minutesUntilAutoLogout = Math.round((autoLogoutThreshold - now) / (1000 * 60));
                    if (minutesUntilAutoLogout <= 30 && minutesUntilAutoLogout > 0) {
                        // Log warning if within 30 minutes of auto-logout
                        verboseLog(`[autoLogoutService] ⚠️ User ${user.email} will be auto-logged out in ~${minutesUntilAutoLogout} minutes`);
                    }
                }
            } catch (error) {
                console.error(`[autoLogoutService] ❌ Error processing attendance log ${attendanceLog._id}:`, error);
                console.error(`[autoLogoutService]   Error stack:`, error.stack);
                skippedCount++;
            }
        }

        const checkDuration = Math.round((new Date() - checkStartTime) / 1000);
        if (autoLogoutCount > 0) {
            console.log(`[autoLogoutService] Auto-logged out ${autoLogoutCount} employee(s) in ${checkDuration}s (processed ${processedCount}, skipped ${skippedCount})`);
        } else {
            verboseLog(`[autoLogoutService] Check completed in ${checkDuration}s — no auto-logouts (processed ${processedCount})`);
        }
    } catch (error) {
        console.error('[autoLogoutService] ❌ Fatal error in auto-logout check:', error);
        console.error('[autoLogoutService]   Error stack:', error.stack);
    }
};

module.exports = {
    checkAndAutoLogout,
    calculateExpectedLogoutTime,
    calculateAutoLogoutThreshold,
    performAutoLogout,
    getAutoLogoutBufferMinutes,
    isAutoLogoutEnabled, // Export for feature toggle checks
    cleanupLegacySessions, // Export for manual cleanup if needed
    DEFAULT_AUTO_LOGOUT_BUFFER_MINUTES
};

