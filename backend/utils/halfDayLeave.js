// backend/utils/halfDayLeave.js

const HALF_DAY_LEAVE_TYPES = ['Half Day - First Half', 'Half Day - Second Half'];

/**
 * @param {string | null | undefined} leaveType
 * @returns {boolean}
 */
const isHalfDayLeaveType = (leaveType) => {
    return !!leaveType && HALF_DAY_LEAVE_TYPES.includes(leaveType);
};

module.exports = {
    HALF_DAY_LEAVE_TYPES,
    isHalfDayLeaveType,
};
