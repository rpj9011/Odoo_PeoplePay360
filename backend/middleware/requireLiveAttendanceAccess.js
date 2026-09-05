const User = require('../models/User');

/**
 * View-only live attendance access for delegated employees.
 * Admin/HR already have the full dashboard and are excluded here.
 */
async function requireLiveAttendanceAccess(req, res, next) {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (['Admin', 'HR'].includes(req.user.role)) {
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
