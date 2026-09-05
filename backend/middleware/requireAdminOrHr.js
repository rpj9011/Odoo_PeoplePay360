// backend/middleware/requireAdminOrHr.js
// Shared Admin/HR role-check middleware.
// Used at router-mount level in server.js and in route files that need it.
// Requires authenticateToken to have run first (req.user must be populated).
//
// MIGRATION NOTE (2026): 'HR' role has been split into HRManager / HRPayrollUser /
// HRPayrollManager.  This middleware grants access to the entire HR_FAMILY so that
// all existing Employees/Attendance/Leave/Document routes keep working unchanged.

const User = require('../models/User');
const { HR_FAMILY } = require('../config/roles');

const isAdminOrHr = async (req, res, next) => {
    // Check if req.user exists (authenticateToken must run first)
    if (!req.user) {
        console.error('[isAdminOrHr] req.user is missing - authentication may have failed');
        return res.status(401).json({ error: 'Authentication required. Please log in again.' });
    }

    // Prefer role from JWT payload; fallback to DB only when the claim is absent
    let userRole = req.user.role;

    if (!userRole && req.user.userId) {
        try {
            const dbUser = await User.findById(req.user.userId).select('role').lean();
            if (dbUser && dbUser.role) {
                userRole = dbUser.role;
                req.user.role = userRole;
                if (process.env.NODE_ENV !== 'production') {
                    console.log('[isAdminOrHr] Fetched role from database:', userRole);
                }
            }
        } catch (error) {
            console.error('[isAdminOrHr] Error fetching user role from database:', error);
        }
    }

    if (!userRole) {
        console.error('[isAdminOrHr] req.user.role is missing for user:', req.user.userId || req.user.email);
        return res.status(403).json({ error: 'User role not found. Please contact administrator.' });
    }

    const normalizedRole = String(userRole).trim();
    if (!HR_FAMILY.includes(normalizedRole)) {
        console.warn('[isAdminOrHr] Access denied - User role:', normalizedRole, 'User ID:', req.user.userId || req.user.email);
        return res.status(403).json({ error: 'Access forbidden: Requires Admin or HR role.' });
    }

    next();
};

module.exports = isAdminOrHr;
