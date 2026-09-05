/**
 * Date Utility Service - IST ENFORCER
 * 
 * CRITICAL: All leave policies are based on Indian Standard Time (IST).
 * This utility provides a SINGLE source of truth for date calculations.
 * 
 * IST = UTC + 5 hours 30 minutes
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +5:30 in milliseconds

/**
 * Returns a Date object adjusted to IST.
 * NOTE: The 'Date' object itself is always UTC. 
 * This method returns a Date where the UTC components match the IST time.
 * primarily used for extracting getUTCDay(), getUTCDate() etc. as if they were IST.
 * 
 * @param {Date|string} dateInput 
 * @returns {Date} Date object shifted to IST
 */
const getISTAdjustedDate = (dateInput) => {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;
    return new Date(date.getTime() + IST_OFFSET_MS);
};

/**
 * Returns YYYY-MM-DD string in IST.
 * This is the canonical format for storing strict dates (like holidays).
 * 
 * @param {Date|string} dateInput 
 * @returns {string} 'YYYY-MM-DD'
 */
const toISTDateString = (dateInput) => {
    const istDate = getISTAdjustedDate(dateInput);
    if (!istDate) return ''; // Handle invalid dates safely
    return istDate.toISOString().split('T')[0];
};

/**
 * Returns the day of the week in IST (0=Sunday, ..., 6=Saturday)
 * 
 * @param {Date|string} dateInput 
 * @returns {number} 0-6
 */
const getISTDay = (dateInput) => {
    const istDate = getISTAdjustedDate(dateInput);
    return istDate ? istDate.getUTCDay() : -1;
};

/**
 * Returns the Month index in IST (0=Jan, ..., 11=Dec)
 * 
 * @param {Date|string} dateInput 
 * @returns {number} 0-11
 */
const getISTMonth = (dateInput) => {
    const istDate = getISTAdjustedDate(dateInput);
    return istDate ? istDate.getUTCMonth() : -1;
};

/**
 * Returns the full Year in IST
 * 
 * @param {Date|string} dateInput 
 * @returns {number} YYYY
 */
const getISTYear = (dateInput) => {
    const istDate = getISTAdjustedDate(dateInput);
    return istDate ? istDate.getUTCFullYear() : -1;
};

/**
 * Checks if a date is a Friday in IST
 */
const isISTFriday = (dateInput) => {
    return getISTDay(dateInput) === 5;
};

/**
 * Checks if a date is a Monday in IST
 */
const isISTMonday = (dateInput) => {
    return getISTDay(dateInput) === 1;
};

/**
 * Checks if a date is a Sunday in IST
 */
const isISTSunday = (dateInput) => {
    return getISTDay(dateInput) === 0;
};

/**
 * Get difference in days between two dates in IST context
 */
const getISTDaysDifference = (d1, d2) => {
    const date1 = new Date(toISTDateString(d1));
    const date2 = new Date(toISTDateString(d2));
    const diffTime = Math.abs(date2 - date1);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Normalize an input date to the start of the day in IST (00:00:00.000)
 * Returned as a UTC timestamp that corresponds to IST midnight.
 * 
 * Example: 2023-11-01 IST Midnight is 2023-10-31T18:30:00Z
 */
const startOfISTDay = (dateInput) => {
    const dateStr = toISTDateString(dateInput);
    // Create date from YYYY-MM-DD string implies UTC midnight usually in JS if no time,
    // but we want the specific timestamp.
    // Easiest way: Parse YYYY-MM-DD, then subtract offset to get back to real UTC.
    const utcMidnight = new Date(dateStr + 'T00:00:00Z');
    return new Date(utcMidnight.getTime() - IST_OFFSET_MS);
};

module.exports = {
    getISTAdjustedDate,
    toISTDateString,
    getISTDay,
    getISTMonth,
    getISTYear,
    isISTFriday,
    isISTMonday,
    isISTSunday,
    getISTDaysDifference,
    startOfISTDay
};
