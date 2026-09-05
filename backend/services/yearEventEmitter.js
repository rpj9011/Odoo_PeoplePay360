const EventEmitter = require('events');

class YearEventEmitter extends EventEmitter {
    /**
     * Emit an event when the active year changes
     * @param {number|null} previousYear - The previous active year number (or null if none)
     * @param {number} newYear - The newly activated year number
     */
    emitActiveYearChanged(previousYear, newYear) {
        const payload = {
            previousYear,
            newYear,
            timestamp: new Date()
        };
        
        console.log('[YearEventEmitter] Emitting activeYearChanged event:', payload);
        this.emit('activeYearChanged', payload);
    }
}

// Export a singleton instance
const yearEventEmitter = new YearEventEmitter();

module.exports = yearEventEmitter;
