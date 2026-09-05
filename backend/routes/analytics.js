/**
 * ANALYTICS ROUTES
 * 
 * API routes for attendance analytics endpoints.
 * Restricted to Admin and HR roles only.
 */

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const employeeAnalyticsController = require('../controllers/employeeAnalyticsController');
const analyticsExportController = require('../controllers/analyticsExportController');
const authenticateToken = require('../middleware/authenticateToken');

/**
 * Middleware to check if user has analytics access
 * Only Admin and HR roles can access analytics
 */
function requireAnalyticsAccess(req, res, next) {
    const user = req.user;
    
    if (!user) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    
    // Check if user has Admin or HR role
    if (user.role === 'Admin' || user.role === 'HR') {
        return next();
    }
    
    // Check if user has analytics permission flag
    if (user.featurePermissions && user.featurePermissions.canViewAnalytics) {
        return next();
    }
    
    return res.status(403).json({
        success: false,
        message: 'Access denied. Analytics access requires Admin or HR role'
    });
}

/**
 * GET /api/analytics/attendance
 * Get attendance analytics with filters
 * 
 * Access: Admin, HR, or users with canViewAnalytics permission
 */
router.get(
    '/attendance',
    authenticateToken,
    requireAnalyticsAccess,
    analyticsController.getAttendanceAnalytics
);

/**
 * GET /api/analytics/employee/:employeeId
 * Get detailed analytics for a single employee
 * 
 * Query params:
 * - month: MM (01-12)
 * - year: YYYY
 * 
 * Access: Admin, HR, or users with canViewAnalytics permission
 */
router.get(
    '/employee/:employeeId',
    authenticateToken,
    requireAnalyticsAccess,
    employeeAnalyticsController.getEmployeeDetailedAnalytics
);

/**
 * GET /api/analytics/export/employee/:employeeId
 * Export employee analytics to Excel, CSV, or PDF format
 * 
 * Query params:
 * - month: MM (01-12)
 * - year: YYYY
 * - format: xlsx | csv | pdf (default: xlsx)
 * 
 * Access: Admin, HR, or users with canViewAnalytics permission
 */
router.get(
    '/export/employee/:employeeId',
    authenticateToken,
    requireAnalyticsAccess,
    analyticsExportController.exportEmployeeAnalytics
);

/**
 * POST /api/analytics/cache/clear
 * Clear analytics cache
 * 
 * Access: Admin only
 */
router.post(
    '/cache/clear',
    authenticateToken,
    (req, res, next) => {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required'
            });
        }
        next();
    },
    analyticsController.clearAnalyticsCache
);

/**
 * GET /api/analytics/cache/stats
 * Get cache statistics
 * 
 * Access: Admin only
 */
router.get(
    '/cache/stats',
    authenticateToken,
    (req, res, next) => {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required'
            });
        }
        next();
    },
    analyticsController.getCacheStats
);

module.exports = router;
