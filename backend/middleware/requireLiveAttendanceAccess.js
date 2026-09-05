const User = require('../models/User');
const { HR_FAMILY } = require('../config/roles');

/**
 * View-only live attendance access for delegated employees.
 * HR-family roles get the full admin dashboard and are EXCLUDED from this
 * live-board view (same behaviour as the old Admin/HR exclusion).
 */
async function requireLiveAttendanceAccess(req, res, next) {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // HR family (Admin, HRManager, HRPayrollUser, HRPayrollManager) use the
        // admin dashboard — they do not need the employee live-board view.
        if (HR_FAMILY.includes(req.user.role)) {
            return res.status(403).json({ error: 'This view is not available for admin users.' });
        }

        const dbUser = await User.findById(req.user.userId)
            .select('featurePermissions role isActive')
            .lean();

        if (!dbUser || dbUser.isActive === false) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (dbUser.featurePermissions?.canViewLiveAttendance === true) {
            return next();
        }

        return res.status(403).json({ error: 'Access denied. Live attendance access is not enabled for your account.' });
    } catch (error) {
        console.error('[requireLiveAttendanceAccess] Error:', error.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

module.exports = requireLiveAttendanceAccess;
