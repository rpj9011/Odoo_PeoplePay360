// backend/routes/breaks.js

const express = require('express');
const authenticateToken = require('../middleware/authenticateToken');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const AttendanceSession = require('../models/AttendanceSession');
const BreakLog = require('../models/BreakLog');
const ExtraBreakRequest = require('../models/ExtraBreakRequest');
const NewNotificationService = require('../services/NewNotificationService');
const cache = require('../utils/cache');
const { getISTNow, getISTDateString } = require('../utils/istTime');
const { HR_FAMILY } = require('../config/roles');
const { 
    UNPAID_BREAK_ALLOWANCE_MINUTES, 
    EXTRA_BREAK_ALLOWANCE_MINUTES,
    PAID_BREAK_ALLOWANCE_MINUTES 
} = require('../config/shiftPolicy');

const router = express.Router();

router.post('/start', authenticateToken, async (req, res) => { 
    const { userId } = req.user;
    const { breakType } = req.body;
    const today = getISTDateString();

    if (!breakType || !['Paid', 'Unpaid', 'Extra'].includes(breakType)) {
        return res.status(400).json({ error: 'A valid break type is required.' });
    }

    try {
        const log = await AttendanceLog.findOne({ user: userId, attendanceDate: today });
        if (!log) return res.status(400).json({ error: 'You must be clocked in to start a break.' });
        
        // ... (rest of the validation logic is fine)
        const activeSession = await AttendanceSession.findOne({ attendanceLog: log._id, endTime: null });
        if (!activeSession) return res.status(400).json({ error: 'You must be in an active work session to start a break.' });
        const activeBreak = await BreakLog.findOne({ attendanceLog: log._id, endTime: null });
        if (activeBreak) return res.status(400).json({ error: 'You are already on a break.' });
        if (breakType === 'Extra') {
            const availableRequest = await ExtraBreakRequest.findOne({ user: userId, attendanceLog: log._id, status: 'Approved', isUsed: false });
            if (!availableRequest) return res.status(403).json({ error: 'You do not have an approved extra break to use.' });
            availableRequest.isUsed = true;
            await availableRequest.save();
        }

        const newBreak = await BreakLog.create({
            attendanceLog: log._id,
            userId: userId,
            type: breakType,
            breakType: breakType,
            startTime: getISTNow()
        });

        const user = await User.findById(userId);
        if (user) {
            // FIX: Prevent user from getting their own notification
            if (!HR_FAMILY.includes(user.role)) {
                NewNotificationService.createAndEmitNotification({
                    message: `Your ${breakType} break has started.`,
                    type: 'info',
                    userId,
                    userName: user.fullName,
                    recipientType: 'user',
                    category: 'break',
                }).catch(err => console.error('Error sending break start confirmation to user:', err));
            }
            // Always notify admins
            NewNotificationService.notifyBreakStart(userId, user.fullName, breakType)
                .catch(err => console.error('Error sending break start notification to admins:', err));
        }

        // PHASE 4 OPTIMIZATION: Cache invalidation on mutation
        const cacheKey = `status:${userId}:${today}`;
        cache.delete(cacheKey);
        cache.deletePattern(`dashboard-summary:*`);
        cache.delete(`employee_dashboard:${userId}:${today}`);
        // Invalidate real dashboard cache (cacheService) so "who's in" and summary stay fresh
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(today);

        // Emit Socket.IO event for real-time updates (replaces polling)
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: userId,
                    attendanceDate: today,
                    timestamp: getISTNow().toISOString(),
                    message: `${user.fullName} started a ${breakType} break`
                });
                console.log(`📡 Emitted attendance_log_updated event for break start ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        res.status(201).json({ message: 'Break started successfully.', break: newBreak });
    } catch (error) {
        console.error('Start Break Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/end', authenticateToken, async (req, res) => {
    const { userId } = req.user;
    const today = getISTDateString();

    try {
        const log = await AttendanceLog.findOne({ user: userId, attendanceDate: today });
        if (!log) return res.status(400).json({ error: 'Cannot find attendance log for today.' });

        const activeBreak = await BreakLog.findOne({ attendanceLog: log._id, endTime: null }).sort({ startTime: -1 });
        if (!activeBreak) return res.status(400).json({ error: 'You are not currently on a break.' });
        
        // ... (rest of the break ending logic is fine)
        const breakEndTime = getISTNow();
        const currentBreakDuration = Math.round((breakEndTime - new Date(activeBreak.startTime)) / (1000 * 60));
        let penalty = 0, paidBreakToAdd = 0, unpaidBreakToAdd = 0;
        if (activeBreak.breakType === 'Paid') {
            const user = await User.findById(userId).populate('shiftGroup');
            const paidBreakAllowance = user?.shiftGroup?.paidBreakMinutes || PAID_BREAK_ALLOWANCE_MINUTES;
            const remainingPaidAllowance = paidBreakAllowance - log.paidBreakMinutesTaken;
            
            // CRITICAL FIX: Always add the FULL paid break duration to paidBreakMinutesTaken
            // The logout calculation will correctly identify excess beyond the allowance
            // This ensures required logout time extends when paid breaks exceed 30 minutes
            paidBreakToAdd = currentBreakDuration;
            
            // Calculate penalty for excess (for reporting purposes)
            if (currentBreakDuration > Math.max(0, remainingPaidAllowance)) {
                penalty = currentBreakDuration - Math.max(0, remainingPaidAllowance);
            }
        } else if (activeBreak.breakType === 'Unpaid' || activeBreak.breakType === 'Extra') {
            const allowance = activeBreak.breakType === 'Unpaid' ? UNPAID_BREAK_ALLOWANCE_MINUTES : EXTRA_BREAK_ALLOWANCE_MINUTES;
            // The FULL unpaid break duration extends the shift, not just the allowance
            unpaidBreakToAdd = currentBreakDuration;
            // Penalty is tracked separately for reporting, but doesn't affect shift extension
            if (currentBreakDuration > allowance) {
                penalty = currentBreakDuration - allowance;
            }
        }
        const updatedBreak = await BreakLog.findByIdAndUpdate(activeBreak._id, { $set: { endTime: breakEndTime, durationMinutes: currentBreakDuration } }, { new: true });
        const updatePayload = { $inc: {} };
        if (penalty > 0) updatePayload.$inc.penaltyMinutes = penalty;
        if (paidBreakToAdd > 0) updatePayload.$inc.paidBreakMinutesTaken = paidBreakToAdd;
        if (unpaidBreakToAdd > 0) updatePayload.$inc.unpaidBreakMinutesTaken = unpaidBreakToAdd;
        if (Object.keys(updatePayload.$inc).length > 0) {
            await AttendanceLog.findByIdAndUpdate(log._id, updatePayload);
        }

        const user = await User.findById(userId);
        if (user) {
            // FIX: Prevent user from getting their own notification
            if (!HR_FAMILY.includes(user.role)) {
                NewNotificationService.createAndEmitNotification({
                    message: `Your ${activeBreak.breakType} break has ended.`,
                    type: 'info',
                    userId,
                    userName: user.fullName,
                    recipientType: 'user',
                    category: 'break',
                }).catch(err => console.error('Error sending break end confirmation to user:', err));
            }
            // Always notify admins
            NewNotificationService.notifyBreakEnd(userId, user.fullName, activeBreak.breakType)
                .catch(err => console.error('Error sending break end notification to admins:', err));
        }

        // PHASE 4 OPTIMIZATION: Cache invalidation on mutation
        const cacheKey = `status:${userId}:${today}`;
        cache.delete(cacheKey);
        cache.deletePattern(`dashboard-summary:*`);
        cache.delete(`employee_dashboard:${userId}:${today}`);
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(today);

        // Emit Socket.IO event for real-time updates (replaces polling)
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('attendance_log_updated', {
                    logId: log._id,
                    userId: userId,
                    attendanceDate: today,
                    timestamp: getISTNow().toISOString(),
                    message: `${user.fullName} ended ${activeBreak.breakType} break`
                });
                console.log(`📡 Emitted attendance_log_updated event for break end ${log._id}`);
            }
        } catch (socketError) {
            console.error('Failed to emit Socket.IO event:', socketError);
            // Don't fail the main request if Socket.IO fails
        }

        res.json({ message: 'Break ended successfully.', break: updatedBreak });
    } catch (error) {
        console.error('End Break Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Extra break request logic is fine as it correctly notifies admins and confirms with user.
router.post('/request-extra', authenticateToken, async (req, res) => {
    // ... this route's logic is already correct
    const { userId } = req.user;
    const { reason } = req.body;
    const today = getISTDateString();
    if (!reason || reason.trim().length === 0) return res.status(400).json({ error: 'A reason is required.' });
    try {
        const log = await AttendanceLog.findOne({ user: userId, attendanceDate: today });
        if (!log) return res.status(400).json({ error: 'You must be clocked in.' });
        const existingRequest = await ExtraBreakRequest.findOne({ user: userId, attendanceLog: log._id });
        if (existingRequest) return res.status(400).json({ error: 'You have already requested an extra break today.' });
        const newRequest = await ExtraBreakRequest.create({ user: userId, attendanceLog: log._id, reason: reason.trim() });
        const user = await User.findById(userId);
        if (user) {
            NewNotificationService.notifyExtraBreakRequest(userId, user.fullName, reason.trim()).catch(err => console.error(err));
            NewNotificationService.createAndEmitNotification({
                message: `Your extra break request for "${reason.trim()}" has been submitted.`,
                type: 'info', userId, userName: user.fullName, recipientType: 'user', category: 'break'
            }).catch(err => console.error(err));
        }
        
        // Invalidate dashboard cache to ensure new extra break request appears in recent activity
        const cacheService = require('../services/cacheService');
        cacheService.invalidateDashboard(today);
        
        res.status(201).json({ message: 'Your request has been sent for approval.', request: newRequest });
    } catch (error) {
        console.error('Extra Break Request Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;