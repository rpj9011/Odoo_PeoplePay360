/**
 * ATTENDANCE STATUS COLORS - SINGLE SOURCE OF TRUTH
 * Used by both Admin and Employee views for consistency
 */

export const ATTENDANCE_STATUS_COLORS = {
    'Present': '#51cf66',
    'On-time': '#51cf66',
    'Late': '#ff9800',
    'Half-day': '#ff9800',
    'Absent': '#ff6b6b',
    'Leave': '#74c0fc',
    'On Leave': '#74c0fc',
    'Holiday': '#9c27b0',
    'Weekend': '#ffd43b',
    'Week Off': '#ffd43b',
    'Day Off': '#ffd43b',
    'Working Day': '#6c757d',
    'N/A': '#6c757d'
};

export const ATTENDANCE_STATUS_BG_COLORS = {
    'Present': '#eafaf1',
    'On-time': '#eafaf1',
    'Late': '#fff3cd',
    'Half-day': '#fff3cd',
    'Absent': '#ffeaea',
    'Leave': '#e3f2fd',
    'On Leave': '#e3f2fd',
    'Holiday': '#f3e5f5',
    'Weekend': '#fff8e1',
    'Week Off': '#fff8e1',
    'Day Off': '#fff8e1',
    'Working Day': '#f8f9fa',
    'N/A': '#f8f9fa'
};

/**
 * Get status color for a given status string
 * @param {string} status - Attendance status
 * @returns {string} Hex color code
 */
export const getStatusColor = (status) => {
    return ATTENDANCE_STATUS_COLORS[status] || ATTENDANCE_STATUS_COLORS['N/A'];
};

/**
 * Get status background color for a given status string
 * @param {string} status - Attendance status
 * @returns {string} Hex color code
 */
export const getStatusBgColor = (status) => {
    return ATTENDANCE_STATUS_BG_COLORS[status] || ATTENDANCE_STATUS_BG_COLORS['N/A'];
};










