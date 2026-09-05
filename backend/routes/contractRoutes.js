// backend/routes/contractRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// CRUD routes for Contract documents.
// Mounted at /api/admin/contracts in server.js.
//
// Access:
//   GET  (list/detail) — HR_FAMILY (Admin, HRManager, HRPayrollUser, HRPayrollManager)
//   POST / PUT         — HR_FAMILY (all four roles manage contracts per spec §A2)
//   DELETE             — HR_FAMILY
//
// The Contract model's pre-save hook enforces overlap validation for Running
// contracts; this file surfaces those errors as 400 responses.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const express    = require('express');
const mongoose   = require('mongoose');
const router     = express.Router();

const authenticateToken = require('../middleware/authenticateToken');
const isAdminOrHr       = require('../middleware/requireAdminOrHr');   // allows HR_FAMILY
const Contract          = require('../models/Contract');
const User              = require('../models/User');
const SalaryStructure   = require('../models/SalaryStructure');
const Shift             = require('../models/Shift');

// All routes in this file require authentication + HR_FAMILY role.
router.use(authenticateToken, isAdminOrHr);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True when a mongoose validation/pre-save error should be a 400, not a 500 */
function isClientError(err) {
    return (
        err.name === 'ValidationError' ||
        // overlap error thrown from pre-save hook
        (err.name === 'Error' && err.message?.includes('Running contract'))
    );
}

// ── GET /api/admin/contracts ──────────────────────────────────────────────────
// Paginated list.  Supports:
//   ?employee=<id>   — filter by employee ObjectId
//   ?status=         — filter by status enum value
//   ?page=           — 1-based page number (default 1)
//   ?limit=          — page size (default 15, max 100)
router.get('/', async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page,  10) || 1);
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 15));
        const skip   = (page - 1) * limit;

        const filter = {};

        if (req.query.employee) {
            if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
                return res.status(400).json({ error: 'Invalid employee ID.' });
            }
            filter.employee = new mongoose.Types.ObjectId(req.query.employee);
        }

        if (req.query.status) {
            const allowed = ['Draft', 'Running', 'Expired', 'Cancelled'];
            if (!allowed.includes(req.query.status)) {
                return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}.` });
            }
            filter.status = req.query.status;
        }

        const [contracts, totalCount] = await Promise.all([
            Contract.find(filter)
                .populate('employee',        'fullName employeeCode department')
                .populate('workingSchedule', 'shiftName shiftType totalWeeklyHours')
                .populate('salaryStructure', 'name code')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Contract.countDocuments(filter),
        ]);

        res.json({ contracts, totalCount, page, limit });
    } catch (err) {
        console.error('[ContractRoutes] GET / error:', err.message);
        res.status(500).json({ error: 'Failed to fetch contracts.' });
    }
});

// ── GET /api/admin/contracts/:id ──────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid contract ID.' });
        }

        const contract = await Contract.findById(req.params.id)
            .populate('employee',        'fullName employeeCode department designation')
            .populate('workingSchedule', 'shiftName shiftType totalWeeklyHours timezone')
            .populate('salaryStructure', 'name code isActive')
            .lean();

        if (!contract) return res.status(404).json({ error: 'Contract not found.' });

        res.json(contract);
    } catch (err) {
        console.error('[ContractRoutes] GET /:id error:', err.message);
        res.status(500).json({ error: 'Failed to fetch contract.' });
    }
});

// ── POST /api/admin/contracts ─────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const {
            employee, startDate, endDate, status,
            department, jobPosition, wagePerMonth,
            workingSchedule, salaryStructure, notes,
        } = req.body;

        if (!employee || !mongoose.Types.ObjectId.isValid(employee)) {
            return res.status(400).json({ error: 'A valid employee ID is required.' });
        }
        if (!startDate) {
            return res.status(400).json({ error: 'startDate is required.' });
        }
        if (wagePerMonth == null || isNaN(Number(wagePerMonth))) {
            return res.status(400).json({ error: 'wagePerMonth must be a number.' });
        }

        // Verify employee exists
        const emp = await User.findById(employee).select('_id').lean();
        if (!emp) return res.status(404).json({ error: 'Employee not found.' });

        const contract = new Contract({
            employee,
            startDate,
            endDate:          endDate   || null,
            status:           status    || 'Draft',
            department:       department    || '',
            jobPosition:      jobPosition   || '',
            wagePerMonth:     Number(wagePerMonth),
            workingSchedule:  workingSchedule  || null,
            salaryStructure:  salaryStructure  || null,
            notes:            notes || '',
        });

        await contract.save();                       // pre-save hook enforces overlap

        const populated = await Contract.findById(contract._id)
            .populate('employee',        'fullName employeeCode')
            .populate('workingSchedule', 'shiftName shiftType')
            .populate('salaryStructure', 'name code')
            .lean();

        res.status(201).json(populated);
    } catch (err) {
        if (isClientError(err)) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[ContractRoutes] POST / error:', err.message);
        res.status(500).json({ error: 'Failed to create contract.' });
    }
});

// ── PUT /api/admin/contracts/:id ──────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid contract ID.' });
        }

        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found.' });

        const allowed = [
            'startDate', 'endDate', 'status', 'department', 'jobPosition',
            'wagePerMonth', 'workingSchedule', 'salaryStructure', 'notes',
        ];

        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                // Normalise: empty string → null for nullable ObjectId/date fields
                const nullable = ['endDate', 'workingSchedule', 'salaryStructure'];
                contract[field] = (nullable.includes(field) && req.body[field] === '')
                    ? null
                    : req.body[field];
            }
        });

        await contract.save();                       // pre-save hook re-validates overlap

        const populated = await Contract.findById(contract._id)
            .populate('employee',        'fullName employeeCode')
            .populate('workingSchedule', 'shiftName shiftType')
            .populate('salaryStructure', 'name code')
            .lean();

        res.json(populated);
    } catch (err) {
        if (isClientError(err)) {
            return res.status(400).json({ error: err.message });
        }
        console.error('[ContractRoutes] PUT /:id error:', err.message);
        res.status(500).json({ error: 'Failed to update contract.' });
    }
});

// ── DELETE /api/admin/contracts/:id ───────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid contract ID.' });
        }

        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found.' });

        // TODO: Block delete once Payslip model is used in real payrun computation —
        //       a contract referenced by any Payslip should not be deleted.
        //   const { count } = await Payslip.countDocuments({ contract: contract._id });
        //   if (count > 0) return res.status(409).json({ error: 'Cannot delete a contract that has associated payslips.' });

        await contract.deleteOne();

        res.json({ message: 'Contract deleted successfully.', deletedId: req.params.id });
    } catch (err) {
        console.error('[ContractRoutes] DELETE /:id error:', err.message);
        res.status(500).json({ error: 'Failed to delete contract.' });
    }
});

module.exports = router;
