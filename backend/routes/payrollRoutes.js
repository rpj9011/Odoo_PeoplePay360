// backend/routes/payrollRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Placeholder routes for the legacy percentage-based payroll UI (PayrollDashboard,
// PayrollSettings, PayrollCalculator, PayrollTable components).
//
// Role guards now use the canonical constants from config/roles.js so that all
// new HR sub-roles work correctly.  The old inline check (role === 'HR') was
// referencing a deprecated role value that no longer exists in the User model.
//
// PAYROLL_READ   = ['Admin', 'HRPayrollUser', 'HRPayrollManager']
// PAYROLL_WRITE  = ['Admin', 'HRPayrollUser', 'HRPayrollManager']
// SALARY_CONFIG_WRITE = ['Admin', 'HRPayrollManager']
//
// NOTE: All data returned by these routes is still placeholder/stub data.
// Real payroll computation (Payrun / Payslip / SalaryStructure) is implemented
// in separate routes wired to the Payrun/Payslip models.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const { PAYROLL_READ, PAYROLL_WRITE, SALARY_CONFIG_WRITE } = require('../config/roles');

// ── Role-check helpers ────────────────────────────────────────────────────────

/** Middleware factory: returns 403 if req.user.role is not in `allowedRoles`. */
function requireRoles(allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: `Access denied. Required role: one of [${allowedRoles.join(', ')}].`,
            });
        }
        next();
    };
}

const requirePayrollRead      = requireRoles(PAYROLL_READ);
const requirePayrollWrite     = requireRoles(PAYROLL_WRITE);
const requireSalaryConfigWrite = requireRoles(SALARY_CONFIG_WRITE);

// ── Settings ──────────────────────────────────────────────────────────────────

/**
 * GET /api/payroll/settings
 * Readable by all payroll roles.
 */
router.get('/settings', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const settings = {
            basicPercentage: 40,
            hraPercentage: 20,
            allowancesPercentage: 15,
            pfPercentage: 12,
            esiPercentage: 0.75,
            professionalTax: 200,
            overtimeRate: 150,
            unpaidLeaveDeduction: 1000,
            tdsPercentage: 5,
            lastUpdated: new Date(),
            updatedBy: req.user.fullName || req.user.email,
        };
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error fetching payroll settings:', error);
        res.status(500).json({ error: 'Failed to fetch payroll settings', message: error.message });
    }
});

/**
 * POST /api/payroll/settings
 * Write requires SALARY_CONFIG_WRITE (Admin or HRPayrollManager only).
 */
router.post('/settings', authenticateToken, requireSalaryConfigWrite, async (req, res) => {
    try {
        const {
            basicPercentage, hraPercentage, allowancesPercentage,
            pfPercentage, esiPercentage, professionalTax,
            overtimeRate, unpaidLeaveDeduction, tdsPercentage,
        } = req.body;

        const updatedSettings = {
            basicPercentage, hraPercentage, allowancesPercentage,
            pfPercentage, esiPercentage, professionalTax,
            overtimeRate, unpaidLeaveDeduction, tdsPercentage,
            lastUpdated: new Date(),
            updatedBy: req.user.fullName || req.user.email,
        };
        res.json({ success: true, message: 'Payroll settings updated successfully', data: updatedSettings });
    } catch (error) {
        console.error('Error updating payroll settings:', error);
        res.status(500).json({ error: 'Failed to update payroll settings', message: error.message });
    }
});

// ── Employee payroll list (stub) ───────────────────────────────────────────────

/**
 * GET /api/payroll/employees — stub list for legacy PayrollTable UI.
 * Returns real employee records (without salary computation) so the table
 * is not completely empty. Salary figures are still placeholder zeros until
 * the real Payslip computation engine is wired up.
 */
router.get('/employees', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const User = require('../models/User');
        const employees = await User.find({ isActive: true })
            .select('_id fullName email department designation employeeCode')
            .lean();

        const data = employees.map(emp => ({
            id: emp._id,
            name: emp.fullName,
            email: emp.email,
            department: emp.department || '',
            designation: emp.designation || '',
            employeeCode: emp.employeeCode || '',
            // Salary figures are 0 until the Payslip computation engine is built.
            ctc: 0, basic: 0, hra: 0, allowances: 0,
            grossPay: 0, deductions: 0, netPay: 0,
            status: 'pending',
        }));

        res.json({ success: true, data, count: data.length });
    } catch (error) {
        console.error('Error fetching payroll employees:', error);
        res.status(500).json({ error: 'Failed to fetch payroll employees', message: error.message });
    }
});

/** GET /api/payroll/employees/:id */
router.get('/employees/:id', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const User = require('../models/User');
        const emp = await User.findById(req.params.id)
            .select('_id fullName email department designation employeeCode')
            .lean();
        if (!emp) return res.status(404).json({ error: 'Employee not found.' });
        res.json({
            success: true,
            data: {
                id: emp._id, name: emp.fullName, email: emp.email,
                department: emp.department || '', designation: emp.designation || '',
                ctc: 0, basic: 0, hra: 0, allowances: 0,
                grossPay: 0, deductions: 0, netPay: 0, status: 'pending',
            },
        });
    } catch (error) {
        console.error('Error fetching employee payroll:', error);
        res.status(500).json({ error: 'Failed to fetch employee payroll', message: error.message });
    }
});

/** POST /api/payroll/employees */
router.post('/employees', authenticateToken, requirePayrollWrite, async (req, res) => {
    try {
        const saved = { ...req.body, id: req.body.id || `emp_${Date.now()}`, lastUpdated: new Date() };
        res.json({ success: true, message: 'Employee payroll saved successfully', data: saved });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save employee payroll', message: error.message });
    }
});

/** PUT /api/payroll/employees/:id */
router.put('/employees/:id', authenticateToken, requirePayrollWrite, async (req, res) => {
    try {
        const updated = { ...req.body, id: req.params.id, lastUpdated: new Date() };
        res.json({ success: true, message: 'Employee payroll updated successfully', data: updated });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update employee payroll', message: error.message });
    }
});

/** DELETE /api/payroll/employees/:id — requires salary-config write (Admin/HRPayrollManager) */
router.delete('/employees/:id', authenticateToken, requireSalaryConfigWrite, async (req, res) => {
    try {
        res.json({ success: true, message: 'Employee payroll deleted successfully', deletedId: req.params.id });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete employee payroll', message: error.message });
    }
});

// ── Payrun CRUD ───────────────────────────────────────────────────────────────

/**
 * GET /api/payroll/employees/eligible?structure=&periodStart=&periodEnd=
 * Returns employees who have an active (Running) Contract for the given period
 * and salary structure. Powers Step 2 of the Payrun wizard.
 * NOTE: this route must be registered BEFORE /employees/:id so Express doesn't
 * match "eligible" as an :id param.
 */
router.get('/employees/eligible', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const { structure, periodStart, periodEnd } = req.query;
        if (!periodStart || !periodEnd) {
            return res.status(400).json({ error: 'periodStart and periodEnd are required.' });
        }

        const Contract = require('../models/Contract');
        const start = new Date(periodStart);
        const end   = new Date(periodEnd);

        const filter = {
            status:    'Running',
            startDate: { $lte: end },
            $or: [{ endDate: null }, { endDate: { $gte: start } }],
        };
        if (structure) filter.salaryStructure = structure;

        const contracts = await Contract.find(filter)
            .populate('employee', 'fullName email department designation employeeCode')
            .populate('salaryStructure', 'name code')
            .lean();

        const employees = contracts.map(c => ({
            employeeId:      c.employee?._id,
            fullName:        c.employee?.fullName,
            email:           c.employee?.email,
            department:      c.employee?.department,
            designation:     c.employee?.designation,
            employeeCode:    c.employee?.employeeCode,
            contractId:      c._id,
            contractNumber:  c.contractNumber,
            wagePerMonth:    c.wagePerMonth,
            salaryStructure: c.salaryStructure,
        }));

        res.json({ success: true, data: employees, count: employees.length });
    } catch (error) {
        console.error('[PayrollRoutes] GET /employees/eligible error:', error);
        res.status(500).json({ error: 'Failed to fetch eligible employees', message: error.message });
    }
});

/**
 * POST /api/payroll/payruns
 * Create a new Payrun in Draft status from the wizard.
 */
router.post('/payruns', authenticateToken, requirePayrollWrite, async (req, res) => {
    try {
        const { salaryStructure, periodStart, periodEnd, employeeIds, employeeType } = req.body;

        if (!salaryStructure || !periodStart || !periodEnd) {
            return res.status(400).json({ error: 'salaryStructure, periodStart, and periodEnd are required.' });
        }
        if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({ error: 'employeeIds must be a non-empty array.' });
        }

        const Payrun = require('../models/Payrun');
        const SalaryStructure = require('../models/SalaryStructure');

        const structure = await SalaryStructure.findById(salaryStructure).select('name code').lean();
        if (!structure) return res.status(404).json({ error: 'Salary structure not found.' });

        const start = new Date(periodStart);
        const end   = new Date(periodEnd);
        const name  = `${structure.name} — ${start.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`;

        const payrun = new Payrun({
            name,
            periodStart:     start,
            periodEnd:       end,
            salaryStructure: structure._id,
            employees:       employeeIds,
            employeeType:    employeeType || 'All',
            status:          'Draft',
            createdBy:       req.user._id || req.user.id,
        });

        await payrun.save();

        const populated = await Payrun.findById(payrun._id)
            .populate('salaryStructure', 'name code')
            .populate('createdBy', 'fullName email')
            .lean();

        res.status(201).json({ success: true, data: populated });
    } catch (error) {
        console.error('[PayrollRoutes] POST /payruns error:', error);
        res.status(500).json({ error: 'Failed to create payrun', message: error.message });
    }
});

/**
 * GET /api/payroll/payruns
 * Paginated list of Payruns.
 */
router.get('/payruns', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const Payrun  = require('../models/Payrun');
        const Payslip = require('../models/Payslip');
        const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const skip  = (page - 1) * limit;

        const filter = {};
        if (req.query.status) filter.status = req.query.status;

        const [payruns, totalCount] = await Promise.all([
            Payrun.find(filter)
                .populate('salaryStructure', 'name code')
                .populate('createdBy', 'fullName email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Payrun.countDocuments(filter),
        ]);

        // Attach payslip counts for each run
        const payrunIds = payruns.map(p => p._id);
        const counts = await Payslip.aggregate([
            { $match: { payrun: { $in: payrunIds } } },
            { $group: { _id: '$payrun', count: { $sum: 1 } } },
        ]);
        const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));

        const data = payruns.map(p => ({
            ...p,
            payslipCount: countMap[String(p._id)] || 0,
        }));

        res.json({ success: true, data, totalCount, page, limit });
    } catch (error) {
        console.error('[PayrollRoutes] GET /payruns error:', error);
        res.status(500).json({ error: 'Failed to fetch payruns', message: error.message });
    }
});

/**
 * GET /api/payroll/payruns/:id
 * Single payrun with populated payslip summaries.
 */
router.get('/payruns/:id', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid payrun ID.' });
        }

        const Payrun  = require('../models/Payrun');
        const Payslip = require('../models/Payslip');

        const payrun = await Payrun.findById(req.params.id)
            .populate('salaryStructure', 'name code')
            .populate('createdBy',       'fullName email')
            .populate('validatedBy',     'fullName email')
            .populate('paidBy',          'fullName email')
            .populate('employees',       'fullName email department designation employeeCode')
            .lean();

        if (!payrun) return res.status(404).json({ error: 'Payrun not found.' });

        const payslips = await Payslip.find({ payrun: payrun._id })
            .populate('employee', 'fullName email department designation employeeCode')
            .populate('contract', 'contractNumber wagePerMonth')
            .select('employee contract status workedDays basicTotal grossTotal deductionsTotal netTotal warnings pdfPath emailedAt periodStart periodEnd')
            .lean();

        res.json({ success: true, data: { ...payrun, payslips } });
    } catch (error) {
        console.error('[PayrollRoutes] GET /payruns/:id error:', error);
        res.status(500).json({ error: 'Failed to fetch payrun', message: error.message });
    }
});

// ── Payrun lifecycle actions ───────────────────────────────────────────────────

/**
 * POST /api/payroll/payruns/:id/compute
 * Runs the payslip computation engine for the payrun.
 * Gated: PAYROLL_WRITE.
 * Guard: refuses if status is 'Paid' (immutability — also enforced by the
 *        computePayrun service itself for belt-and-suspenders).
 */
router.post('/payruns/:id/compute', authenticateToken, requirePayrollWrite, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid payrun ID.' });
        }

        const { computePayrun } = require('../services/payrollComputationService');
        const { payrun, results, errors } = await computePayrun(req.params.id);

        res.json({
            success: true,
            message: `Computation complete. ${results.length} payslip(s) created/updated. ${errors.length} error(s).`,
            data: {
                payrunId:     payrun._id,
                status:       payrun.status,
                computedAt:   payrun.computedAt,
                payslipCount: results.length,
                results,
                errors,
            },
        });
    } catch (error) {
        console.error('[PayrollRoutes] POST /payruns/:id/compute error:', error);
        const status = error.message?.includes('Paid') ? 409 : 500;
        res.status(status).json({ error: error.message });
    }
});

/**
 * POST /api/payroll/payruns/:id/validate
 * Transitions Payrun + all its Payslips from 'Computed' → 'Validated'.
 * Gated: PAYROLL_WRITE.
 * Guard: refuses if any payslip has an unresolved blocking warning.
 * Guard: refuses if Payrun.status !== 'Computed'.
 */
router.post('/payruns/:id/validate', authenticateToken, requirePayrollWrite, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid payrun ID.' });
        }

        const Payrun  = require('../models/Payrun');
        const Payslip = require('../models/Payslip');

        const payrun = await Payrun.findById(req.params.id);
        if (!payrun) return res.status(404).json({ error: 'Payrun not found.' });

        if (payrun.status !== 'Computed') {
            return res.status(409).json({
                error: `Payrun must be in 'Computed' status to validate. Current status: '${payrun.status}'.`,
            });
        }

        // Check for blocking warnings on any payslip in this run
        const payslips = await Payslip.find({ payrun: payrun._id }).lean();
        const blockingWarnings = [];
        for (const ps of payslips) {
            const blocking = (ps.warnings || []).filter(w => w.blocking === true);
            if (blocking.length > 0) {
                blockingWarnings.push({
                    payslipId:  ps._id,
                    employeeId: ps.employee,
                    warnings:   blocking,
                });
            }
        }

        if (blockingWarnings.length > 0) {
            return res.status(422).json({
                error: 'Validation blocked: one or more payslips have unresolved blocking warnings. Resolve them before validating.',
                blockingWarnings,
            });
        }

        // Transition all payslips to 'Validated'
        await Payslip.updateMany(
            { payrun: payrun._id, status: 'Computed' },
            { $set: { status: 'Validated' } }
        );

        // Transition payrun
        payrun.status      = 'Validated';
        payrun.validatedAt = new Date();
        payrun.validatedBy = req.user._id || req.user.id;
        await payrun.save();

        res.json({
            success: true,
            message: `Payrun validated. ${payslips.length} payslip(s) moved to Validated.`,
            data: { payrunId: payrun._id, status: payrun.status, validatedAt: payrun.validatedAt },
        });
    } catch (error) {
        console.error('[PayrollRoutes] POST /payruns/:id/validate error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/payroll/payruns/:id/mark-paid
 * Transitions Payrun + all its Payslips from 'Validated' → 'Paid'.
 * Gated: PAYROLL_WRITE.
 * Once Paid, the pre-save guard on Payrun/Payslip models blocks any rollback.
 */
router.post('/payruns/:id/mark-paid', authenticateToken, requirePayrollWrite, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid payrun ID.' });
        }

        const Payrun  = require('../models/Payrun');
        const Payslip = require('../models/Payslip');

        const payrun = await Payrun.findById(req.params.id);
        if (!payrun) return res.status(404).json({ error: 'Payrun not found.' });

        if (payrun.status !== 'Validated') {
            return res.status(409).json({
                error: `Payrun must be in 'Validated' status to mark as Paid. Current status: '${payrun.status}'.`,
            });
        }

        // Transition payslips first (pre-save hook on each would be too slow for bulk;
        // use updateMany and rely on the Payrun-level guard for the authoritative lock).
        await Payslip.updateMany(
            { payrun: payrun._id, status: 'Validated' },
            { $set: { status: 'Paid' } }
        );

        payrun.status = 'Paid';
        payrun.paidAt = new Date();
        payrun.paidBy = req.user._id || req.user.id;
        await payrun.save(); // pre-save immutability guard is on Payrun — this is the first Paid save, so it passes

        res.json({
            success: true,
            message: 'Payrun marked as Paid. Status is now permanently locked.',
            data: { payrunId: payrun._id, status: payrun.status, paidAt: payrun.paidAt },
        });
    } catch (error) {
        console.error('[PayrollRoutes] POST /payruns/:id/mark-paid error:', error);
        const status = error.message?.includes('locked') || error.message?.includes('Paid') ? 409 : 500;
        res.status(status).json({ error: error.message });
    }
});

// ── Individual payslip ────────────────────────────────────────────────────────

/**
 * GET /api/payroll/payslips/:id
 * Single payslip with populated employee and contract.
 * Used by the per-payslip print/detail view.
 */
router.get('/payslips/:id', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid payslip ID.' });
        }
        const Payslip = require('../models/Payslip');
        const payslip = await Payslip.findById(req.params.id)
            .populate('employee',        'fullName email department designation employeeCode')
            .populate('contract',        'contractNumber wagePerMonth')
            .populate('salaryStructure', 'name code')
            .populate('payrun',          'name periodStart periodEnd status')
            .lean();
        if (!payslip) return res.status(404).json({ error: 'Payslip not found.' });
        res.json({ success: true, data: payslip });
    } catch (error) {
        console.error('[PayrollRoutes] GET /payslips/:id error:', error);
        res.status(500).json({ error: 'Failed to fetch payslip', message: error.message });
    }
});

// ── Payslip PDF stream ────────────────────────────────────────────────────────

/**
 * GET /api/payroll/payslips/:id/pdf
 * Generates (or reuses) a PDF for a single payslip and streams it back.
 * Gated: PAYROLL_READ (employees can print their own payslip if role allows).
 *
 * Response: application/pdf binary stream with Content-Disposition: inline.
 * The frontend calls this with responseType:'blob' and opens a new tab.
 */
router.get('/payslips/:id/pdf', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid payslip ID.' });
        }

        const { generatePayslipPdf } = require('../services/payslipPdfService');
        const { buffer, filename }   = await generatePayslipPdf(req.params.id);

        res.setHeader('Content-Type',        'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Content-Length',      buffer.length);
        res.send(buffer);

    } catch (error) {
        console.error('[PayrollRoutes] GET /payslips/:id/pdf error:', error);
        if (error.message?.includes('not found')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to generate PDF', message: error.message });
    }
});

// ── Bulk send payslips via email ──────────────────────────────────────────────

/**
 * POST /api/payroll/payruns/:id/send-payslips
 * For each payslip in the payrun:
 *   1. Generate PDF (reuse pdfPath if already set)
 *   2. Send via mailService.js with PDF attachment
 *   3. Record Payslip.emailedAt on success
 * After all attempts, set Payrun.payslipsSentAt and return per-employee results.
 *
 * Spec requirement: per-employee try/catch — one bad email address must not
 * abort the whole batch.  Returns results[] array regardless.
 *
 * Gated: PAYROLL_WRITE (sending is a write action).
 */
router.post('/payruns/:id/send-payslips', authenticateToken, requirePayrollWrite, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid payrun ID.' });
        }

        const Payrun  = require('../models/Payrun');
        const Payslip = require('../models/Payslip');
        const { generatePayslipPdf } = require('../services/payslipPdfService');
        const { sendEmail }          = require('../services/mailService');

        const payrun = await Payrun.findById(req.params.id);
        if (!payrun) return res.status(404).json({ error: 'Payrun not found.' });

        if (payrun.status !== 'Paid') {
            return res.status(409).json({
                error: `Payslips can only be sent for Paid payruns. Current status: '${payrun.status}'.`,
            });
        }

        const payslips = await Payslip.find({ payrun: payrun._id })
            .populate('employee', 'fullName email')
            .lean();

        if (payslips.length === 0) {
            return res.status(422).json({ error: 'No payslips found for this payrun. Run Compute first.' });
        }

        const results = [];

        for (const ps of payslips) {
            const empName  = ps.employee?.fullName || 'Employee';
            const empEmail = ps.employee?.email;

            // Per-employee isolation — a bad email must not abort the batch
            try {
                if (!empEmail) {
                    results.push({
                        employeeId:   ps.employee?._id || ps.employee,
                        employeeName: empName,
                        email:        null,
                        success:      false,
                        error:        'No email address on record for this employee.',
                    });
                    continue;
                }

                // Generate PDF (reuse if already on disk)
                const { buffer, filename } = await generatePayslipPdf(ps._id);

                const periodLabel = `${new Date(ps.periodStart).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}`;

                await sendEmail({
                    to:      empEmail,
                    subject: `Your Payslip for ${periodLabel} — ${payrun.name}`,
                    text:    `Dear ${empName},\n\nPlease find your payslip for ${periodLabel} attached.\n\nNet Pay: ₹${(ps.netTotal || 0).toLocaleString('en-IN')}\n\nThis is a computer-generated document.\n\nRegards,\nPayroll Team`,
                    html: `
                        <p>Dear <strong>${empName}</strong>,</p>
                        <p>Please find your payslip for <strong>${periodLabel}</strong> attached.</p>
                        <table style="border-collapse:collapse; width:280px; margin:12px 0;">
                            <tr style="background:#f3f4f6;">
                                <td style="padding:6px 10px; border:1px solid #e5e7eb;">Gross Pay</td>
                                <td style="padding:6px 10px; border:1px solid #e5e7eb; text-align:right;">
                                    ₹${(ps.grossTotal || 0).toLocaleString('en-IN')}
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:6px 10px; border:1px solid #e5e7eb;">Deductions</td>
                                <td style="padding:6px 10px; border:1px solid #e5e7eb; text-align:right; color:#dc2626;">
                                    ₹${(ps.deductionsTotal || 0).toLocaleString('en-IN')}
                                </td>
                            </tr>
                            <tr style="background:#f0fdf4; font-weight:700;">
                                <td style="padding:8px 10px; border:1px solid #e5e7eb;">Net Pay</td>
                                <td style="padding:8px 10px; border:1px solid #e5e7eb; text-align:right; color:#16a34a;">
                                    ₹${(ps.netTotal || 0).toLocaleString('en-IN')}
                                </td>
                            </tr>
                        </table>
                        <p style="color:#6b7280; font-size:12px;">This is a computer-generated document.</p>
                        <p>Regards,<br/>Payroll Team</p>
                    `,
                    attachments: [{
                        filename:    filename,
                        content:     buffer,
                        contentType: 'application/pdf',
                    }],
                    isHREmail: false,
                });

                // Record emailedAt on success
                await Payslip.findByIdAndUpdate(ps._id, { $set: { emailedAt: new Date() } });

                results.push({
                    employeeId:   ps.employee?._id || ps.employee,
                    employeeName: empName,
                    email:        empEmail,
                    success:      true,
                });

            } catch (sendErr) {
                console.error(`[PayrollRoutes] send-payslips employee ${ps.employee?._id} failed:`, sendErr.message);
                results.push({
                    employeeId:   ps.employee?._id || ps.employee,
                    employeeName: empName,
                    email:        empEmail,
                    success:      false,
                    error:        sendErr.message,
                });
            }
        } // end per-employee loop

        // Mark batch timestamp regardless of partial failures
        payrun.payslipsSentAt = new Date();
        await payrun.save();

        const successCount = results.filter(r => r.success).length;
        const failCount    = results.length - successCount;

        res.json({
            success: true,
            message: `Payslips sent: ${successCount} succeeded, ${failCount} failed.`,
            results,
        });

    } catch (error) {
        console.error('[PayrollRoutes] POST /payruns/:id/send-payslips error:', error);
        res.status(500).json({ error: 'Failed to send payslips', message: error.message });
    }
});
router.get('/statistics', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const User = require('../models/User');
        const totalEmployees = await User.countDocuments({ isActive: true });
        res.json({
            success: true,
            data: {
                totalEmployees,
                totalSalaryExpense: 0,
                pendingPayrolls: 0,
                approvedPayrolls: 0,
                departmentWiseDistribution: [],
                monthlyTrend: [],
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch payroll statistics', message: error.message });
    }
});

/**
 * POST /api/payroll/calculate
 * Readable by all payroll roles — useful for the PayrollCalculator UI.
 */
router.post('/calculate', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const { ctc, overtimeHours = 0, unpaidLeaveDays = 0, bonus = 0, settings } = req.body;
        if (!ctc || !settings) {
            return res.status(400).json({ error: 'CTC and settings are required.' });
        }

        const basic = (ctc * settings.basicPercentage) / 100;
        const hra = (ctc * settings.hraPercentage) / 100;
        const allowances = (ctc * settings.allowancesPercentage) / 100;
        const grossPay = basic + hra + allowances;
        const pf = (basic * settings.pfPercentage) / 100;
        const esi = (grossPay * settings.esiPercentage) / 100;
        const tds = (grossPay * settings.tdsPercentage) / 100;
        const overtimePay = overtimeHours * settings.overtimeRate;
        const leaveDeduction = unpaidLeaveDays * settings.unpaidLeaveDeduction;
        const totalDeductions = pf + esi + settings.professionalTax + tds + leaveDeduction;
        const totalEarnings = grossPay + overtimePay + bonus;
        const netPay = totalEarnings - totalDeductions;

        res.json({
            success: true,
            data: {
                ctc, basic, hra, allowances, grossPay,
                pf, esi, professionalTax: settings.professionalTax, tds,
                overtimePay, leaveDeduction, bonus,
                totalDeductions, totalEarnings, netPay,
                monthlyNetPay: netPay / 12,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to calculate salary', message: error.message });
    }
});

module.exports = router;


// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL DASHBOARD — real aggregation endpoints
// Replaces the Math.sin() / Math.random() client-side fabrication in
// PayrollDashboard.jsx.  All figures come from real Payslip / AttendanceLog /
// LeaveRequest / Allocation documents.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/payroll/dashboard/kpis
 * ?period=YYYY-MM   (e.g. 2026-08, defaults to current month)
 * ?department=      (optional, filters payslips by employee.department)
 * ?employeeType=    (optional, matches Payrun.employeeType)
 *
 * Returns:
 *   totalNetSalaryPaid    — sum of netTotal across Paid payslips in period
 *   payslipsGenerated     — count of payslips with status Computed|Validated|Paid
 *   averageSalary         — avg netTotal of Paid payslips
 *   approvedTimeOffDays   — sum of approved LeaveRequest leaveDates in period
 *   attendanceHealthPct   — % of On-time AttendanceLogs out of all non-Leave logs in period
 *   pendingPayruns        — count of Payruns in Draft|Computed|Validated
 *   paidPayruns           — count of Paid payruns
 */
router.get('/dashboard/kpis', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const mongoose    = require('mongoose');
        const Payslip     = require('../models/Payslip');
        const Payrun      = require('../models/Payrun');
        const AttendanceLog = require('../models/AttendanceLog');
        const LeaveRequest  = require('../models/LeaveRequest');

        // ── Resolve period ──
        const periodStr = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const [yr, mo]  = periodStr.split('-').map(Number);
        const periodStart = new Date(yr, mo - 1, 1);
        const periodEnd   = new Date(yr, mo, 0, 23, 59, 59, 999);

        // ── Payslip aggregations ──
        const payslipMatch = {
            periodStart: { $lte: periodEnd },
            periodEnd:   { $gte: periodStart },
        };
        if (req.query.department) {
            // Join to User is expensive — use a two-step approach
            const User = require('../models/User');
            const empIds = await User.find({ department: req.query.department, isActive: true })
                .select('_id').lean();
            payslipMatch.employee = { $in: empIds.map(e => e._id) };
        }

        const [paidAgg, generatedCount, runStats] = await Promise.all([
            Payslip.aggregate([
                { $match: { ...payslipMatch, status: 'Paid' } },
                { $group: { _id: null, total: { $sum: '$netTotal' }, count: { $sum: 1 }, avg: { $avg: '$netTotal' } } },
            ]),
            Payslip.countDocuments({ ...payslipMatch, status: { $in: ['Computed', 'Validated', 'Paid'] } }),
            Payrun.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
        ]);

        const paid    = paidAgg[0] || {};
        const runMap  = Object.fromEntries(runStats.map(r => [r._id, r.count]));
        const pending = (runMap.Draft || 0) + (runMap.Computed || 0) + (runMap.Validated || 0);

        // ── Attendance health ──
        const pad = n => String(n).padStart(2, '0');
        const dateFrom = `${yr}-${pad(mo)}-01`;
        const dateTo   = `${yr}-${pad(mo)}-${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}`;

        const [onTimeCount, totalLogs] = await Promise.all([
            AttendanceLog.countDocuments({ attendanceDate: { $gte: dateFrom, $lte: dateTo }, attendanceStatus: 'On-time' }),
            AttendanceLog.countDocuments({ attendanceDate: { $gte: dateFrom, $lte: dateTo }, attendanceStatus: { $ne: 'Leave' } }),
        ]);
        const attendanceHealthPct = totalLogs > 0 ? Math.round((onTimeCount / totalLogs) * 100) : null;

        // ── Approved time-off days ──
        const leaveAgg = await LeaveRequest.aggregate([
            { $match: { status: 'Approved', leaveDates: { $elemMatch: { $gte: periodStart, $lte: periodEnd } } } },
            { $project: { datesInPeriod: { $filter: { input: '$leaveDates', as: 'd', cond: { $and: [{ $gte: ['$$d', periodStart] }, { $lte: ['$$d', periodEnd] }] } } } } },
            { $project: { count: { $size: '$datesInPeriod' } } },
            { $group: { _id: null, total: { $sum: '$count' } } },
        ]);
        const approvedTimeOffDays = leaveAgg[0]?.total || 0;

        res.json({
            success: true,
            data: {
                period: periodStr,
                totalNetSalaryPaid:  paid.total  || 0,
                payslipsGenerated:   generatedCount,
                averageSalary:       Math.round(paid.avg || 0),
                approvedTimeOffDays,
                attendanceHealthPct,
                pendingPayruns:      pending,
                paidPayruns:         runMap.Paid || 0,
            },
        });
    } catch (error) {
        console.error('[Dashboard] GET /kpis error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard KPIs', message: error.message });
    }
});

/**
 * GET /api/payroll/dashboard/salary-by-department
 * ?period=YYYY-MM
 * Returns array of { department, totalNet, count } from Paid payslips.
 */
router.get('/dashboard/salary-by-department', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const Payslip = require('../models/Payslip');
        const User    = require('../models/User');

        const periodStr = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const [yr, mo]  = periodStr.split('-').map(Number);
        const periodStart = new Date(yr, mo - 1, 1);
        const periodEnd   = new Date(yr, mo, 0, 23, 59, 59, 999);

        // Aggregate payslips, then join department from User
        const payslips = await Payslip.aggregate([
            { $match: { status: 'Paid', periodStart: { $lte: periodEnd }, periodEnd: { $gte: periodStart } } },
            { $group: { _id: '$employee', totalNet: { $sum: '$netTotal' }, count: { $sum: 1 } } },
        ]);

        if (payslips.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const empIds = payslips.map(p => p._id);
        const users  = await User.find({ _id: { $in: empIds } }).select('department').lean();
        const deptMap = Object.fromEntries(users.map(u => [String(u._id), u.department || 'Unknown']));

        // Roll up by department
        const byDept = {};
        for (const p of payslips) {
            const dept = deptMap[String(p._id)] || 'Unknown';
            if (!byDept[dept]) byDept[dept] = { department: dept, totalNet: 0, count: 0 };
            byDept[dept].totalNet += p.totalNet;
            byDept[dept].count   += p.count;
        }

        const data = Object.values(byDept).sort((a, b) => b.totalNet - a.totalNet);
        res.json({ success: true, data });
    } catch (error) {
        console.error('[Dashboard] GET /salary-by-department error:', error);
        res.status(500).json({ error: 'Failed to fetch salary by department', message: error.message });
    }
});

/**
 * GET /api/payroll/dashboard/monthly-trend
 * ?months=6   (default 6)
 * Returns array of { month: "Aug 2026", year, totalNet, payslipCount } for the
 * last N months, derived from Paid payslips.
 */
router.get('/dashboard/monthly-trend', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const Payslip = require('../models/Payslip');
        const months  = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));

        const now  = new Date();
        const data = [];

        for (let i = months - 1; i >= 0; i--) {
            const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const yr    = d.getFullYear();
            const mo    = d.getMonth() + 1;
            const start = new Date(yr, mo - 1, 1);
            const end   = new Date(yr, mo, 0, 23, 59, 59, 999);

            const agg = await Payslip.aggregate([
                { $match: { status: 'Paid', periodStart: { $lte: end }, periodEnd: { $gte: start } } },
                { $group: { _id: null, totalNet: { $sum: '$netTotal' }, count: { $sum: 1 } } },
            ]);

            const monthLabel = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
            data.push({
                month:        monthLabel,
                monthShort:   d.toLocaleString('en-IN', { month: 'short' }),
                year:         yr,
                totalNet:     agg[0]?.totalNet || 0,
                payslipCount: agg[0]?.count    || 0,
            });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('[Dashboard] GET /monthly-trend error:', error);
        res.status(500).json({ error: 'Failed to fetch monthly trend', message: error.message });
    }
});

/**
 * GET /api/payroll/dashboard/alerts
 * Returns live warnings from recent Payruns and Payslips.
 * Covers audit item #43 — currently no alerts endpoint existed.
 */
router.get('/dashboard/alerts', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const Payrun  = require('../models/Payrun');
        const Payslip = require('../models/Payslip');

        // Recent non-Paid payruns with warnings
        const recentRuns = await Payrun.find({
            status:   { $ne: 'Paid' },
            warnings: { $exists: true, $not: { $size: 0 } },
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .select('name status warnings periodStart periodEnd')
        .lean();

        // Payslips with unresolved blocking warnings (Computed or Validated only)
        const blockingPayslips = await Payslip.find({
            status:   { $in: ['Computed', 'Validated'] },
            'warnings.blocking': true,
        })
        .populate('employee', 'fullName')
        .populate('payrun',   'name')
        .select('employee payrun warnings status')
        .limit(50)
        .lean();

        const alerts = [];

        for (const run of recentRuns) {
            for (const w of run.warnings || []) {
                alerts.push({
                    source:    'payrun',
                    payrunId:  run._id,
                    payrunName: run.name,
                    severity:  w.severity || 'warning',
                    message:   w.message,
                    status:    run.status,
                });
            }
        }

        for (const ps of blockingPayslips) {
            const blocking = (ps.warnings || []).filter(w => w.blocking);
            for (const w of blocking) {
                alerts.push({
                    source:       'payslip',
                    payslipId:    ps._id,
                    payrunName:   ps.payrun?.name || '—',
                    employeeName: ps.employee?.fullName || '—',
                    severity:     'error',
                    message:      w.message,
                    status:       ps.status,
                });
            }
        }

        res.json({ success: true, data: alerts, count: alerts.length });
    } catch (error) {
        console.error('[Dashboard] GET /alerts error:', error);
        res.status(500).json({ error: 'Failed to fetch alerts', message: error.message });
    }
});

/**
 * GET /api/payroll/dashboard/attendance-overview
 * ?period=YYYY-MM
 * Real figures from AttendanceLog reusing the same aggregation as payrollFeed.js.
 * Covers audit item #45.
 */
router.get('/dashboard/attendance-overview', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const AttendanceLog = require('../models/AttendanceLog');

        const periodStr = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const [yr, mo]  = periodStr.split('-').map(Number);
        const pad  = n => String(n).padStart(2, '0');
        const days = new Date(yr, mo, 0).getDate();
        const from = `${yr}-${pad(mo)}-01`;
        const to   = `${yr}-${pad(mo)}-${pad(days)}`;

        const agg = await AttendanceLog.aggregate([
            { $match: { attendanceDate: { $gte: from, $lte: to } } },
            { $group: {
                _id:            '$attendanceStatus',
                count:          { $sum: 1 },
                totalWorkHours: { $sum: '$totalWorkingHours' },
            }},
        ]);

        const statusMap = {};
        let totalLogs = 0;
        for (const row of agg) {
            statusMap[row._id] = { count: row.count, totalWorkHours: Math.round(row.totalWorkHours * 100) / 100 };
            totalLogs += row.count;
        }

        const onTime   = statusMap['On-time']?.count  || 0;
        const late     = statusMap['Late']?.count     || 0;
        const halfDay  = statusMap['Half-day']?.count || 0;
        const absent   = statusMap['Absent']?.count   || 0;
        const onLeave  = statusMap['Leave']?.count    || 0;

        res.json({
            success: true,
            data: {
                period: periodStr,
                totalLogs,
                onTime,
                late,
                halfDay,
                absent,
                onLeave,
                onTimePct:  totalLogs > 0 ? Math.round((onTime  / totalLogs) * 100) : 0,
                latePct:    totalLogs > 0 ? Math.round((late    / totalLogs) * 100) : 0,
                absentPct:  totalLogs > 0 ? Math.round((absent  / totalLogs) * 100) : 0,
            },
        });
    } catch (error) {
        console.error('[Dashboard] GET /attendance-overview error:', error);
        res.status(500).json({ error: 'Failed to fetch attendance overview', message: error.message });
    }
});

/**
 * GET /api/payroll/dashboard/timeoff-overview
 * ?period=YYYY-MM
 * Real figures from LeaveRequest / Allocation.
 * Covers audit item #45.
 */
router.get('/dashboard/timeoff-overview', authenticateToken, requirePayrollRead, async (req, res) => {
    try {
        const LeaveRequest = require('../models/LeaveRequest');
        const Allocation   = require('../models/Allocation');

        const periodStr = req.query.period || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        const [yr, mo]  = periodStr.split('-').map(Number);
        const periodStart = new Date(yr, mo - 1, 1);
        const periodEnd   = new Date(yr, mo, 0, 23, 59, 59, 999);

        const [pendingCount, approvedAgg, lopAgg, confirmedAllocations] = await Promise.all([
            LeaveRequest.countDocuments({
                status: 'Pending',
                leaveDates: { $elemMatch: { $gte: periodStart, $lte: periodEnd } },
            }),
            LeaveRequest.aggregate([
                { $match: { status: 'Approved', leaveDates: { $elemMatch: { $gte: periodStart, $lte: periodEnd } } } },
                { $project: { datesInPeriod: { $filter: { input: '$leaveDates', as: 'd', cond: { $and: [{ $gte: ['$$d', periodStart] }, { $lte: ['$$d', periodEnd] }] } } } } },
                { $project: { count: { $size: '$datesInPeriod' } } },
                { $group: { _id: null, total: { $sum: '$count' }, requests: { $sum: 1 } } },
            ]),
            LeaveRequest.aggregate([
                { $match: { requestType: 'Loss of Pay', status: 'Approved', leaveDates: { $elemMatch: { $gte: periodStart, $lte: periodEnd } } } },
                { $project: { datesInPeriod: { $filter: { input: '$leaveDates', as: 'd', cond: { $and: [{ $gte: ['$$d', periodStart] }, { $lte: ['$$d', periodEnd] }] } } } } },
                { $project: { count: { $size: '$datesInPeriod' } } },
                { $group: { _id: null, total: { $sum: '$count' } } },
            ]),
            Allocation.countDocuments({ status: 'Confirmed' }),
        ]);

        res.json({
            success: true,
            data: {
                period:              periodStr,
                pendingRequests:     pendingCount,
                approvedDays:        approvedAgg[0]?.total    || 0,
                approvedRequests:    approvedAgg[0]?.requests || 0,
                lopDays:             lopAgg[0]?.total || 0,
                confirmedAllocations,
            },
        });
    } catch (error) {
        console.error('[Dashboard] GET /timeoff-overview error:', error);
        res.status(500).json({ error: 'Failed to fetch time-off overview', message: error.message });
    }
});
