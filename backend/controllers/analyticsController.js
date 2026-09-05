/**
 * ANALYTICS CONTROLLER
 * 
 * Handles HTTP requests for attendance analytics.
 * Provides comprehensive workforce attendance insights with filtering and pagination.
 * 
 * Endpoints:
 * - GET /api/analytics/attendance - Get attendance analytics with filters
 */

const AnalyticsService = require('../services/AnalyticsService');
const analyticsCacheService = require('../services/analyticsCacheService');

/**
 * GET /api/analytics/attendance
 * 
 * Get attendance analytics with optional filters
 * 
 * Query Parameters:
 * - startDate: string (YYYY-MM-DD, required)
 * - endDate: string (YYYY-MM-DD, required)
 * - department: string (optional)
 * - location: string (optional)
 * - shiftType: string (optional, 'Fixed' | 'Flexible')
 * - employmentStatus: string (optional, 'Active' | 'Inactive')
 * - search: string (optional, search by employee name or code)
 * - page: number (optional, default: 1)
 * - limit: number (optional, default: 50, max: 1000)
 * 
 * Response:
 * {
 *   summary: SummaryMetrics,
 *   employeeAnalytics: EmployeeMetrics[],
 *   pagination: PaginationInfo
 * }
 */
async function getAttendanceAnalytics(req, res) {
    try {
        // Extract query parameters
        const {
            startDate,
            endDate,
            department,
            location,
            shiftType,
            employmentStatus,
            search,
            page,
            limit
        } = req.query;
        
        console.log('[analyticsController] Received query params:', { startDate, endDate, department, location, shiftType, employmentStatus, search, page, limit });
        
        // Validate required parameters
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }
        
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid start date format. Use YYYY-MM-DD'
            });
        }
        if (!dateRegex.test(endDate)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid end date format. Use YYYY-MM-DD'
            });
        }
        
        // Validate date range
        if (startDate > endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date must be before or equal to end date'
            });
        }
        
        // Validate shift type if provided
        if (shiftType && !['Fixed', 'Flexible'].includes(shiftType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid shift type. Must be "Fixed" or "Flexible"'
            });
        }
        
        // Validate employment status if provided
        if (employmentStatus && !['Active', 'Inactive'].includes(employmentStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employment status. Must be "Active" or "Inactive"'
            });
        }
        
        // Validate pagination parameters
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 50;
        
        if (pageNum < 1) {
            return res.status(400).json({
                success: false,
                message: 'Page number must be greater than 0'
            });
        }
        
        if (limitNum < 1 || limitNum > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be between 1 and 1000'
            });
        }
        
        // Build filters object
        const filters = {
            startDate,
            endDate,
            page: pageNum,
            limit: limitNum
        };
        
        if (department) filters.department = department;
        if (location) filters.location = location;
        if (shiftType) filters.shiftType = shiftType;
        if (employmentStatus) filters.employmentStatus = employmentStatus;
        if (search) filters.search = search;
        
        // CHECK CACHE FIRST
        const cachedResult = await analyticsCacheService.getCachedAnalytics(filters);
        if (cachedResult) {
            console.log('[analyticsController] ✅ Returning cached analytics');
            return res.status(200).json({
                success: true,
                data: cachedResult,
                cached: true
            });
        }
        
        // Call analytics service
        const result = await AnalyticsService.calculateAttendanceMetrics(filters);
        
        // STORE IN CACHE after computing (TTL: 5 minutes = 300 seconds)
        await analyticsCacheService.setCachedAnalytics(filters, result, 300);
        
        // Return success response
        return res.status(200).json({
            success: true,
            data: result,
            cached: false
        });
        
    } catch (error) {
        console.error('[analyticsController.getAttendanceAnalytics] Error:', error);
        
        // Handle specific error types
        if (error.message.includes('date')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        
        // Handle database errors
        if (error.name === 'MongoError' || error.name === 'MongooseError') {
            return res.status(500).json({
                success: false,
                message: 'Internal server error while calculating metrics'
            });
        }
        
        // Handle timeout errors
        if (error.name === 'MongoTimeoutError') {
            return res.status(504).json({
                success: false,
                message: 'Request timeout. Try reducing date range or applying more filters'
            });
        }
        
        // Generic error response
        return res.status(500).json({
            success: false,
            message: 'An error occurred while calculating attendance analytics'
        });
    }
}

/**
 * POST /api/analytics/cache/clear
 * 
 * Clear analytics cache
 * 
 * Access: Admin only
 */
async function clearAnalyticsCache(req, res) {
    try {
        await analyticsCacheService.clearAnalyticsCache();
        return res.status(200).json({
            success: true,
            message: 'Analytics cache cleared successfully'
        });
    } catch (error) {
        console.error('[analyticsController.clearAnalyticsCache] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to clear analytics cache'
        });
    }
}

/**
 * GET /api/analytics/cache/stats
 * 
 * Get cache statistics
 * 
 * Access: Admin only
 */
async function getCacheStats(req, res) {
    try {
        const stats = await analyticsCacheService.getCacheStats();
        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('[analyticsController.getCacheStats] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get cache statistics'
        });
    }
}

module.exports = {
    getAttendanceAnalytics,
    clearAnalyticsCache,
    getCacheStats
};
