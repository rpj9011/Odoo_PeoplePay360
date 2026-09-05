// backend/cron/onboardingReminderCron.js
// Sends profile completion reminders on Day 1, 3, 5, 6, and 7.
// Marks overdue records after the deadline passes.
// Uses existing NewNotificationService — no new systems required.

const User = require('../models/User');
const PolicyAcceptanceLog = require('../models/PolicyAcceptanceLog');
const NewNotificationService = require('../services/NewNotificationService');

const ONBOARDING_FEATURE_START_DATE = new Date(
    process.env.ONBOARDING_FEATURE_START_DATE || '2026-07-24T00:00:00+05:30'
);

/**
 * Run this cron daily (e.g., every day at 09:00 IST from cronService.js)
 */
async function runOnboardingReminders() {
    console.log('[OnboardingCron] Starting onboarding reminder run...');
    const now = new Date();

    try {
        // Only remind employees created after the onboarding feature (or admin-forced).
        // Pre-feature users who were wrongly enrolled must not keep getting nagged.
        const users = await User.find({
            'onboarding.firstLoginCompleted': true,
            'onboarding.completed': false,
            'onboarding.profileCompleted': false,
            'onboarding.profileCompletionDeadline': { $exists: true, $ne: null },
            $or: [
                { createdAt: { $gte: ONBOARDING_FEATURE_START_DATE } },
                { 'onboarding.forcedOnboardingBy': { $ne: null } },
            ],
        }).select('_id fullName onboarding createdAt').lean();

        console.log(`[OnboardingCron] Found ${users.length} users with pending profile completion.`);

        for (const user of users) {
            const deadline = new Date(user.onboarding.profileCompletionDeadline);
            const msRemaining = deadline - now;
            const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

            // Mark overdue
            if (msRemaining <= 0) {
                await User.findByIdAndUpdate(user._id, {
                    $set: { 'onboarding.status': 'overdue' }
                });
                await PolicyAcceptanceLog.findOneAndUpdate(
                    { userId: user._id, status: { $ne: 'completed' } },
                    { $set: { status: 'overdue' } }
                );
                // Send overdue notification (once per day — the notification TTL handles dedup)
                try {
                    await NewNotificationService.createAndEmitNotification({
                        message: `Your profile completion deadline has passed. Please complete your profile immediately.`,
                        type: 'onboarding_overdue',
                        userId: user._id,
                        userName: user.fullName,
                        recipientType: 'user',
                        category: 'system',
                        priority: 'high',
                        navigationData: { page: 'profile' },
                        metadata: { type: 'ONBOARDING_OVERDUE', daysOverdue: Math.abs(daysRemaining) }
                    });
                } catch (e) {
                    console.error(`[OnboardingCron] Overdue notification failed for ${user.fullName}:`, e.message);
                }
                continue;
            }

            // Send reminders on specific days remaining
            const reminderDays = [7, 6, 5, 3, 1];
            if (reminderDays.includes(daysRemaining)) {
                const dayLabel = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`;
                try {
                    await NewNotificationService.createAndEmitNotification({
                        message: `Reminder: You have ${dayLabel} remaining to complete your profile. Please fill in your details to finish onboarding.`,
                        type: 'onboarding_deadline_reminder',
                        userId: user._id,
                        userName: user.fullName,
                        recipientType: 'user',
                        category: 'system',
                        priority: daysRemaining <= 2 ? 'high' : 'medium',
                        navigationData: { page: 'profile' },
                        metadata: { type: 'ONBOARDING_PROFILE_REMINDER', daysRemaining }
                    });
                    console.log(`[OnboardingCron] Sent ${daysRemaining}-day reminder to ${user.fullName}`);
                } catch (e) {
                    console.error(`[OnboardingCron] Reminder notification failed for ${user.fullName}:`, e.message);
                }
            }
        }

        console.log('[OnboardingCron] Reminder run complete.');
    } catch (err) {
        console.error('[OnboardingCron] Fatal error during run:', err);
    }
}

module.exports = { runOnboardingReminders };
