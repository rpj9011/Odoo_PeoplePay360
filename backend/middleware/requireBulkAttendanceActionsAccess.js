const User = require('../models/User');

/**
 * Bulk attendance actions (live refresh, end breaks) for Admin and delegated staff.
 * Admin always has access; others need featurePermissions.canManageBulkAttendanceActions.
 */
async function requireBulkAttendanceActionsAccess(req, res, next) {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        if (req.user.role === 'Admin') {
            return next();
        }

        const dbUser = await User.findById(req.user.userId)
            .select('featurePermissions isActive role')
            .lean();

        if (!dbUser || dbUser.isActive === false) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (dbUser.featurePermissions?.canManageBulkAttendanceActions === true) {
            return next();
        }

        return res.status(403).json({
            error: 'Access denied. Bulk attendance actions are not enabled for your account.',
        });
    } catch (error) {
        console.error('[requireBulkAttendanceActionsAccess] Error:', error.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

module.exports = requireBulkAttendanceActionsAccess;
