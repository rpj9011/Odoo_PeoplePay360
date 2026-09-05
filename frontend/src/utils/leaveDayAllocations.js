const toDateKey = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export function getWorkingLeaveDateKeys(leaveDates) {
    if (!leaveDates?.length) return [];
    return leaveDates
        .filter((d) => {
            const dow = new Date(d).getDay();
            return dow !== 0 && dow !== 6;
        })
        .map(toDateKey);
}

export function computeEffectiveBreakdown(leave) {
    const halfMult = leave.leaveType === 'Full Day' ? 1 : 0.5;
    const allocMap = new Map();
    (leave.dayTypeAllocations || []).forEach((a) => {
        if (a?.date && a?.requestType) allocMap.set(toDateKey(a.date), a.requestType);
    });

    const breakdown = {};
    getWorkingLeaveDateKeys(leave.leaveDates).forEach((key) => {
        const effectiveType = allocMap.get(key) || leave.requestType;
        breakdown[effectiveType] = (breakdown[effectiveType] || 0) + halfMult;
    });
    return breakdown;
}

/** Approved leave days in range, using per-day allocations when present */
export function addLeaveToBreakdown(breakdown, leave, startDate, endDate, multiplier) {
    const allocMap = new Map();
    (leave.dayTypeAllocations || []).forEach((a) => {
        if (a?.date && a?.requestType) allocMap.set(toDateKey(a.date), a.requestType);
    });
    const hasAlloc = allocMap.size > 0;

    (leave.leaveDates || []).forEach((date) => {
        const leaveDate = new Date(date);
        if (leaveDate < startDate || leaveDate > endDate) return;
        const dow = leaveDate.getDay();
        if (dow === 0 || dow === 6) return;

        const key = toDateKey(date);
        const reqType = hasAlloc ? (allocMap.get(key) || leave.requestType) : (leave.requestType || 'Unknown');
        breakdown[reqType] = (breakdown[reqType] || 0) + multiplier;
    });
}
