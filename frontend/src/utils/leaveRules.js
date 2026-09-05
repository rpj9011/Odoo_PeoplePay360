/**
 * Utility functions for Leave Management
 * 
 * STRICT POLICY: FRONTEND MUST NOT ENFORCE LOGIC.
 * All validation happens on the Backend.
 * This file contains only basic date helpers for display purposes.
 */

/**
 * Calculate leave duration from dates array and leave type
 */
export const calculateLeaveDuration = (startDate, endDate, leaveType) => {
    if (!startDate) return 0;

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date(start);

    // Calculate days difference
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end

    // Apply leave type multiplier
    const multiplier = leaveType && leaveType.startsWith('Half Day') ? 0.5 : 1;

    return diffDays * multiplier;
};

/**
 * Calculate days difference between today and a date
 */
export const calculateDaysDifference = (targetDate) => {
    if (!targetDate) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);

    const diffTime = target - today;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
};

/**
 * DEPRECATED: Client-side eligibility checks are banned.
 * Always returns enabled to allow backend to validate.
 */
export const isPlannedLeaveDisabled = (user, plannedLeaveHistory = [], startDate, endDate, leaveType = 'Full Day') => {
    return {
        disabled: false,
        tooltip: null
    };
};
