const yearEventEmitter = require('./yearEventEmitter');

// Import cache service (will be created in next task)
let activeYearCache;
try {
    activeYearCache = require('./activeYearCache');
} catch (error) {
    console.warn('[AttendanceSync] activeYearCache not yet available');
}

/**
 * Attendance Synchronization Service
 * 
 * Listens to active year change events and synchronizes dependent systems
 */

// Subscribe to active year change events
yearEventEmitter.on('activeYearChanged', async (payload) => {
    const { previousYear, newYear, timestamp } = payload;
    
    console.log('[AttendanceSync] Active year changed:', {
        from: previousYear,
        to: newYear,
        at: timestamp
    });
    
    try {
        // Invalidate active year cache
        if (activeYearCache) {
            activeYearCache.invalidate();
            console.log('[AttendanceSync] ✓ Active year cache invalidated');
        }
        
        // Additional synchronization tasks can be added here:
        // - Trigger attendance recalculation
        // - Update employee leave balances
        // - Notify connected clients via WebSocket
        // - Clear related caches
        
        console.log('[AttendanceSync] ✓ Synchronization completed');
    } catch (error) {
        console.error('[AttendanceSync] ✗ Error during synchronization:', error);
    }
});

// Log when the service is initialized
console.log('[AttendanceSync] Service initialized and listening for active year changes');

module.exports = {
    // Export for testing purposes
    handleActiveYearChange: (payload) => {
        yearEventEmitter.emit('activeYearChanged', payload);
    }
};
