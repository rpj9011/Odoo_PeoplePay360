// frontend/src/utils/timeNormalization.js
import dayjs from 'dayjs';

/**
 * Normalizes a session/break time pair to handle cross-day scenarios.
 * If end time is before start time, automatically adds 1 day to end time.
 * 
 * @param {string|Date|dayjs.Dayjs} startTime - Start time (ISO string, Date, or dayjs object)
 * @param {string|Date|dayjs.Dayjs} endTime - End time (ISO string, Date, or dayjs object)
 * @param {string} baseDate - Base date in YYYY-MM-DD format (optional, for constructing from time strings)
 * @returns {Object} - { start: dayjs object, end: dayjs object (normalized) }
 */
export const normalizeSession = (startTime, endTime, baseDate = null) => {
    let start, end;

    // If baseDate is provided and times are strings (HH:MM format), construct full datetime
    if (baseDate && typeof startTime === 'string' && startTime.match(/^\d{2}:\d{2}$/)) {
        start = dayjs(`${baseDate}T${startTime}`);
    } else {
        start = dayjs(startTime);
    }

    if (baseDate && typeof endTime === 'string' && endTime.match(/^\d{2}:\d{2}$/)) {
        end = dayjs(`${baseDate}T${endTime}`);
    } else {
        end = dayjs(endTime);
    }

    // If end is before start, add 1 day to end (cross-day scenario)
    if (end.isBefore(start)) {
        end = end.add(1, 'day');
    }

    return { start, end };
};

/**
 * Validates session duration and returns error message if invalid.
 * 
 * @param {dayjs.Dayjs} start - Start time (dayjs object)
 * @param {dayjs.Dayjs} end - End time (dayjs object)
 * @param {number} maxHours - Maximum allowed hours (default: 16)
 * @returns {string|null} - Error message or null if valid
 */
export const validateSessionDuration = (start, end, maxHours = 16) => {
    if (!start || !end || !start.isValid() || !end.isValid()) {
        return 'Invalid start or end time.';
    }

    const durationHours = end.diff(start, 'hour', true);

    if (durationHours <= 0) {
        return 'End time must be after start time.';
    }

    if (durationHours > maxHours) {
        return `Session duration cannot exceed ${maxHours} hours.`;
    }

    return null;
};

/**
 * Creates a normalized datetime string from a base date and time string.
 * Handles cross-day scenarios automatically.
 * 
 * @param {string} baseDate - Base date in YYYY-MM-DD format
 * @param {string} timeStr - Time in HH:MM format
 * @param {dayjs.Dayjs} referenceStart - Reference start time to determine if we need next day
 * @returns {string} - ISO string of the normalized datetime
 */
export const createNormalizedDateTime = (baseDate, timeStr, referenceStart = null) => {
    if (!baseDate || !timeStr) return null;

    let datetime = dayjs(`${baseDate}T${timeStr}`);

    // If referenceStart is provided and this time is before it, add 1 day
    if (referenceStart && datetime.isBefore(referenceStart)) {
        datetime = datetime.add(1, 'day');
    }

    return datetime.toISOString();
};



