// backend/utils/holidayEngine.js
// Core utility functions for the Intelligent Holiday Engine

/**
 * Calculate day of week from date
 * @param {Date|String} date - Input date
 * @returns {String} - Day name (e.g., 'Monday')
 */
function calculateWeekday(date) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const d = new Date(date);
    return days[d.getDay()];
}

/**
 * Calculate fixed holiday date for target year
 * @param {Number} baseMonth - Month (1-12)
 * @param {Number} baseDate - Date (1-31)
 * @param {Number} targetYear - Target year
 * @returns {Date} - Calculated date
 */
function calculateFixedHolidayDate(baseMonth, baseDate, targetYear) {
    return new Date(targetYear, baseMonth - 1, baseDate);
}

/**
 * Validate if date is within year range
 * @param {Date|String} date - Date to validate
 * @param {Number} year - Year to check against
 * @returns {Boolean} - True if date is in year
 */
function isDateInYear(date, year) {
    const d = new Date(date);
    return d.getFullYear() === year;
}

/**
 * Extract base month and date from a date
 * @param {Date|String} date - Input date
 * @returns {Object} - {baseMonth, baseDate}
 */
function extractBaseDate(date) {
    const d = new Date(date);
    return {
        baseMonth: d.getMonth() + 1, // 1-12
        baseDate: d.getDate() // 1-31
    };
}

/**
 * Format date to YYYY-MM-DD string
 * @param {Date} date - Input date
 * @returns {String} - Formatted date string
 */
function formatDateString(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Check if two dates are the same day
 * @param {Date} date1 - First date
 * @param {Date} date2 - Second date
 * @returns {Boolean} - True if same day
 */
function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

/**
 * Get year from date
 * @param {Date|String} date - Input date
 * @returns {Number} - Year
 */
function getYear(date) {
    return new Date(date).getFullYear();
}

/**
 * Validate holiday code format
 * @param {String} code - Holiday code
 * @returns {Boolean} - True if valid
 */
function isValidHolidayCode(code) {
    return /^[A-Z_]{2,20}$/.test(code);
}

/**
 * Generate dataset version string
 * @returns {String} - Version string (e.g., 'v1', 'v2')
 */
function generateDatasetVersion() {
    const timestamp = Date.now();
    return `v${timestamp}`;
}

module.exports = {
    calculateWeekday,
    calculateFixedHolidayDate,
    isDateInYear,
    extractBaseDate,
    formatDateString,
    isSameDay,
    getYear,
    isValidHolidayCode,
    generateDatasetVersion
};
