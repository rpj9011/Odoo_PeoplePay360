/**
 * Shared formatting utilities for analytics components.
 * Defined once as module-level constants — never recreated on render.
 */

export const formatNumber = (num) => {
    if (num === null || num === undefined) return '0.00';
    return Number(num).toFixed(2);
};

export const formatInt = (num) => {
    if (num === null || num === undefined) return '0';
    return Math.round(num);
};

export const formatHoursToHHMM = (decimalHours) => {
    if (decimalHours === null || decimalHours === undefined || decimalHours === 0) return '00:00';
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};
