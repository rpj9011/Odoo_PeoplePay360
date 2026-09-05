// backend/utils/cache.js
// Simple in-memory cache with TTL support
// Safe for production use with automatic expiration

class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.timers = new Map();
    }

    /**
     * Get a value from cache
     * @param {string} key - Cache key
     * @returns {any|null} - Cached value or null if not found/expired
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            return null;
        }

        // Check if expired
        if (Date.now() > item.expiresAt) {
            this.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * Set a value in cache with TTL
     * @param {string} key - Cache key
     * @param {any} value - Value to cache
     * @param {number} ttlMs - Time to live in milliseconds
     */
    set(key, value, ttlMs = 30000) {
        // Clear existing timer if any
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        const expiresAt = Date.now() + ttlMs;
        this.cache.set(key, { value, expiresAt });

        // Set timer to auto-delete after TTL
        const timer = setTimeout(() => {
            this.delete(key);
        }, ttlMs);
        this.timers.set(key, timer);
    }

    /**
     * Delete a value from cache
     * @param {string} key - Cache key
     */
    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
        this.cache.delete(key);
    }

    /**
     * Delete multiple keys matching a pattern
     * @param {string} pattern - Pattern to match (supports wildcard *)
     */
    deletePattern(pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const keysToDelete = [];
        
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.delete(key));
    }

    /**
     * Clear all cache
     */
    clear() {
        // Clear all timers
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.cache.clear();
    }

    /**
     * Get cache statistics
     * @returns {Object} - Cache stats
     */
    getStats() {
        let expiredCount = 0;
        const now = Date.now();
        
        for (const item of this.cache.values()) {
            if (now > item.expiresAt) {
                expiredCount++;
            }
        }

        return {
            size: this.cache.size,
            expired: expiredCount,
            active: this.cache.size - expiredCount
        };
    }
}

// Singleton instance
const cache = new SimpleCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
    const stats = cache.getStats();
    if (stats.expired > 0) {
        // Cleanup expired entries
        const now = Date.now();
        const keysToDelete = [];
        
        for (const [key, item] of cache.cache.entries()) {
            if (now > item.expiresAt) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => cache.delete(key));
    }
}, 5 * 60 * 1000); // Every 5 minutes

module.exports = cache;



