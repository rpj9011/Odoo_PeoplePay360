/**
 * CENTRAL IST TIME UTILITY
 * 
 * SINGLE SOURCE OF TRUTH for all timezone operations.
 * All business logic MUST use these functions.
 * 
 * Rules:
 * - IST (Asia/Kolkata) is the ONLY timezone for business logic
 * - UTC is ONLY used as MongoDB storage format
 * - NO browser timezone
 * - NO server OS timezone
 * 
 * PRODUCTION SAFETY: All functions have try/catch and fallbacks
 * to prevent crashes on older Node versions or missing dependencies.
 */

// Safe require with fallback - never crash on import
let moment;
try {
    moment = require('moment-timezone');
} catch (err) {
    console.error('[istTime] moment-timezone not available, using fallback methods:', err.message);
    moment = null;
}

// IST offset: +05:30 (5 hours 30 minutes = 19800000 milliseconds)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Safe fallback: Get IST time using manual offset calculation
 * This works on all Node versions without Intl API
 */
const getISTNowFallback = () => {
    const now = new Date();
    // Get UTC time and add IST offset
    const utcTime = now.getTime();
    const istTime = new Date(utcTime + IST_OFFSET_MS);
    return istTime;
};

/**
 * Safe fallback: Format date parts manually (Node 14/16 compatible)
 */
const formatDatePartsFallback = (date, timeZone = 'Asia/Kolkata') => {
    try {
        // Try Intl API first (Node 16+)
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            // Check if formatToParts is available (Node 16+)
            if (typeof formatter.formatToParts === 'function') {
                const parts = formatter.formatToParts(date);
                const partsMap = {};
                parts.forEach(part => {
                    partsMap[part.type] = part.value;
                });
                return partsMap;
            }
        }
    } catch (err) {
        // Fall through to manual calculation
    }
    
    // Manual fallback: Use UTC and add IST offset
    const utcDate = new Date(date.getTime());
    const istDate = new Date(utcDate.getTime() + IST_OFFSET_MS);
    
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const hour = String(istDate.getUTCHours()).padStart(2, '0');
    const minute = String(istDate.getUTCMinutes()).padStart(2, '0');
    const second = String(istDate.getUTCSeconds()).padStart(2, '0');
    
    return { year, month, day, hour, minute, second };
};

/**
 * Get current date/time in IST
 * @returns {Date} Date object representing current time in IST (always returns valid Date)
 */
const getISTNow = () => {
    try {
        const now = new Date();
        const partsMap = formatDatePartsFallback(now, 'Asia/Kolkata');
        
        // Create Date object in IST (using UTC constructor with IST values)
        // Format: YYYY-MM-DDTHH:mm:ss+05:30
        const istISOString = `${partsMap.year}-${partsMap.month}-${partsMap.day}T${partsMap.hour}:${partsMap.minute}:${partsMap.second}+05:30`;
        const result = new Date(istISOString);
        
        // Validate result
        if (isNaN(result.getTime())) {
            throw new Error('Invalid date from IST conversion');
        }
        
        return result;
    } catch (error) {
        console.error('[istTime.getISTNow] Error, using fallback:', error.message);
        // Safe fallback: return current time with IST offset
        return getISTNowFallback();
    }
};

/**
 * Get current date as YYYY-MM-DD string in IST
 * This is the ONLY way to generate attendanceDate
 * @returns {string} Date string in YYYY-MM-DD format (IST) - always returns valid string
 */
const getISTDateString = (date = null) => {
    try {
        if (date == null) {
            const partsMap = formatDatePartsFallback(getISTNow(), 'Asia/Kolkata');
            return `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
        }
        if (typeof date === 'string') {
            const trimmed = date.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                return trimmed;
            }
            date = parseISTDate(trimmed);
        }
        const targetDate = date instanceof Date ? date : getISTNow();
        if (!(targetDate instanceof Date) || isNaN(targetDate.getTime())) {
            throw new Error('Invalid date');
        }

        // Use safe fallback formatter
        const partsMap = formatDatePartsFallback(targetDate, 'Asia/Kolkata');
        
        return `${partsMap.year}-${partsMap.month}-${partsMap.day}`;
    } catch (error) {
        console.error('[istTime.getISTDateString] Error, using fallback:', error.message);
        // Safe fallback: use current date with IST offset
        const fallbackDate = date || getISTNowFallback();
        const year = fallbackDate.getUTCFullYear();
        const month = String(fallbackDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(fallbackDate.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
};

/**
 * Parse a YYYY-MM-DD date string as IST date
 * This safely parses date strings as IST, avoiding UTC parsing issues
 * @param {string|Date} dateString - Date string in YYYY-MM-DD format or Date object
 * @returns {Date} Date object representing IST midnight of that date (always returns valid Date)
 */
const parseISTDate = (dateString) => {
    try {
        if (!dateString) {
            console.error('[istTime.parseISTDate] Date string is required, using current date');
            return getISTNow();
        }
        
        // If already a Date object, return as is (assume it's already in correct timezone context)
        if (dateString instanceof Date) {
            if (isNaN(dateString.getTime())) {
                console.error('[istTime.parseISTDate] Invalid Date object, using current date');
                return getISTNow();
            }
            return dateString;
        }
        
        // Parse YYYY-MM-DD as IST midnight
        if (typeof dateString === 'string') {
            // Handle ISO datetime strings
            if (dateString.includes('T')) {
                // Already has timezone info, parse directly
                const result = new Date(dateString);
                if (isNaN(result.getTime())) {
                    throw new Error('Invalid ISO date string');
                }
                return result;
            }
            
            // Handle YYYY-MM-DD format - parse as IST midnight
            const dateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (dateMatch) {
                const [, year, month, day] = dateMatch;
                // Create IST midnight: YYYY-MM-DDTHH:mm:ss+05:30
                const istISOString = `${year}-${month}-${day}T00:00:00+05:30`;
                const result = new Date(istISOString);
                if (isNaN(result.getTime())) {
                    throw new Error('Invalid date components');
                }
                return result;
            }
            
            // Fallback: try standard Date parsing
            const result = new Date(dateString);
            if (isNaN(result.getTime())) {
                throw new Error('Date parsing failed');
            }
            return result;
        }
        
        throw new Error(`Invalid date string format: ${dateString}`);
    } catch (error) {
        console.error('[istTime.parseISTDate] Error parsing date, using fallback:', error.message, dateString);
        // Safe fallback: return current IST time
        return getISTNow();
    }
};

/**
 * Get start of day (00:00:00) in IST for a given date
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {Date} Date object representing IST midnight (always returns valid Date)
 */
const startOfISTDay = (date = null) => {
    try {
        const targetDate = date ? (typeof date === 'string' ? parseISTDate(date) : date) : getISTNow();
        const dateString = getISTDateString(targetDate);
        return parseISTDate(dateString);
    } catch (error) {
        console.error('[istTime.startOfISTDay] Error, using fallback:', error.message);
        // Safe fallback: return current IST midnight
        const fallback = getISTNow();
        const dateString = getISTDateString(fallback);
        return parseISTDate(dateString);
    }
};

/**
 * Get end of day (23:59:59.999) in IST for a given date
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {Date} Date object representing IST end of day (always returns valid Date)
 */
const endOfISTDay = (date = null) => {
    try {
        const dateString = getISTDateString(date);
        const [year, month, day] = dateString.split('-');
        // Create IST end of day: YYYY-MM-DDTHH:mm:ss.sss+05:30
        const istISOString = `${year}-${month}-${day}T23:59:59.999+05:30`;
        const result = new Date(istISOString);
        if (isNaN(result.getTime())) {
            throw new Error('Invalid end of day date');
        }
        return result;
    } catch (error) {
        console.error('[istTime.endOfISTDay] Error, using fallback:', error.message);
        // Safe fallback: use current date end of day
        const fallback = getISTNow();
        const dateString = getISTDateString(fallback);
        const [year, month, day] = dateString.split('-');
        const istISOString = `${year}-${month}-${day}T23:59:59.999+05:30`;
        return new Date(istISOString);
    }
};

/**
 * Convert a Date object to IST time string for display
 * @param {Date} date - Date object (assumed to be in correct timezone context)
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted time string in IST (always returns valid string)
 */
const formatISTTime = (date, options = { hour12: true, hour: '2-digit', minute: '2-digit' }) => {
    try {
        if (!date) return '';
        const result = new Date(date).toLocaleTimeString('en-US', {
            timeZone: 'Asia/Kolkata',
            ...options
        });
        return result || '';
    } catch (error) {
        console.error('[istTime.formatISTTime] Error, using fallback:', error.message);
        // Safe fallback: basic time format
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const hours = String(d.getUTCHours()).padStart(2, '0');
        const minutes = String(d.getUTCMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
};

/**
 * Convert a Date object to IST date string for display
 * @param {Date} date - Date object
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string in IST (always returns valid string)
 */
const formatISTDate = (date, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
    try {
        if (!date) return '';
        const result = new Date(date).toLocaleDateString('en-GB', {
            timeZone: 'Asia/Kolkata',
            ...options
        });
        return result || '';
    } catch (error) {
        console.error('[istTime.formatISTDate] Error, using fallback:', error.message);
        // Safe fallback: basic date format
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
    }
};

/**
 * Get shift date/time in IST
 * Helper for shift start/end time calculations
 * @param {Date|string} onDate - Date object or YYYY-MM-DD string (optional)
 * @param {string} shiftTime - Time string in HH:MM format
 * @returns {Date} Date object representing shift time in IST (always returns valid Date)
 */
const getShiftDateTimeIST = (onDate, shiftTime) => {
    try {
        if (!shiftTime || typeof shiftTime !== 'string') {
            console.error('[istTime.getShiftDateTimeIST] Invalid shiftTime, using current time');
            return getISTNow();
        }
        
        const timeParts = shiftTime.split(':');
        if (timeParts.length < 2) {
            console.error('[istTime.getShiftDateTimeIST] Invalid shiftTime format, using current time');
            return getISTNow();
        }
        
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            console.error('[istTime.getShiftDateTimeIST] Invalid time values, using current time');
            return getISTNow();
        }
        
        const targetDate = onDate ? (typeof onDate === 'string' ? parseISTDate(onDate) : onDate) : getISTNow();
        
        // Use safe fallback formatter
        const partsMap = formatDatePartsFallback(targetDate, 'Asia/Kolkata');
        
        const shiftDateTimeISO_IST = `${partsMap.year}-${partsMap.month}-${partsMap.day}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000+05:30`;
        const result = new Date(shiftDateTimeISO_IST);
        
        if (isNaN(result.getTime())) {
            throw new Error('Invalid shift date time');
        }
        
        return result;
    } catch (error) {
        console.error('[istTime.getShiftDateTimeIST] Error, using fallback:', error.message);
        // Safe fallback: return current IST time
        return getISTNow();
    }
};

/**
 * Check if two dates are on the same IST day
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} True if both dates are on the same IST day (always returns boolean)
 */
const isSameISTDay = (date1, date2) => {
    try {
        const d1 = typeof date1 === 'string' ? parseISTDate(date1) : date1;
        const d2 = typeof date2 === 'string' ? parseISTDate(date2) : date2;
        return getISTDateString(d1) === getISTDateString(d2);
    } catch (error) {
        console.error('[istTime.isSameISTDay] Error, returning false:', error.message);
        return false;
    }
};

/**
 * Get IST date parts (year, month, day) from a date
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {object} Object with year, month, day, monthIndex (0-based) (always returns valid object)
 */
const getISTDateParts = (date = null) => {
    try {
        const targetDate = date ? (typeof date === 'string' ? parseISTDate(date) : date) : getISTNow();
        const dateString = getISTDateString(targetDate);
        const parts = dateString.split('-').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) {
            throw new Error('Invalid date parts');
        }
        const [year, month, day] = parts;
        return {
            year,
            month, // 1-based month (1-12)
            monthIndex: month - 1, // 0-based month (0-11)
            day
        };
    } catch (error) {
        console.error('[istTime.getISTDateParts] Error, using fallback:', error.message);
        // Safe fallback: use current date parts
        const fallback = getISTNow();
        const year = fallback.getUTCFullYear();
        const month = fallback.getUTCMonth() + 1;
        const day = fallback.getUTCDate();
        return {
            year,
            month,
            monthIndex: month - 1,
            day
        };
    }
};

/**
 * List of night-shift employee IDs (afternoon-shift employees)
 * These employees have extended attendance day until 6 AM
 * TODO: Replace with actual employee IDs or fetch from database
 */
const NIGHT_SHIFT_EMPLOYEES = [
    // 'empId1', 'empId2' // Replace with actual employee IDs
];

/**
 * Check if a user is a night-shift employee
 * @param {string} userId - User ID to check
 * @returns {boolean} True if user is a night-shift employee
 */
const isNightShiftEmployee = (userId) => {
    if (!userId) return false;
    // Convert to string for comparison
    const userIdStr = userId.toString();
    return NIGHT_SHIFT_EMPLOYEES.includes(userIdStr);
};

/**
 * Get attendance date for a user, accounting for night-shift employees
 * For night-shift employees: attendance day extends until 6 AM (before 6 AM counts as previous day)
 * For regular employees: uses standard IST date
 * 
 * @param {string} userId - User ID (optional, for night-shift detection)
 * @param {Date} date - Optional date to use instead of current time
 * @returns {string} Date string in YYYY-MM-DD format (IST) (always returns valid string)
 */
const getAttendanceDate = (userId = null, date = null) => {
    try {
        // Use moment-timezone if available, otherwise use fallback
        if (moment) {
            const now = date ? moment(date) : moment().tz('Asia/Kolkata');
            
            // Check if user is a night-shift employee
            if (userId && isNightShiftEmployee(userId)) {
                // For afternoon/night shift: before 6 AM counts as previous day
                if (now.hours() < 6) {
                    return now.clone().subtract(1, 'day').format('YYYY-MM-DD');
                }
                return now.format('YYYY-MM-DD');
            }
            
            // Regular employees: use standard IST date
            return now.format('YYYY-MM-DD');
        } else {
            // Fallback: use getISTDateString with manual hour check
            const now = date || getISTNow();
            const currentDateString = getISTDateString(now);
            
            // Check if user is a night-shift employee
            if (userId && isNightShiftEmployee(userId)) {
                // Get current hour in IST
                const partsMap = formatDatePartsFallback(now, 'Asia/Kolkata');
                const hour = parseInt(partsMap.hour, 10);
                
                // For afternoon/night shift: before 6 AM counts as previous day
                if (hour < 6) {
                    const prevDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    return getISTDateString(prevDate);
                }
            }
            
            return currentDateString;
        }
    } catch (error) {
        console.error('[istTime.getAttendanceDate] Error, using fallback:', error.message);
        // Safe fallback: return current IST date string
        return getISTDateString();
    }
};

/**
 * Get today's date as IST YYYY-MM-DD for cache keys and dashboard logic.
 * Single source of truth so dashboard, attendance, and leave always agree on "today".
 * @returns {string} YYYY-MM-DD in IST
 */
const getTodayISTKey = () => getISTDateString();

/**
 * Normalize leave date inputs for API boundary. Accept ONLY YYYY-MM-DD strings.
 * Reject ISO timestamps with time component to avoid timezone bugs.
 * @param {Array<string|Date>} leaveDates - Raw leave dates from request
 * @returns {{ valid: true, dateStrings: string[] } | { valid: false, error: string }}
 */
function normalizeLeaveDatesForApi(leaveDates) {
    if (!Array.isArray(leaveDates) || leaveDates.length === 0) {
        return { valid: false, error: 'Leave dates are required and must be a non-empty array.' };
    }
    const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;
    const out = [];
    for (let i = 0; i < leaveDates.length; i++) {
        const d = leaveDates[i];
        if (d instanceof Date) {
            if (isNaN(d.getTime())) {
                return { valid: false, error: `Invalid date at position ${i + 1}.` };
            }
            out.push(getISTDateString(d));
            continue;
        }
        if (typeof d !== 'string' || !d.trim()) {
            return { valid: false, error: `Leave date at position ${i + 1} must be a YYYY-MM-DD string.` };
        }
        const s = d.trim();
        if (s.includes('T')) {
            return { valid: false, error: 'Leave dates must be calendar dates only (YYYY-MM-DD). Do not send ISO timestamps with time.' };
        }
        if (!YYYY_MM_DD.test(s)) {
            return { valid: false, error: `Leave date at position ${i + 1} must be in YYYY-MM-DD format.` };
        }
        out.push(s);
    }
    return { valid: true, dateStrings: out };
}

module.exports = {
    getISTNow,
    getISTDateString,
    getTodayISTKey,
    parseISTDate,
    startOfISTDay,
    endOfISTDay,
    formatISTTime,
    formatISTDate,
    getShiftDateTimeIST,
    isSameISTDay,
    getISTDateParts,
    getAttendanceDate,
    isNightShiftEmployee,
    normalizeLeaveDatesForApi
};



