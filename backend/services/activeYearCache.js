const NodeCache = require('node-cache');
const LeaveYear = require('../models/LeaveYear');

/**
 * Active Year Cache Service
 * 
 * Caches the active leave year to reduce database queries
 * TTL: 1 hour (3600 seconds)
 */

class ActiveYearCache {
    constructor() {
        // Initialize cache with 1-hour TTL
        this.cache = new NodeCache({ 
            stdTTL: 3600, // 1 hour
            checkperiod: 600 // Check for expired keys every 10 minutes
        });
        
        this.CACHE_KEY = 'active-year';
        
        console.log('[ActiveYearCache] Service initialized with 1-hour TTL');
    }

    /**
     * Get the active year from cache or database
     * @returns {Promise<Object|null>} The active year document or null
     */
    async getActiveYear() {
        try {
            // Try to get from cache first
            const cached = this.cache.get(this.CACHE_KEY);
            
            if (cached) {
                console.log('[ActiveYearCache] Cache HIT for active year');
                return cached;
            }
            
            console.log('[ActiveYearCache] Cache MISS for active year - fetching from database');
            
            // Fetch from database
            const activeYear = await LeaveYear.findOne({ isActive: true }).lean();
            
            if (activeYear) {
                // Store in cache
                this.cache.set(this.CACHE_KEY, activeYear);
                console.log(`[ActiveYearCache] Cached active year: ${activeYear.year}`);
            } else {
                console.warn('[ActiveYearCache] No active year found in database');
            }
            
            return activeYear;
        } catch (error) {
            console.error('[ActiveYearCache] Error fetching active year:', error);
            throw error;
        }
    }

    /**
     * Invalidate the active year cache
     * Called when the active year changes
     */
    invalidate() {
        const deleted = this.cache.del(this.CACHE_KEY);
        
        if (deleted > 0) {
            console.log('[ActiveYearCache] Cache invalidated');
        } else {
            console.log('[ActiveYearCache] Cache was already empty');
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        const stats = this.cache.getStats();
        return {
            keys: stats.keys,
            hits: stats.hits,
            misses: stats.misses,
            hitRate: stats.hits / (stats.hits + stats.misses) || 0
        };
    }

    /**
     * Warm up the cache by pre-loading the active year
     */
    async warmUp() {
        console.log('[ActiveYearCache] Warming up cache...');
        try {
            await this.getActiveYear();
            console.log('[ActiveYearCache] ✓ Cache warmed up successfully');
        } catch (error) {
            console.error('[ActiveYearCache] ✗ Failed to warm up cache:', error);
        }
    }
}

// Export a singleton instance
const activeYearCache = new ActiveYearCache();

module.exports = activeYearCache;
