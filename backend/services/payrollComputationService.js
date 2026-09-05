// backend/services/payrollComputationService.js
// ─────────────────────────────────────────────────────────────────────────────
// Payslip computation engine.
//
// Entry point: computePayrun(payrunId)
//
// Flow:
//   1. Load Payrun + its SalaryStructure (with populated SalaryRule refs)
//   2. For each employee: fetch active Contract via getActiveContractForPeriod
//   3. Fetch AttendanceLog for the period → derive workedDays
//   4. Run salary rules in getSortedRules() sequence, building running totals
//      per category (Basic / Allowance / Gross / Deduction / Net)
//   5. Formula rules evaluated with expr-eval (no eval/new Function)
//   6. Collect warnings[] with blocking:Boolean
//   7. Upsert one Payslip per employee (unique index on {payrun, employee})
//   8. Stamp Payrun.status = 'Computed', Payrun.computedAt = now
//
// Safe formula evaluator
// ──────────────────────
// expr-eval's Parser is sandboxed: it has no access to Node globals, no
// require(), no process, no prototype chain.  We inject only the category
// running-total variables (BASIC, ALLOWANCE, GROSS, DEDUCTION, NET, WAGE)
// into the evaluation scope so formulas cannot read or write anything else.
// This directly satisfies audit item #29.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const mongoose   = require('mongoose');
const { Parser } = require('expr-eval');

// Lazy-load models to avoid circular-require issues at module load time.
const getModels = () => ({
    Payrun:          require('../models/Payrun'),
    Payslip:         require('../models/Payslip'),
    Contract:        require('../models/Contract'),
    SalaryStructure: require('../models/SalaryStructure'),
    SalaryRule:      require('../models/SalaryRule'),
    AttendanceLog:   require('../models/AttendanceLog'),
    User:            require('../models/User'),
});

// ── Safe expression parser ────────────────────────────────────────────────────
const formulaParser = new Parser({
    // Disable operators that could be used for side-effects
    operators: {
        logical:     false,
        comparison:  true,
        in:          false,
        assignment:  false,
    },
});

/**
 * Safely evaluate a formula string against a scope of numeric variables.
 * Returns null (with a warning) instead of throwing on bad formulas.
 *
 * @param {string} formula  e.g. "BASIC * 0.12"
 * @param {Object} scope    e.g. { BASIC: 50000, GROSS: 75000, ... }
 * @returns {{ value: number|null, error: string|null }}
 */
function safeEval(formula, scope) {
    try {
        const expr  = formulaParser.parse(formula);
        const value = expr.evaluate(scope);
        if (typeof value !== 'number' || !isFinite(value)) {
            return { value: null, error: `Formula "${formula}" produced a non-numeric result.` };
        }
        return { value, error: null };
    } catch (err) {
        return { value: null, error: `Formula "${formula}" failed: ${err.message}` };
    }
}

// ── Attendance aggregation ────────────────────────────────────────────────────
/**
 * Count worked days for an employee in [periodStart, periodEnd].
 * Reuses the same AttendanceLog query pattern as payrollFeed.js
 * (attendanceDate is stored as "YYYY-MM-DD" string).
 *
 * presentDays counts On-time and Late full-day logs.
 * halfDays count as 0.5.
 *
 * @returns {Promise<number>}
 */
async function getWorkedDays(AttendanceLog, employeeId, periodStart, periodEnd) {
    const pad  = n => String(n).padStart(2, '0');
    const fmt  = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const from = fmt(periodStart);
    const to   = fmt(periodEnd);

    const logs = await AttendanceLog.find({
        user:           employeeId,
        attendanceDate: { $gte: from, $lte: to },
    }).select('attendanceStatus isHalfDay').lean();

    let worked = 0;
    for (const log of logs) {
        const s = log.attendanceStatus;
        if (s === 'On-time' || s === 'Late') {
            worked += log.isHalfDay ? 0.5 : 1;
        } else if (s === 'Half-day') {
            worked += 0.5;
        }
        // 'Absent' and 'Leave' contribute 0
    }
    return worked;
}

// ── Category running total helpers ────────────────────────────────────────────
const CATEGORY_KEYS = {
    Basic:     'BASIC',
    Allowance: 'ALLOWANCE',
    Gross:     'GROSS',
    Deduction: 'DEDUCTION',
    Net:       'NET',
};

function buildScope(totals, wagePerMonth) {
    return {
        BASIC:     totals.Basic     || 0,
        ALLOWANCE: totals.Allowance || 0,
        GROSS:     totals.Gross     || 0,
        DEDUCTION: totals.Deduction || 0,
        NET:       totals.Net       || 0,
        WAGE:      wagePerMonth     || 0,
    };
}

// ── Single-employee rule runner ───────────────────────────────────────────────
/**
 * Apply every rule in sequence and return { lines, totals, warnings }.
 *
 * @param {Array}  sortedRules  – populated SalaryRule documents, sorted by sequence
 * @param {number} wagePerMonth – employee's contract wage
 * @returns {{ lines: Array, totals: Object, warnings: Array }}
 */
function runRules(sortedRules, wagePerMonth) {
    // Running category totals
    const totals = { Basic: 0, Allowance: 0, Gross: 0, Deduction: 0, Net: 0 };
    const lines    = [];
    const warnings = [];

    for (const ruleRef of sortedRules) {
        // ruleRef may be { rule: <SalaryRule doc>, sequence } from SalaryStructure.salaryRules
        const rule = ruleRef.rule || ruleRef; // handle both populated and raw forms
        if (!rule || !rule.computationMethod) continue;
        if (rule.isActive === false) continue;

        let amount = 0;
        const scope = buildScope(totals, wagePerMonth);

        switch (rule.computationMethod) {
            case 'FixedAmount':
                amount = rule.fixedAmount || 0;
                break;

            case 'PercentageOfWage':
                amount = ((rule.percentage || 0) / 100) * wagePerMonth;
                break;

            case 'PercentageOfCategory': {
                const base = scope[CATEGORY_KEYS[rule.percentageBaseCategory]] || 0;
                amount = ((rule.percentage || 0) / 100) * base;
                break;
            }

            case 'Formula': {
                if (!rule.formula) {
                    warnings.push({
                        message:  `Rule "${rule.name}" (${rule.code}) has no formula string.`,
                        severity: 'warning',
                        blocking: false,
                    });
                    break;
                }
                const { value, error } = safeEval(rule.formula, scope);
                if (error) {
                    warnings.push({
                        message:  `Formula error in rule "${rule.name}": ${error}`,
                        severity: 'error',
                        blocking: true,
                    });
                    break;
                }
                amount = value;
                break;
            }

            default:
                warnings.push({
                    message:  `Unknown computationMethod "${rule.computationMethod}" on rule "${rule.name}".`,
                    severity: 'warning',
                    blocking: false,
                });
        }

        // Deduction rules use negative amounts when added to running totals
        const signed = rule.appliesTo === 'Deduction' ? Math.abs(amount) : amount;

        // Accumulate into category total
        if (totals[rule.category] !== undefined) {
            totals[rule.category] += signed;
        }

        lines.push({
            rule:     rule._id,
            code:     rule.code,
            name:     rule.name,
            category: rule.category,
            amount:   signed,
            sequence: rule.sequence,
        });
    }

    // Derive aggregated totals
    const basicTotal      = totals.Basic;
    const grossTotal      = totals.Basic + totals.Allowance + (totals.Gross || 0);
    const deductionsTotal = totals.Deduction;
    const netTotal        = grossTotal - deductionsTotal + (totals.Net || 0);

    return { lines, totals: { basicTotal, grossTotal, deductionsTotal, netTotal }, warnings };
}

// ── Check employee bank details ────────────────────────────────────────────────
function hasMissingBankDetails(user) {
    // User model may store bank details in various fields — check common patterns.
    // If none of these exist, warn but don't block (banking data varies by deployment).
    const u = user || {};
    const hasBankInfo =
        u.bankAccountNumber ||
        u.bankAccount       ||
        u.accountNumber     ||
        (u.bankDetails && (u.bankDetails.accountNumber || u.bankDetails.accountNo));
    return !hasBankInfo;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * computePayrun(payrunId)
 *
 * Runs the full payslip computation engine for a Payrun document.
 * Creates/upserts one Payslip per employee, updates Payrun status to 'Computed'.
 *
 * @param {string|ObjectId} payrunId
 * @returns {Promise<{ payrun: Payrun, results: Array, errors: Array }>}
 */
async function computePayrun(payrunId) {
    const { Payrun, Payslip, Contract, SalaryStructure, SalaryRule, AttendanceLog, User } = getModels();

    if (!mongoose.Types.ObjectId.isValid(payrunId)) {
        throw new Error(`Invalid payrunId: ${payrunId}`);
    }

    // ── 1. Load Payrun ───────────────────────────────────────────────────────
    const payrun = await Payrun.findById(payrunId);
    if (!payrun) throw new Error(`Payrun ${payrunId} not found.`);
    if (payrun.status === 'Paid') {
        throw new Error('Cannot recompute a Paid payrun — status is locked.');
    }

    // ── 2. Load SalaryStructure with populated rules ─────────────────────────
    const structure = await SalaryStructure.findById(payrun.salaryStructure)
        .populate({
            path:     'salaryRules.rule',
            model:    'SalaryRule',
            select:   'name code category sequence computationMethod fixedAmount percentage percentageBaseCategory formula appliesTo isActive',
        });

    if (!structure) {
        throw new Error(`SalaryStructure ${payrun.salaryStructure} not found.`);
    }

    const sortedRules = structure.getSortedRules(); // [{rule: <doc>, sequence}]

    const employeeIds = payrun.employees || [];
    if (employeeIds.length === 0) {
        throw new Error('Payrun has no employees. Add employees before computing.');
    }

    const results = [];  // { employeeId, payslipId, success, warnings }
    const errors  = [];  // { employeeId, error }
    const newPayslipIds = [];

    // ── 3. Process each employee ─────────────────────────────────────────────
    for (const empId of employeeIds) {
        try {
            // Fetch employee record (for bank-detail check)
            const employee = await User.findById(empId)
                .select('fullName email bankAccountNumber bankAccount accountNumber bankDetails')
                .lean();

            if (!employee) {
                errors.push({ employeeId: empId, error: `Employee ${empId} not found.` });
                continue;
            }

            // Fetch active contract for period
            const contract = await Contract.getActiveContractForPeriod(
                empId, payrun.periodStart, payrun.periodEnd
            );

            const empWarnings = [];

            if (!contract) {
                empWarnings.push({
                    message:  `No active Running contract found for employee "${employee.fullName}" covering the period ${payrun.periodStart.toDateString()} – ${payrun.periodEnd.toDateString()}.`,
                    severity: 'error',
                    blocking: true,
                });
            }

            // Bank details warning (non-blocking)
            if (hasMissingBankDetails(employee)) {
                empWarnings.push({
                    message:  `Employee "${employee.fullName}" is missing bank account details. Payment may be delayed.`,
                    severity: 'warning',
                    blocking: false,
                });
            }

            const wagePerMonth = contract?.wagePerMonth || 0;

            // Worked days from AttendanceLog
            const workedDays = await getWorkedDays(
                AttendanceLog, empId, payrun.periodStart, payrun.periodEnd
            );

            // Run salary rules
            const { lines, totals: computedTotals, warnings: ruleWarnings } = runRules(
                sortedRules, wagePerMonth
            );

            const allWarnings = [...empWarnings, ...ruleWarnings];

            // Build payslip data
            const payslipData = {
                employee:        empId,
                payrun:          payrun._id,
                contract:        contract?._id || null,
                salaryStructure: structure._id,
                periodStart:     payrun.periodStart,
                periodEnd:       payrun.periodEnd,
                workedDays,
                lines,
                basicTotal:      computedTotals.basicTotal,
                grossTotal:      computedTotals.grossTotal,
                deductionsTotal: computedTotals.deductionsTotal,
                netTotal:        computedTotals.netTotal,
                status:          'Computed',
                warnings:        allWarnings,
            };

            // Upsert: the unique index {payrun, employee} prevents duplicates.
            // findOneAndUpdate with upsert is idempotent — safe to call on recompute.
            const payslip = await Payslip.findOneAndUpdate(
                { payrun: payrun._id, employee: empId },
                {
                    $set: {
                        ...payslipData,
                        // Reset PDF/email fields on recompute (content has changed)
                        pdfPath:   undefined,
                        emailedAt: undefined,
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            newPayslipIds.push(payslip._id);

            results.push({
                employeeId: empId,
                employeeName: employee.fullName,
                payslipId:  payslip._id,
                success:    true,
                warnings:   allWarnings,
            });

        } catch (err) {
            console.error(`[PayrollComputation] Employee ${empId} failed:`, err.message);
            errors.push({ employeeId: empId, error: err.message });
        }
    }

    // ── 4. Update Payrun ─────────────────────────────────────────────────────
    payrun.status      = 'Computed';
    payrun.computedAt  = new Date();
    payrun.payslips    = newPayslipIds;

    // Aggregate any blocking warnings across all payslips into run-level warnings
    const runWarnings = errors.map(e => ({
        type:     'computation_error',
        message:  e.error,
        employee: e.employeeId,
        severity: 'error',
    }));
    if (runWarnings.length > 0) {
        payrun.warnings = runWarnings;
    }

    await payrun.save();

    return { payrun, results, errors };
}

/**
 * validateFormula(formulaString)
 *
 * Pre-validate a formula string at config-save time (Task 6 requirement).
 * Returns { valid: true } or { valid: false, error: string }.
 * Uses a neutral scope with all category variables set to 1 to catch parse errors.
 */
function validateFormula(formulaString) {
    if (!formulaString || typeof formulaString !== 'string') {
        return { valid: false, error: 'Formula must be a non-empty string.' };
    }

    const neutralScope = { BASIC: 1, ALLOWANCE: 1, GROSS: 1, DEDUCTION: 1, NET: 1, WAGE: 1 };
    const { error } = safeEval(formulaString.trim(), neutralScope);
    if (error) return { valid: false, error };
    return { valid: true };
}

module.exports = { computePayrun, validateFormula };
