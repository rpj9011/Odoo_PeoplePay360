/**
 * ANALYTICS CACHE INVALIDATION MIDDLEWARE
 * 
 * Automatically clears analytics cache when attendance data is modified
 * 
 * Usage:
 * - Add to attendance update routes
 * - Ensures cache stays synchronized with database
 */

const AnalyticsCacheService = require('../services/analyticsCacheService');

/**
 * Middleware to clear analytics cache after attendance modifications
 * 
 * Should be used AFTER the route handler completes successfully
 */
function invalidateAnalyticsCache(req, res, next) {
    // Store original res.json to intercept successful responses
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
        // Only clear cache if response was successful
        if (res.statusCode >= 200 && res.statusCode < 300) {
            // Clear cache asynchronously (don't block response)
            AnalyticsCacheService.clearAnalyticsCache()
                .then(() => {
                    console.log('[analyticsCacheInvalidation] ✅ Cache cleared after attendance update');
                })
                .catch(error => {
                    console.error('[analyticsCacheInvalidation] ❌ Error clearing cache:', error);
                });
        }
        
        // Send original response
        return originalJson(data);
    };
    
    next();
}

/**
 * Middleware to clear cache for specific date range
 * 
 * Expects req.body.attendanceDate or req.body.date
 */
function invalidateCacheForDate(req, res, next) {
    const originalJson = res.json.bind(res);
    
    res.json = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            // Extract date from request
            const date = req.body.attendanceDate || req.body.date;
            
            if (date) {
                // Clear cache for the month containing this date
                const dateObj = new Date(date);
                const startDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1)
                    .toISOString().split('T')[0];
                const endDate = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0)
                    .toISOString().split('T')[0];
                
                AnalyticsCacheService.clearCacheForDateRange(startDate, endDate)
                    .then(() => {
                        console.log(`[analyticsCacheInvalidation] ✅ Cache cleared for ${startDate} to ${endDate}`);
                    })
                    .catch(error => {
                        console.error('[analyticsCacheInvalidation] ❌ Error clearing cache:', error);
                    });
            } else {
                // If no date specified, clear all cache
                AnalyticsCacheService.clearAnalyticsCache()
                    .catch(error => {
                        console.error('[analyticsCacheInvalidation] ❌ Error clearing cache:', error);
                    });
            }
        }
        
        return originalJson(data);
    };
    
    next();
}

module.exports = {
    invalidateAnalyticsCache,
    invalidateCacheForDate
};
