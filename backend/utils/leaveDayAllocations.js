// Per-day leave type overrides (e.g. split long LOP into Planned/Casual days)
const { getISTDateString, parseISTDate } = require('./istTime');

const ALLOWED_ALLOCATION_TYPES = ['Planned', 'Casual', 'Loss of Pay'];

function toDateKey(date) {
    const d = date instanceof Date ? date : parseISTDate(date);
    return getISTDateString(d);
}

function buildAllocationMap(dayTypeAllocations) {
    const map = new Map();
    if (!Array.isArray(dayTypeAllocations)) return map;
    for (const entry of dayTypeAllocations) {
        if (!entry?.date || !entry?.requestType) continue;
        map.set(toDateKey(entry.date), entry.requestType);
    }
    return map;
}

function getWorkingLeaveDates(leaveDates) {
    if (!leaveDates?.length) return [];
    return leaveDates.filter((d) => {
        const dow = new Date(d).getDay();
        return dow !== 0 && dow !== 6;
    });
}

/**
 * Effective request type per calendar day (IST). Uses admin overrides when set.
 */
function getEffectiveTypeForDate(request, date) {
    const key = toDateKey(date);
    const map = buildAllocationMap(request.dayTypeAllocations);
    if (map.has(key)) return map.get(key);
    return request.requestType;
}

/**
 * Deduction amounts by balance field and breakdown by display type.
 * @returns {{ deductions: { paid: number, casual: number, sick: number }, breakdown: Record<string, number> }}
 */
function computeEffectiveDeductions(request) {
    const halfMult = request.leaveType === 'Full Day' ? 1 : 0.5;
    const allocMap = buildAllocationMap(request.dayTypeAllocations);
    const deductions = { paid: 0, casual: 0, sick: 0 };
    const breakdown = {};

    for (const d of getWorkingLeaveDates(request.leaveDates)) {
        const key = toDateKey(d);
        const effectiveType = allocMap.get(key) || request.requestType;
        const amount = halfMult;
        breakdown[effectiveType] = (breakdown[effectiveType] || 0) + amount;

        if (effectiveType === 'Planned') deductions.paid += amount;
        else if (effectiveType === 'Casual') deductions.casual += amount;
        else if (effectiveType === 'Sick') deductions.sick += amount;
    }

    return { deductions, breakdown };
}

function hasDayTypeAllocations(request) {
    return Array.isArray(request.dayTypeAllocations) && request.dayTypeAllocations.length > 0;
}

function validateDayAllocations(request, allocations) {
    if (!Array.isArray(allocations)) {
        return { valid: false, error: 'allocations must be an array.' };
    }
    if (allocations.length === 0) {
        return { valid: true, allocations: [] };
    }
    if (request.requestType !== 'Loss of Pay') {
        return { valid: false, error: 'Day allocations are only allowed for Loss of Pay requests.' };
    }
    const workingKeys = new Set(getWorkingLeaveDates(request.leaveDates).map(toDateKey));
    if (workingKeys.size === 0) {
        return { valid: false, error: 'No working days in this leave request.' };
    }

    const seen = new Set();
    const parsed = [];
    for (const item of allocations) {
        if (!item?.date || !item?.requestType) {
            return { valid: false, error: 'Each allocation must include date and requestType.' };
        }
        if (!ALLOWED_ALLOCATION_TYPES.includes(item.requestType)) {
            return { valid: false, error: `Invalid allocation type: ${item.requestType}` };
        }
        const key = toDateKey(item.date);
        if (!workingKeys.has(key)) {
            return { valid: false, error: `Date ${key} is not part of this leave request.` };
        }
        if (seen.has(key)) {
            return { valid: false, error: `Duplicate allocation for ${key}.` };
        }
        seen.add(key);
        parsed.push({ date: parseISTDate(key), requestType: item.requestType });
    }
    return { valid: true, allocations: parsed };
}

module.exports = {
    ALLOWED_ALLOCATION_TYPES,
    buildAllocationMap,
    getWorkingLeaveDates,
    getEffectiveTypeForDate,
    computeEffectiveDeductions,
    hasDayTypeAllocations,
    validateDayAllocations,
    toDateKey,
};
