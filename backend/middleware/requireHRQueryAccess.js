const User = require('../models/User');

/**
 * HR Query management access for delegated employees.
 * Admin/HR already have full access and are excluded here.
 */
async function requireHRQueryAccess(req, res, next) {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        // Admin and HR always have access
        if (['Admin', 'HR'].includes(req.user.role)) {
            return next();
        }

        // Check delegated access for other users
        const dbUser = await User.findById(req.user.userId)
            .select('featurePermissions role isActive')
            .lean();

        if (!dbUser || dbUser.isActive === false) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        if (dbUser.featurePermissions?.canManageHRQueries === true) {
            return next();
        }

        return res.status(403).json({ error: 'Access denied. HR Query management access is not enabled for your account.' });
    } catch (error) {
        console.error('[requireHRQueryAccess] Error:', error.message);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}

module.exports = requireHRQueryAccess;
