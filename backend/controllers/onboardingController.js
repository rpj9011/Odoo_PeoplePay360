// backend/controllers/onboardingController.js
// Handles all onboarding flow endpoints.
// Extends existing models/routes — no duplicate collections.

const User = require('../models/User');
const Policy = require('../models/Policy');
const PolicyAcceptanceLog = require('../models/PolicyAcceptanceLog');
const NewNotificationService = require('../services/NewNotificationService');
const cacheService = require('../services/cacheService');
const mongoose = require('mongoose');

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Cutoff for mandatory onboarding / policy acknowledgement.
 * Only employees created on or after this date are auto-enrolled.
 * Pre-existing employees are grandfathered out (unless an admin forces onboarding).
 * Override with ONBOARDING_FEATURE_START_DATE (ISO string) if needed.
 */
const ONBOARDING_FEATURE_START_DATE = new Date(
    process.env.ONBOARDING_FEATURE_START_DATE || '2026-07-24T00:00:00+05:30'
);

/**
 * True when this user should go through onboarding acknowledgement.
 * - Admin-forced users always qualify
 * - Otherwise only accounts created on/after the feature start date
 */
function isEligibleForOnboarding(user) {
    if (user?.onboarding?.forcedOnboardingBy) return true;

    const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
        return createdAt >= ONBOARDING_FEATURE_START_DATE;
    }

    // Fallback when createdAt is missing (should be rare with timestamps: true)
    const joiningDate = user?.joiningDate ? new Date(user.joiningDate) : null;
    if (joiningDate && !Number.isNaN(joiningDate.getTime())) {
        return joiningDate >= ONBOARDING_FEATURE_START_DATE;
    }

    return false;
}

/** Parse UA string into a human-readable device / browser summary. */
function parseUA(ua = '') {
    let device = 'Desktop';
    if (/mobile/i.test(ua)) device = 'Mobile';
    else if (/tablet|ipad/i.test(ua)) device = 'Tablet';

    let browser = 'Unknown';
    if (/edg\//i.test(ua))         browser = 'Edge';
    else if (/firefox/i.test(ua))  browser = 'Firefox';
    else if (/opr\//i.test(ua))    browser = 'Opera';
    else if (/chrome/i.test(ua))   browser = 'Chrome';
    else if (/safari/i.test(ua))   browser = 'Safari';
    else if (/msie|trident/i.test(ua)) browser = 'IE';

    return { device, browser };
}

/** Calculate minimum reading time in seconds based on word count at 200 WPM */
function calcMinReadSeconds(wordCount) {
    if (!wordCount || wordCount <= 0) return 60; // default 1 min if unknown
    return Math.ceil((wordCount / 200) * 60);
}

/** Required profile fields before admin can mark onboarding complete */
function evaluateProfileCompletion(user) {
    const pd = user.personalDetails || {};
    const id = user.identityDetails || {};
    const addr = pd.address || {};

    const checks = [
        ['gender', pd.gender],
        ['phoneNumber', pd.phoneNumber],
        ['dateOfBirth', pd.dateOfBirth],
        ['emergencyContactName', pd.emergencyContactName],
        ['emergencyContactNumber', pd.emergencyContactNumber],
        ['emergencyContactRelationship', pd.emergencyContactRelationship],
        ['addressCity', addr.city],
        ['addressState', addr.state],
        ['addressPincode', addr.pincode],
        ['aadhaarNumber', id.aadhaarNumber],
        ['panCardNumber', id.panCardNumber],
        ['bankName', id.bankName],
        ['accountNumber', id.accountNumber],
        ['ifscCode', id.ifscCode],
    ];

    const missingFields = checks
        .filter(([, value]) => !value || String(value).trim() === '')
        .map(([key]) => key);

    return {
        profileCompleted: missingFields.length === 0,
        profileFilledCount: checks.length - missingFields.length,
        profileFieldsTotal: checks.length,
        missingFields,
    };
}

/** Admin-facing status — completed only after full profile submission */
function resolveComplianceDisplayStatus(log, user) {
    const profileEval = user ? evaluateProfileCompletion(user) : { profileCompleted: false };
    const profileDone = profileEval.profileCompleted;
    const tourDone = user?.onboarding?.tourCompleted
        || log.timeline?.some((t) => t.event === 'tour_completed');

    if (log.status === 'expired') return 'expired';
    if (log.status === 'overdue' && !profileDone) return 'overdue';
    if (profileDone && log.status === 'completed') return 'completed';
    if (tourDone && log.accepted && !profileDone) return 'incomplete';
    if (log.accepted || log.status === 'in_progress') return 'in_progress';
    return log.status || 'pending';
}

// ─── GET /api/onboarding/status ───────────────────────────────────────────────
/**
 * Returns the current user's onboarding status plus the mandatory policy
 * (if any) and whether the induction has expired.
 * Used by the frontend AuthContext to decide whether to show the onboarding flow.
 */
exports.getOnboardingStatus = async (req, res) => {
    try {
        const userId = req.user.userId;

        const user = await User.findById(userId)
            .select('onboarding fullName employeeCode department joiningDate createdAt personalDetails identityDetails')
            .lean();

        if (!user) return res.status(404).json({ error: 'User not found.' });

        const mandatoryPolicy = await Policy.findOne({
            isMandatoryOnboarding: true,
            status: 'Active'
        }).select('_id name version isMandatoryOnboarding onboardingExpiryDays wordCount').lean();

        // Determine if the induction doc has expired for this user
        let inductionExpired = false;
        if (user.onboarding?.inductionExpiryDate) {
            inductionExpired = new Date() > new Date(user.onboarding.inductionExpiryDate);
        }

        const profileEval = evaluateProfileCompletion(user);

        // Only employees created after the onboarding feature (or admin-forced)
        // should see the acknowledgement — enrollment flags alone are not enough,
        // because pre-feature users may have been wrongly enrolled earlier.
        const isNewOnboardingEmployee = isEligibleForOnboarding(user);

        // Check for pending policy acknowledgements (new dynamic policy assignment)
        let pendingPolicyAcknowledgement = null;
        if (mandatoryPolicy) {
            const existingLog = await PolicyAcceptanceLog.findOne({
                userId: userId,
                policyId: mandatoryPolicy._id,
                accepted: false
            }).lean();

            if (existingLog) {
                pendingPolicyAcknowledgement = {
                    policyId: mandatoryPolicy._id,
                    policyName: mandatoryPolicy.name,
                    policyVersion: mandatoryPolicy.version,
                    logId: existingLog._id
                };
            }
        }

        return res.json({
            onboarding: user.onboarding || {},
            mandatoryPolicy: mandatoryPolicy || null,
            inductionExpired,
            isNewOnboardingEmployee,
            profileCompleted: profileEval.profileCompleted,
            profileFilledCount: profileEval.profileFilledCount,
            profileFieldsTotal: profileEval.profileFieldsTotal,
            missingProfileFields: profileEval.missingFields,
            pendingPolicyAcknowledgement,
        });
    } catch (err) {
        console.error('[Onboarding] getOnboardingStatus error:', err);
        res.status(500).json({ error: 'Failed to fetch onboarding status.' });
    }
};

// ─── POST /api/onboarding/first-login ────────────────────────────────────────
/**
 * Called once when the employee's first login is detected on the frontend.
 * Marks firstLoginCompleted, creates the PolicyAcceptanceLog skeleton,
 * and sends the welcome notification.
 */
exports.recordFirstLogin = async (req, res) => {
    try {
        const userId = req.user.userId;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Pre-feature employees must never be enrolled (unless admin-forced).
        if (!isEligibleForOnboarding(user)) {
            return res.json({
                message: 'Onboarding not required for this employee.',
                onboarding: user.onboarding || {},
                isNewOnboardingEmployee: false,
            });
        }

        // Idempotent — if already done, just return current state
        if (user.onboarding?.firstLoginCompleted) {
            return res.json({ message: 'Already recorded.', onboarding: user.onboarding });
        }

        const mandatoryPolicy = await Policy.findOne({
            isMandatoryOnboarding: true,
            status: 'Active'
        }).lean();

        const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const inductionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        user.onboarding = {
            ...(user.onboarding || {}),
            firstLoginCompleted: true,
            profileCompletionDeadline: deadline,
            inductionExpiryDate: inductionExpiry,
        };

        // Create audit log skeleton
        let logId = null;
        if (mandatoryPolicy) {
            const log = await PolicyAcceptanceLog.create({
                userId: user._id,
                userName: user.fullName,
                employeeCode: user.employeeCode,
                department: user.department || '',
                policyId: mandatoryPolicy._id,
                policyName: mandatoryPolicy.name,
                policyVersion: mandatoryPolicy.version,
                minimumReadingSeconds: calcMinReadSeconds(mandatoryPolicy.wordCount),
                profileDeadline: deadline,
                status: 'in_progress',
                timeline: [{
                    event: 'first_login',
                    timestamp: new Date(),
                    notes: 'Employee completed first login'
                }]
            });
            logId = log._id;
            user.onboarding.policyAcceptanceLogId = logId;
        }

        await user.save();
        cacheService.invalidateUser(user._id.toString());

        // Send welcome notification
        setImmediate(async () => {
            try {
                await NewNotificationService.createAndEmitNotification({
                    message: `Welcome to the team, ${user.fullName}! Please complete your onboarding to get started.`,
                    type: 'onboarding_welcome',
                    userId: user._id,
                    userName: user.fullName,
                    recipientType: 'user',
                    category: 'system',
                    priority: 'high',
                    navigationData: { page: 'dashboard' },
                    metadata: { type: 'ONBOARDING_WELCOME' }
                });
            } catch (e) {
                console.error('[Onboarding] Welcome notification failed:', e.message);
            }
        });

        return res.json({ message: 'First login recorded.', onboarding: user.onboarding });
    } catch (err) {
        console.error('[Onboarding] recordFirstLogin error:', err);
        res.status(500).json({ error: 'Failed to record first login.' });
    }
};

// ─── POST /api/onboarding/policy/start-reading ───────────────────────────────
/**
 * Records that the employee opened the policy document and started reading.
 */
exports.startReadingPolicy = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).select('onboarding fullName').lean();
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const logId = user.onboarding?.policyAcceptanceLogId;
        if (!logId) return res.status(400).json({ error: 'No onboarding log found. Call first-login first.' });

        await PolicyAcceptanceLog.findByIdAndUpdate(logId, {
            $set: { readingStartedAt: new Date() },
            $push: {
                timeline: {
                    event: 'reading_started',
                    timestamp: new Date(),
                    notes: 'Employee opened policy document'
                }
            }
        });

        return res.json({ message: 'Reading started.' });
    } catch (err) {
        console.error('[Onboarding] startReadingPolicy error:', err);
        res.status(500).json({ error: 'Failed to record reading start.' });
    }
};

// ─── POST /api/onboarding/policy/accept ──────────────────────────────────────
/**
 * Called when the employee checks the acknowledgment box and clicks Accept.
 * Backend validates:
 *   1. JWT is valid (middleware)
 *   2. A mandatory policy exists and matches the submitted policyId
 *   3. Reading duration >= minimum required seconds (60s)
 *   4. scrolledToBottom is true
 */
exports.acceptPolicy = async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            policyId,
            policyVersion,
            checkboxAcknowledged,
            readingDurationSeconds,
            scrolledToBottom,
        } = req.body;

        // ── Validation ────────────────────────────────────────────────────────
        if (!policyId || !policyVersion) {
            return res.status(400).json({ error: 'policyId and policyVersion are required.' });
        }
        if (!checkboxAcknowledged) {
            return res.status(400).json({ error: 'You must acknowledge the checkbox to accept.' });
        }

        // Verify the policy is still the active mandatory one
        const policy = await Policy.findOne({
            _id: policyId,
            isMandatoryOnboarding: true,
            status: 'Active'
        }).lean();

        if (!policy) {
            return res.status(400).json({ error: 'No active mandatory onboarding policy found.' });
        }

        if (policy.version !== policyVersion) {
            return res.status(400).json({ error: 'Policy version mismatch. Please reload and try again.' });
        }

        if (!scrolledToBottom) {
            return res.status(400).json({ error: 'You must scroll to the bottom of the policy before accepting.' });
        }

        const minSeconds = 60;
        if (!readingDurationSeconds || readingDurationSeconds < minSeconds) {
            return res.status(400).json({
                error: `Minimum reading time not met. Required: ${minSeconds}s, Recorded: ${readingDurationSeconds || 0}s.`
            });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Idempotent
        if (user.onboarding?.policyAccepted) {
            return res.json({ message: 'Policy already accepted.', onboarding: user.onboarding });
        }

        const now = new Date();
        const ip = req.ip || req.connection?.remoteAddress || '';
        const ua = req.headers['user-agent'] || '';
        const { device, browser } = parseUA(ua);

        // Update the acceptance log
        const logId = user.onboarding?.policyAcceptanceLogId;
        if (logId) {
            await PolicyAcceptanceLog.findByIdAndUpdate(logId, {
                $set: {
                    readingCompletedAt: now,
                    readingDurationSeconds,
                    scrolledToBottom,
                    accepted: true,
                    acceptedAt: now,
                    checkboxAcknowledged,
                    ipAddress: ip,
                    userAgent: ua,
                    deviceType: device,
                    browser,
                    status: 'in_progress',
                },
                $push: {
                    timeline: {
                        $each: [
                            { event: 'reading_completed', timestamp: now, notes: `Reading time: ${readingDurationSeconds}s` },
                            { event: 'policy_accepted', timestamp: now, notes: `Accepted from ${ip} via ${browser}` }
                        ]
                    }
                }
            });
        }

        // Update user
        user.onboarding = {
            ...(user.onboarding || {}),
            policyAccepted: true,
            policyAcceptedAt: now,
            policyVersionAccepted: policyVersion,
        };
        await user.save();
        cacheService.invalidateUser(user._id.toString());

        return res.json({ message: 'Policy accepted successfully.', onboarding: user.onboarding });
    } catch (err) {
        console.error('[Onboarding] acceptPolicy error:', err);
        res.status(500).json({ error: 'Failed to record policy acceptance.' });
    }
};

// ─── POST /api/onboarding/tour/complete ──────────────────────────────────────
/**
 * Called when the employee finishes the guided app tour.
 */
exports.completeTour = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const now = new Date();
        user.onboarding = {
            ...(user.onboarding || {}),
            tourCompleted: true,
            tourCompletedAt: now,
        };
        await user.save();
        cacheService.invalidateUser(user._id.toString());

        // Update log
        const logId = user.onboarding.policyAcceptanceLogId;
        if (logId) {
            await PolicyAcceptanceLog.findByIdAndUpdate(logId, {
                $set: { status: 'in_progress' },
                $push: {
                    timeline: { event: 'tour_completed', timestamp: now, notes: 'App tour completed' }
                }
            });
        }

        return res.json({ message: 'Tour completed.', onboarding: user.onboarding });
    } catch (err) {
        console.error('[Onboarding] completeTour error:', err);
        res.status(500).json({ error: 'Failed to record tour completion.' });
    }
};

// ─── POST /api/onboarding/profile/complete ───────────────────────────────────
/**
 * Called when the employee saves their profile with sufficient fields filled.
 * Also marks the full onboarding as completed.
 */
exports.completeProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const profileEval = evaluateProfileCompletion(user);
        if (!profileEval.profileCompleted) {
            return res.status(400).json({
                error: 'Please save all required profile fields before completing onboarding.',
                missingProfileFields: profileEval.missingFields,
                profileFilledCount: profileEval.profileFilledCount,
                profileFieldsTotal: profileEval.profileFieldsTotal,
            });
        }

        if (user.onboarding?.completed && user.onboarding?.profileCompleted) {
            return res.json({ message: 'Profile already completed.', onboarding: user.onboarding });
        }

        const now = new Date();
        user.onboarding = {
            ...(user.onboarding || {}),
            profileCompleted: true,
            profileCompletedAt: now,
            completed: true,
        };
        await user.save();
        cacheService.invalidateUser(user._id.toString());

        // Update log
        const logId = user.onboarding.policyAcceptanceLogId;
        if (logId) {
            await PolicyAcceptanceLog.findByIdAndUpdate(logId, {
                $set: {
                    status: 'completed',
                    onboardingCompletedAt: now,
                },
                $push: {
                    timeline: {
                        $each: [
                            { event: 'profile_completed', timestamp: now, notes: 'Profile saved with required fields' },
                            { event: 'onboarding_completed', timestamp: now, notes: 'Full onboarding journey completed' }
                        ]
                    }
                }
            });
        }

        // Notify employee
        setImmediate(async () => {
            try {
                await NewNotificationService.createAndEmitNotification({
                    message: 'Congratulations! Your onboarding is complete. Welcome aboard!',
                    type: 'onboarding_completed',
                    userId: user._id,
                    userName: user.fullName,
                    recipientType: 'user',
                    category: 'system',
                    priority: 'high',
                    navigationData: { page: 'dashboard' },
                    metadata: { type: 'ONBOARDING_COMPLETED' }
                });
            } catch (e) {
                console.error('[Onboarding] Completion notification failed:', e.message);
            }
        });

        return res.json({ message: 'Onboarding completed.', onboarding: user.onboarding });
    } catch (err) {
        console.error('[Onboarding] completeProfile error:', err);
        res.status(500).json({ error: 'Failed to complete onboarding.' });
    }
};

// ─── Admin Endpoints ──────────────────────────────────────────────────────────

// GET /api/onboarding/admin/compliance — paginated compliance table
exports.getComplianceDashboard = async (req, res) => {
    try {
        if (!['Admin', 'HR'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 25;
        const skip = (page - 1) * limit;

        // Filters
        const filter = {};
        const requestedStatus = req.query.status;
        if (requestedStatus && requestedStatus !== 'incomplete') filter.status = requestedStatus;
        if (req.query.department) filter.department = req.query.department;
        if (req.query.policyVersion) filter.policyVersion = req.query.policyVersion;
        if (req.query.startDate && req.query.endDate) {
            filter.createdAt = {
                $gte: new Date(req.query.startDate),
                $lte: new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999))
            };
        }

        const [logs, total] = await Promise.all([
            PolicyAcceptanceLog.find(filter)
                .populate('userId', 'fullName employeeCode department joiningDate onboarding personalDetails identityDetails')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            PolicyAcceptanceLog.countDocuments(filter)
        ]);

        let enrichedLogs = logs.map((log) => ({
            ...log,
            displayStatus: resolveComplianceDisplayStatus(log, log.userId),
        }));

        if (requestedStatus === 'incomplete') {
            enrichedLogs = enrichedLogs.filter((log) => log.displayStatus === 'incomplete');
        }

        const responseTotal = requestedStatus === 'incomplete' ? enrichedLogs.length : total;

        return res.json({
            logs: enrichedLogs,
            total: responseTotal,
            page,
            totalPages: Math.ceil(responseTotal / limit),
        });
    } catch (err) {
        console.error('[Onboarding Admin] getComplianceDashboard error:', err);
        res.status(500).json({ error: 'Failed to fetch compliance data.' });
    }
};

// GET /api/onboarding/admin/compliance/:userId/timeline — per-employee timeline
exports.getEmployeeTimeline = async (req, res) => {
    try {
        if (!['Admin', 'HR'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { userId } = req.params;

        const [user, log] = await Promise.all([
            User.findById(userId)
                .select('fullName employeeCode department joiningDate onboarding personalDetails identityDetails createdAt')
                .lean(),
            PolicyAcceptanceLog.findOne({ userId })
                .populate('policyId', 'name version isMandatoryOnboarding')
                .sort({ createdAt: -1 })
                .lean()
        ]);

        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Build enriched timeline
        const timeline = [];

        if (user.createdAt) {
            timeline.push({ event: 'account_created', timestamp: user.createdAt, notes: 'Account created' });
        }

        if (log) {
            log.timeline?.forEach(t => timeline.push(t));
        }

        timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const profileEval = evaluateProfileCompletion(user);

        return res.json({
            user,
            log: log || null,
            timeline,
            profileCompleted: profileEval.profileCompleted,
            profileFilledCount: profileEval.profileFilledCount,
            profileFieldsTotal: profileEval.profileFieldsTotal,
        });
    } catch (err) {
        console.error('[Onboarding Admin] getEmployeeTimeline error:', err);
        res.status(500).json({ error: 'Failed to fetch employee timeline.' });
    }
};

// GET /api/onboarding/admin/compliance/export — download compliance report
exports.exportComplianceReport = async (req, res) => {
    try {
        if (!['Admin', 'HR'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { format = 'json', startDate, endDate, status, department } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (department) filter.department = department;
        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
            };
        }

        const logs = await PolicyAcceptanceLog.find(filter)
            .populate('userId', 'fullName employeeCode department joiningDate onboarding personalDetails identityDetails')
            .sort({ createdAt: -1 })
            .lean();

        const rows = logs.map(l => ({
            Employee: l.userName,
            'Employee Code': l.employeeCode,
            Department: l.department || l.userId?.department || '',
            Joined: l.userId?.joiningDate ? new Date(l.userId.joiningDate).toLocaleDateString() : '',
            'Policy Name': l.policyName,
            'Policy Version': l.policyVersion,
            'Policy Accepted': l.accepted ? 'Yes' : 'No',
            'Accepted At': l.acceptedAt ? new Date(l.acceptedAt).toLocaleString() : '',
            'Tour Completed': l.timeline?.some(t => t.event === 'tour_completed') ? 'Yes' : 'No',
            'Profile Completed': evaluateProfileCompletion(l.userId || {}).profileCompleted ? 'Yes' : 'No',
            'Status': resolveComplianceDisplayStatus(l, l.userId),
            'Reading Time (s)': l.readingDurationSeconds || 0,
            'IP Address': l.ipAddress || '',
            'Browser': l.browser || '',
            'Device': l.deviceType || '',
            'Profile Deadline': l.profileDeadline ? new Date(l.profileDeadline).toLocaleDateString() : '',
            'Completed At': l.onboardingCompletedAt ? new Date(l.onboardingCompletedAt).toLocaleString() : '',
            'Overdue': l.profileDeadline && !l.onboardingCompletedAt && new Date() > new Date(l.profileDeadline) ? 'Yes' : 'No',
        }));

        if (format === 'csv') {
            const headers = Object.keys(rows[0] || {});
            const csvHeader = headers.map(h => `"${h}"`).join(',') + '\n';
            const csvRows = rows.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="compliance_report.csv"');
            return res.send(csvHeader + csvRows);
        }

        return res.json({ total: rows.length, rows });
    } catch (err) {
        console.error('[Onboarding Admin] exportComplianceReport error:', err);
        res.status(500).json({ error: 'Failed to export compliance report.' });
    }
};

// POST /api/onboarding/admin/policy/:policyId/set-mandatory
// Admin marks exactly one policy as the mandatory onboarding policy
exports.setMandatoryPolicy = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can set mandatory onboarding policies.' });
        }

        const { policyId } = req.params;
        const { wordCount, onboardingExpiryDays } = req.body;

        // Unset all others first
        await Policy.updateMany(
            { isMandatoryOnboarding: true },
            { $set: { isMandatoryOnboarding: false } }
        );

        const policy = await Policy.findByIdAndUpdate(
            policyId,
            {
                $set: {
                    isMandatoryOnboarding: true,
                    wordCount: wordCount || null,
                    onboardingExpiryDays: onboardingExpiryDays || 7,
                }
            },
            { new: true }
        );

        if (!policy) return res.status(404).json({ error: 'Policy not found.' });

        return res.json({ message: 'Mandatory onboarding policy updated.', policy });
    } catch (err) {
        console.error('[Onboarding Admin] setMandatoryPolicy error:', err);
        res.status(500).json({ error: 'Failed to update mandatory policy.' });
    }
};

// POST /api/onboarding/admin/policy/:policyId/unset-mandatory
exports.unsetMandatoryPolicy = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can change mandatory onboarding policy settings.' });
        }

        const policy = await Policy.findByIdAndUpdate(
            req.params.policyId,
            { $set: { isMandatoryOnboarding: false } },
            { new: true }
        );

        if (!policy) return res.status(404).json({ error: 'Policy not found.' });
        return res.json({ message: 'Policy unmarked as mandatory onboarding.', policy });
    } catch (err) {
        console.error('[Onboarding Admin] unsetMandatoryPolicy error:', err);
        res.status(500).json({ error: 'Failed to unset mandatory policy.' });
    }
};

// POST /api/onboarding/admin/force/:userId — Force an existing employee through onboarding
exports.forceOnboarding = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can force onboarding.' });
        }

        const { userId } = req.params;
        const adminId = req.user.userId;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        user.onboarding = {
            completed: false,
            firstLoginCompleted: false,
            policyAccepted: false,
            policyAcceptedAt: null,
            policyVersionAccepted: null,
            tourCompleted: false,
            tourCompletedAt: null,
            profileCompletionDeadline: deadline,
            profileCompleted: false,
            profileCompletedAt: null,
            inductionExpiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            forcedOnboardingBy: adminId,
            forcedOnboardingAt: new Date(),
        };

        await user.save();
        cacheService.invalidateUser(user._id.toString());

        // Create a fresh log for the forced onboarding
        const mandatoryPolicy = await Policy.findOne({ isMandatoryOnboarding: true, status: 'Active' }).lean();
        if (mandatoryPolicy) {
            const log = await PolicyAcceptanceLog.create({
                userId: user._id,
                userName: user.fullName,
                employeeCode: user.employeeCode,
                department: user.department || '',
                policyId: mandatoryPolicy._id,
                policyName: mandatoryPolicy.name,
                policyVersion: mandatoryPolicy.version,
                minimumReadingSeconds: calcMinReadSeconds(mandatoryPolicy.wordCount),
                profileDeadline: deadline,
                status: 'in_progress',
                timeline: [{
                    event: 'forced_by_admin',
                    timestamp: new Date(),
                    notes: `Onboarding reset by admin (${adminId})`
                }]
            });
            user.onboarding.policyAcceptanceLogId = log._id;
            await user.save();
            cacheService.invalidateUser(user._id.toString());
        }

        return res.json({ message: 'Onboarding forced for employee.', onboarding: user.onboarding });
    } catch (err) {
        console.error('[Onboarding Admin] forceOnboarding error:', err);
        res.status(500).json({ error: 'Failed to force onboarding.' });
    }
};

// ─── New Dynamic Policy Assignment Endpoints ──────────────────────────────────

// POST /api/onboarding/admin/assign-policy-to-users
// Assign a mandatory policy to specific users (without forcing full onboarding)
exports.assignPolicyToUsers = async (req, res) => {
    try {
        if (!['Admin', 'HR'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { userIds, policyId, deadline } = req.body;

        if (!policyId || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'policyId and userIds array are required.' });
        }

        const policy = await Policy.findOne({ _id: policyId, status: 'Active' }).lean();
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found or inactive.' });
        }

        const assignmentDeadline = deadline 
            ? new Date(deadline) 
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const results = {
            success: [],
            alreadyAccepted: [],
            failed: []
        };

        for (const userId of userIds) {
            try {
                const user = await User.findById(userId).select('fullName employeeCode department').lean();
                if (!user) {
                    results.failed.push({ userId, reason: 'User not found' });
                    continue;
                }

                // Check if user already accepted this policy version
                const existingLog = await PolicyAcceptanceLog.findOne({
                    userId: userId,
                    policyId: policy._id,
                    policyVersion: policy.version,
                    accepted: true
                }).lean();

                if (existingLog) {
                    results.alreadyAccepted.push({ userId, userName: user.fullName });
                    continue;
                }

                // Check for pending log with same policy
                const pendingLog = await PolicyAcceptanceLog.findOne({
                    userId: userId,
                    policyId: policy._id,
                    accepted: false
                });

                if (pendingLog) {
                    // Update existing pending log with new deadline
                    pendingLog.profileDeadline = assignmentDeadline;
                    pendingLog.policyVersion = policy.version;
                    pendingLog.policyName = policy.name;
                    pendingLog.timeline.push({
                        event: 'policy_reassigned',
                        timestamp: new Date(),
                        notes: `Policy reassigned by ${req.user.role} (deadline updated)`
                    });
                    await pendingLog.save();
                    results.success.push({ userId, userName: user.fullName, status: 'updated' });
                } else {
                    // Create new policy acceptance log
                    await PolicyAcceptanceLog.create({
                        userId: userId,
                        userName: user.fullName,
                        employeeCode: user.employeeCode,
                        department: user.department || '',
                        policyId: policy._id,
                        policyName: policy.name,
                        policyVersion: policy.version,
                        minimumReadingSeconds: calcMinReadSeconds(policy.wordCount),
                        profileDeadline: assignmentDeadline,
                        status: 'pending',
                        timeline: [{
                            event: 'policy_assigned',
                            timestamp: new Date(),
                            notes: `Policy assigned by ${req.user.role}`
                        }]
                    });
                    results.success.push({ userId, userName: user.fullName, status: 'assigned' });
                }

                // Send notification to user
                setImmediate(async () => {
                    try {
                        await NewNotificationService.createAndEmitNotification({
                            message: `New policy "${policy.name}" requires your acknowledgement. Please review and accept it.`,
                            type: 'policy_assignment',
                            userId: userId,
                            userName: user.fullName,
                            recipientType: 'user',
                            category: 'compliance',
                            priority: 'high',
                            navigationData: { page: 'policy-acknowledgement' },
                            metadata: { 
                                type: 'POLICY_ASSIGNMENT',
                                policyId: policy._id,
                                policyName: policy.name
                            }
                        });
                    } catch (e) {
                        console.error('[Policy Assignment] Notification failed:', e.message);
                    }
                });

            } catch (err) {
                console.error(`[Policy Assignment] Failed for user ${userId}:`, err);
                results.failed.push({ userId, reason: err.message });
            }
        }

        return res.json({
            message: 'Policy assignment completed.',
            results
        });
    } catch (err) {
        console.error('[Onboarding Admin] assignPolicyToUsers error:', err);
        res.status(500).json({ error: 'Failed to assign policy to users.' });
    }
};

// POST /api/onboarding/admin/assign-policy-to-all
// Assign a mandatory policy to all active employees
exports.assignPolicyToAll = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only admins can assign policies to all employees.' });
        }

        const { policyId, deadline, excludeUserIds = [] } = req.body;

        if (!policyId) {
            return res.status(400).json({ error: 'policyId is required.' });
        }

        const policy = await Policy.findOne({ _id: policyId, status: 'Active' }).lean();
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found or inactive.' });
        }

        // Get all active employees (excluding Admin and HR)
        const users = await User.find({
            isActive: true,
            role: { $in: ['Employee', 'Intern'] },
            _id: { $nin: excludeUserIds }
        }).select('_id fullName employeeCode department').lean();

        const userIds = users.map(u => u._id.toString());

        // Reuse the assignPolicyToUsers logic
        req.body.userIds = userIds;
        return exports.assignPolicyToUsers(req, res);

    } catch (err) {
        console.error('[Onboarding Admin] assignPolicyToAll error:', err);
        res.status(500).json({ error: 'Failed to assign policy to all employees.' });
    }
};

// GET /api/onboarding/pending-policies
// Get all pending policy acknowledgements for the current user
exports.getPendingPolicies = async (req, res) => {
    try {
        const userId = req.user.userId;

        const pendingLogs = await PolicyAcceptanceLog.find({
            userId: userId,
            accepted: false
        })
        .populate('policyId', 'name version wordCount effectiveFrom')
        .sort({ createdAt: -1 })
        .lean();

        return res.json({
            pendingPolicies: pendingLogs.map(log => ({
                logId: log._id,
                policyId: log.policyId?._id || log.policyId,
                policyName: log.policyName,
                policyVersion: log.policyVersion,
                deadline: log.profileDeadline,
                assignedAt: log.createdAt,
                policy: log.policyId
            }))
        });
    } catch (err) {
        console.error('[Onboarding] getPendingPolicies error:', err);
        res.status(500).json({ error: 'Failed to fetch pending policies.' });
    }
};

// POST /api/onboarding/policy/standalone-accept
// Accept a policy that was assigned outside of the onboarding flow
exports.standaloneAcceptPolicy = async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            logId,
            policyId,
            policyVersion,
            checkboxAcknowledged,
            readingDurationSeconds,
            scrolledToBottom,
        } = req.body;

        if (!logId || !policyId || !policyVersion) {
            return res.status(400).json({ error: 'logId, policyId, and policyVersion are required.' });
        }

        if (!checkboxAcknowledged) {
            return res.status(400).json({ error: 'You must acknowledge the checkbox to accept.' });
        }

        const log = await PolicyAcceptanceLog.findOne({
            _id: logId,
            userId: userId,
            policyId: policyId
        });

        if (!log) {
            return res.status(404).json({ error: 'Policy acceptance record not found.' });
        }

        if (log.accepted) {
            return res.json({ message: 'Policy already accepted.', log });
        }

        // Verify the policy is still active
        const policy = await Policy.findOne({
            _id: policyId,
            status: 'Active'
        }).lean();

        if (!policy) {
            return res.status(400).json({ error: 'Policy not found or inactive.' });
        }

        if (policy.version !== policyVersion) {
            return res.status(400).json({ error: 'Policy version mismatch. Please reload and try again.' });
        }

        if (!scrolledToBottom) {
            return res.status(400).json({ error: 'You must scroll to the bottom of the policy before accepting.' });
        }

        const minSeconds = 60;
        if (!readingDurationSeconds || readingDurationSeconds < minSeconds) {
            return res.status(400).json({
                error: `Minimum reading time not met. Required: ${minSeconds}s, Recorded: ${readingDurationSeconds || 0}s.`
            });
        }

        const now = new Date();
        const ip = req.ip || req.connection?.remoteAddress || '';
        const ua = req.headers['user-agent'] || '';
        const { device, browser } = parseUA(ua);

        log.readingCompletedAt = now;
        log.readingDurationSeconds = readingDurationSeconds;
        log.scrolledToBottom = scrolledToBottom;
        log.accepted = true;
        log.acceptedAt = now;
        log.checkboxAcknowledged = checkboxAcknowledged;
        log.ipAddress = ip;
        log.userAgent = ua;
        log.deviceType = device;
        log.browser = browser;
        log.status = 'completed';

        log.timeline.push(
            {
                event: 'reading_completed',
                timestamp: now,
                notes: `Reading time: ${readingDurationSeconds}s`
            },
            {
                event: 'policy_accepted',
                timestamp: now,
                notes: `Accepted from ${ip} via ${browser}`
            }
        );

        await log.save();

        // Send confirmation notification
        setImmediate(async () => {
            try {
                const user = await User.findById(userId).select('fullName').lean();
                await NewNotificationService.createAndEmitNotification({
                    message: `You have successfully acknowledged the policy "${policy.name}".`,
                    type: 'policy_accepted',
                    userId: userId,
                    userName: user?.fullName || '',
                    recipientType: 'user',
                    category: 'compliance',
                    priority: 'medium',
                    navigationData: { page: 'dashboard' },
                    metadata: { 
                        type: 'POLICY_ACCEPTED',
                        policyId: policy._id,
                        policyName: policy.name
                    }
                });
            } catch (e) {
                console.error('[Policy Acceptance] Notification failed:', e.message);
            }
        });

        return res.json({ 
            message: 'Policy accepted successfully.', 
            log 
        });
    } catch (err) {
        console.error('[Onboarding] standaloneAcceptPolicy error:', err);
        res.status(500).json({ error: 'Failed to accept policy.' });
    }
};

// POST /api/onboarding/policy/standalone-start-reading
// Record reading start for standalone policy acknowledgement
exports.standaloneStartReading = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { logId } = req.body;

        if (!logId) {
            return res.status(400).json({ error: 'logId is required.' });
        }

        const log = await PolicyAcceptanceLog.findOne({
            _id: logId,
            userId: userId
        });

        if (!log) {
            return res.status(404).json({ error: 'Policy acceptance record not found.' });
        }

        if (!log.readingStartedAt) {
            log.readingStartedAt = new Date();
            log.status = 'in_progress';
            log.timeline.push({
                event: 'reading_started',
                timestamp: new Date(),
                notes: 'Employee opened policy document (standalone)'
            });
            await log.save();
        }

        return res.json({ message: 'Reading started.' });
    } catch (err) {
        console.error('[Onboarding] standaloneStartReading error:', err);
        res.status(500).json({ error: 'Failed to record reading start.' });
    }
};
