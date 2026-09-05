const LeavePolicyService = require('./LeavePolicyService');
const { hasDayTypeAllocations, computeEffectiveDeductions } = require('../utils/leaveDayAllocations');

const countWorkingDaysInLeaveDates = (leaveDates) => {
    if (!leaveDates || leaveDates.length === 0) return 0;
    return leaveDates.filter((d) => {
        const dow = new Date(d).getDay();
        return dow !== 0 && dow !== 6;
    }).length;
};

async function deductField(employeeId, field, amount, session) {
    const path = `leaveBalances.${field}`;
    const doc = await require('../models/User').findById(employeeId).select(path).session(session).lean();
    const current = doc?.leaveBalances?.[field] ?? 0;
    if (current < amount) {
        return { ok: false, error: `Insufficient ${field} leave balance. Required ${amount}, available ${current}.` };
    }
    const updated = await require('../models/User').findOneAndUpdate(
        { _id: employeeId, [path]: { $gte: amount } },
        { $inc: { [path]: -amount } },
        { session, new: true }
    );
    if (!updated) {
        return { ok: false, error: `Insufficient ${field} leave balance (concurrent update).` };
    }
    return { ok: true };
}

async function restoreField(employeeId, field, amount, session) {
    if (amount <= 0) return;
    await require('../models/User').findByIdAndUpdate(
        employeeId,
        { $inc: { [`leaveBalances.${field}`]: amount } },
        { session }
    );
}

/**
 * Apply or revert balance changes when leave status changes.
 * Supports per-day allocations on LOP requests.
 */
async function applyBalanceOnStatusChange(request, employee, oldStatus, newStatus, session) {
    if (hasDayTypeAllocations(request)) {
        const { deductions } = computeEffectiveDeductions(request);
        const buckets = [
            { field: 'paid', amount: deductions.paid },
            { field: 'casual', amount: deductions.casual },
            { field: 'sick', amount: deductions.sick },
        ];

        if (newStatus === 'Approved' && oldStatus !== 'Approved') {
            for (const { field, amount } of buckets) {
                if (amount <= 0) continue;
                const result = await deductField(employee._id, field, amount, session);
                if (!result.ok) return result;
            }
        } else if (newStatus !== 'Approved' && oldStatus === 'Approved') {
            for (const { field, amount } of buckets) {
                await restoreField(employee._id, field, amount, session);
            }
        }
        return { ok: true, usedAllocations: true };
    }

    const workingDayCount = countWorkingDaysInLeaveDates(request.leaveDates);
    const leaveDuration = workingDayCount * (request.leaveType === 'Full Day' ? 1 : 0.5);
    const requestTypeNormalized = LeavePolicyService.normalizeRequestType(request.requestType);
    const leaveField = LeavePolicyService.getBalanceField(requestTypeNormalized);

    if (!leaveField || newStatus === oldStatus) {
        return { ok: true, usedAllocations: false };
    }

    if (leaveField === 'backdated') {
        if (newStatus === 'Approved' && oldStatus !== 'Approved') {
            const resolved = LeavePolicyService.resolveBalanceForBackdatedLeave(employee, leaveDuration);
            if (resolved.deduct === false) return { ok: true, usedAllocations: false };
            if (resolved.allowed !== true || !resolved.deductions?.length) {
                return { ok: false, error: resolved.reason || 'Insufficient leave balance for backdated leave.' };
            }
            const conditions = { _id: employee._id };
            resolved.deductions.forEach(({ field, amount }) => {
                conditions[`leaveBalances.${field}`] = { $gte: amount };
            });
            const update = { $inc: {} };
            resolved.deductions.forEach(({ field, amount }) => {
                update.$inc[`leaveBalances.${field}`] = -amount;
            });
            const User = require('../models/User');
            const updated = await User.findOneAndUpdate(conditions, update, { session, new: true });
            if (!updated) {
                return { ok: false, error: 'Insufficient leave balance at approval time (or concurrent update).' };
            }
            const sickD = resolved.deductions.find((d) => d.field === 'sick');
            const casualD = resolved.deductions.find((d) => d.field === 'casual');
            request.backdatedSickDeducted = sickD ? sickD.amount : 0;
            request.backdatedCasualDeducted = casualD ? casualD.amount : 0;
        } else if (newStatus !== 'Approved' && oldStatus === 'Approved') {
            const sickRestore = request.backdatedSickDeducted ?? 0;
            const casualRestore = request.backdatedCasualDeducted ?? 0;
            if (sickRestore > 0 || casualRestore > 0) {
                const update = { $inc: {} };
                if (sickRestore > 0) update.$inc['leaveBalances.sick'] = sickRestore;
                if (casualRestore > 0) update.$inc['leaveBalances.casual'] = casualRestore;
                await require('../models/User').findByIdAndUpdate(employee._id, update, { session });
            }
        }
        return { ok: true, usedAllocations: false };
    }

    const updatePath = `leaveBalances.${leaveField}`;
    if (newStatus === 'Approved' && oldStatus !== 'Approved') {
        const User = require('../models/User');
        const currentBalanceDoc = await User.findById(employee._id).select(updatePath).session(session).lean();
        const currentBalance = currentBalanceDoc?.leaveBalances?.[leaveField];
        const effectiveBalance = currentBalance === undefined || currentBalance === null ? 0 : currentBalance;
        if (effectiveBalance < leaveDuration) {
            return {
                ok: false,
                error: `Insufficient leave balance at approval time. Required ${leaveDuration} day(s), available ${effectiveBalance}.`,
            };
        }
        if (currentBalance === undefined || currentBalance === null) {
            await User.findByIdAndUpdate(employee._id, { $set: { [updatePath]: 0 } }, { session });
        }
        const updated = await User.findOneAndUpdate(
            { _id: employee._id, [updatePath]: { $gte: leaveDuration } },
            { $inc: { [updatePath]: -leaveDuration } },
            { session, new: true }
        );
        if (!updated) {
            return {
                ok: false,
                error: `Insufficient leave balance at approval time (or concurrent update). Required ${leaveDuration} day(s).`,
            };
        }
    } else if (newStatus !== 'Approved' && oldStatus === 'Approved') {
        await require('../models/User').findByIdAndUpdate(
            employee._id,
            { $inc: { [updatePath]: leaveDuration } },
            { session }
        );
    }
    return { ok: true, usedAllocations: false };
}

function validateApprovalBalances(request, employee) {
    if (hasDayTypeAllocations(request)) {
        const { deductions } = computeEffectiveDeductions(request);
        const checks = [
            { field: 'paid', amount: deductions.paid, label: 'Planned' },
            { field: 'casual', amount: deductions.casual, label: 'Casual' },
            { field: 'sick', amount: deductions.sick, label: 'Sick' },
        ];
        for (const { field, amount, label } of checks) {
            if (amount <= 0) continue;
            const balance = employee.leaveBalances?.[field] ?? 0;
            if (balance < amount) {
                return {
                    allowed: false,
                    reason: `Insufficient ${label} leave balance. Required ${amount} day(s), available ${balance}.`,
                };
            }
        }
        return { allowed: true };
    }
    return LeavePolicyService.validateApproval(request, employee);
}

/**
 * When an approved LOP request's per-day allocations change, restore old deductions then apply new.
 */
async function reconcileApprovedDayAllocations(employeeId, request, oldAllocations, newAllocations, session) {
    const User = require('../models/User');
    const oldSnapshot = {
        ...request.toObject?.() || request,
        dayTypeAllocations: oldAllocations || [],
        status: 'Approved',
    };
    const newSnapshot = {
        ...request.toObject?.() || request,
        dayTypeAllocations: newAllocations || [],
        status: 'Approved',
    };

    const { deductions: oldDed } = computeEffectiveDeductions(oldSnapshot);
    const { deductions: newDed } = computeEffectiveDeductions(newSnapshot);

    const fields = ['paid', 'casual', 'sick'];
    for (const field of fields) {
        const restore = (oldDed[field] || 0) - (newDed[field] || 0);
        const deduct = (newDed[field] || 0) - (oldDed[field] || 0);
        if (restore > 0) {
            await User.findByIdAndUpdate(
                employeeId,
                { $inc: { [`leaveBalances.${field}`]: restore } },
                { session }
            );
        }
        if (deduct > 0) {
            const result = await deductField(employeeId, field, deduct, session);
            if (!result.ok) return result;
        }
    }
    return { ok: true };
}

module.exports = {
    applyBalanceOnStatusChange,
    validateApprovalBalances,
    reconcileApprovedDayAllocations,
};
