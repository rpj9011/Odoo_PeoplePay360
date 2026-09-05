// backend/routes/allocations.js
// Allocation lifecycle: Draft → Confirmed (grants entitlement) | Refused.
//
// GET    /api/allocations               — query ?employee=<id>&status=<status>&timeOffType=<id>
// GET    /api/allocations/:id           — single allocation with populated refs
// POST   /api/allocations               — create as Draft (Admin/HR)
// PUT    /api/allocations/:id           — edit while still Draft (Admin/HR)
// POST   /api/allocations/:id/confirm   — Confirm a Draft allocation (Admin/HRManager only)
// POST   /api/allocations/:id/refuse    — Refuse a Draft allocation (Admin/HRManager only)

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const authenticateToken = require('../middleware/authenticateToken');
const Allocation = require('../models/Allocation');
const TimeOffType = require('../models/TimeOffType');
const User = require('../models/User');
const { HR_FAMILY } = require('../config/roles');

// ── Auth helpers ──────────────────────────────────────────────────────────────

const isAdminOrHr = (req, res, next) => {
    if (!HR_FAMILY.includes(req.user.role)) {
        return res.status(403).json({ error: 'Access forbidden: Requires Admin or HR role.' });
    }
    next();
};

// Only Admin + HRManager can confirm/refuse (not payroll-only roles)
const isAdminOrHrManager = (req, res, next) => {
    if (!['Admin', 'HRManager'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access forbidden: Requires Admin or HRManager role.' });
    }
    next();
};

// ── GET /api/allocations ──────────────────────────────────────────────────────
router.get('/', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const query = {};

        if (req.query.employee) {
            if (!mongoose.Types.ObjectId.isValid(req.query.employee)) {
                return res.status(400).json({ error: 'Invalid employee ID.' });
            }
            query.employee = req.query.employee;
        }

        if (req.query.status) {
            const statuses = req.query.status.split(',').map(s => s.trim());
            const validStatuses = ['Draft', 'Confirmed', 'Refused'];
            const invalid = statuses.filter(s => !validStatuses.includes(s));
            if (invalid.length) {
                return res.status(400).json({ error: `Invalid status value(s): ${invalid.join(', ')}` });
            }
            query.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
        }

        if (req.query.timeOffType) {
            if (!mongoose.Types.ObjectId.isValid(req.query.timeOffType)) {
                return res.status(400).json({ error: 'Invalid timeOffType ID.' });
            }
            query.timeOffType = req.query.timeOffType;
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const [total, allocations] = await Promise.all([
            Allocation.countDocuments(query),
            Allocation.find(query)
                .populate('employee', 'fullName employeeCode department email profileImageUrl')
                .populate('timeOffType', 'name unit requiresAllocation')
                .populate('approvedBy', 'fullName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
        ]);

        res.json({
            allocations,
            totalCount: total,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('[Allocations] GET / error:', error);
        res.status(500).json({ error: 'Failed to fetch allocations.' });
    }
});

// ── GET /api/allocations/:id ──────────────────────────────────────────────────
router.get('/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid ID.' });
        }
        const allocation = await Allocation.findById(req.params.id)
            .populate('employee', 'fullName employeeCode department email profileImageUrl')
            .populate('timeOffType', 'name unit requiresAllocation legacyRequestTypeMapping')
            .populate('approvedBy', 'fullName');

        if (!allocation) return res.status(404).json({ error: 'Allocation not found.' });
        res.json(allocation);
    } catch (error) {
        console.error('[Allocations] GET /:id error:', error);
        res.status(500).json({ error: 'Failed to fetch allocation.' });
    }
});

// ── POST /api/allocations ─────────────────────────────────────────────────────
router.post('/', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const { employee, timeOffType, allocatedAmount, validFrom, validTo, notes } = req.body;

        if (!employee || !mongoose.Types.ObjectId.isValid(employee)) {
            return res.status(400).json({ error: 'A valid employee ID is required.' });
        }
        if (!timeOffType || !mongoose.Types.ObjectId.isValid(timeOffType)) {
            return res.status(400).json({ error: 'A valid timeOffType ID is required.' });
        }
        if (allocatedAmount === undefined || allocatedAmount === null || isNaN(Number(allocatedAmount)) || Number(allocatedAmount) < 0) {
            return res.status(400).json({ error: 'allocatedAmount must be a non-negative number.' });
        }

        // Verify referenced documents exist
        const [employeeDoc, typeDoc] = await Promise.all([
            User.findById(employee).select('_id fullName').lean(),
            TimeOffType.findById(timeOffType).select('_id name isActive').lean(),
        ]);
        if (!employeeDoc) return res.status(404).json({ error: 'Employee not found.' });
        if (!typeDoc) return res.status(404).json({ error: 'Time-off type not found.' });
        if (!typeDoc.isActive) {
            return res.status(400).json({ error: 'Cannot create an allocation for an inactive time-off type.' });
        }

        const allocation = await Allocation.create({
            employee,
            timeOffType,
            allocatedAmount: Number(allocatedAmount),
            takenAmount: 0,
            validFrom: validFrom ? new Date(validFrom) : null,
            validTo: validTo ? new Date(validTo) : null,
            status: 'Draft',
            notes: notes || '',
        });

        const populated = await allocation.populate([
            { path: 'employee', select: 'fullName employeeCode department' },
            { path: 'timeOffType', select: 'name unit' },
        ]);

        res.status(201).json({ message: 'Allocation created successfully.', allocation: populated });
    } catch (error) {
        console.error('[Allocations] POST / error:', error);
        res.status(500).json({ error: 'Failed to create allocation.' });
    }
});

// ── PUT /api/allocations/:id ──────────────────────────────────────────────────
// Only editable while still Draft.
router.put('/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid ID.' });
        }

        const allocation = await Allocation.findById(req.params.id);
        if (!allocation) return res.status(404).json({ error: 'Allocation not found.' });

        if (allocation.status !== 'Draft') {
            return res.status(400).json({
                error: `Cannot edit an allocation with status "${allocation.status}". Only Draft allocations can be edited.`,
            });
        }

        const allowed = ['allocatedAmount', 'validFrom', 'validTo', 'notes', 'timeOffType', 'employee'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) {
                if (field === 'validFrom' || field === 'validTo') {
                    allocation[field] = req.body[field] ? new Date(req.body[field]) : null;
                } else if (field === 'allocatedAmount') {
                    allocation[field] = Number(req.body[field]);
                } else {
                    allocation[field] = req.body[field];
                }
            }
        });

        await allocation.save();

        const populated = await allocation.populate([
            { path: 'employee', select: 'fullName employeeCode department' },
            { path: 'timeOffType', select: 'name unit' },
        ]);

        res.json({ message: 'Allocation updated successfully.', allocation: populated });
    } catch (error) {
        console.error('[Allocations] PUT /:id error:', error);
        res.status(500).json({ error: 'Failed to update allocation.' });
    }
});

// ── POST /api/allocations/:id/confirm ────────────────────────────────────────
// Transitions Draft → Confirmed. This is the act of "granting" the entitlement.
router.post('/:id/confirm', [authenticateToken, isAdminOrHrManager], async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid ID.' });
        }

        const allocation = await Allocation.findById(req.params.id);
        if (!allocation) return res.status(404).json({ error: 'Allocation not found.' });

        if (allocation.status !== 'Draft') {
            return res.status(400).json({
                error: `Cannot confirm an allocation with status "${allocation.status}".`,
            });
        }

        allocation.status = 'Confirmed';
        allocation.approvedBy = req.user.userId;
        allocation.approvedAt = new Date();
        await allocation.save();

        const populated = await allocation.populate([
            { path: 'employee', select: 'fullName employeeCode department' },
            { path: 'timeOffType', select: 'name unit' },
            { path: 'approvedBy', select: 'fullName' },
        ]);

        res.json({ message: 'Allocation confirmed successfully.', allocation: populated });
    } catch (error) {
        console.error('[Allocations] POST /:id/confirm error:', error);
        res.status(500).json({ error: 'Failed to confirm allocation.' });
    }
});

// ── POST /api/allocations/:id/refuse ─────────────────────────────────────────
router.post('/:id/refuse', [authenticateToken, isAdminOrHrManager], async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid ID.' });
        }

        const allocation = await Allocation.findById(req.params.id);
        if (!allocation) return res.status(404).json({ error: 'Allocation not found.' });

        if (allocation.status !== 'Draft') {
            return res.status(400).json({
                error: `Cannot refuse an allocation with status "${allocation.status}".`,
            });
        }

        allocation.status = 'Refused';
        allocation.approvedBy = req.user.userId;
        allocation.approvedAt = new Date();
        if (req.body.notes) allocation.notes = req.body.notes;
        await allocation.save();

        const populated = await allocation.populate([
            { path: 'employee', select: 'fullName employeeCode department' },
            { path: 'timeOffType', select: 'name unit' },
            { path: 'approvedBy', select: 'fullName' },
        ]);

        res.json({ message: 'Allocation refused.', allocation: populated });
    } catch (error) {
        console.error('[Allocations] POST /:id/refuse error:', error);
        res.status(500).json({ error: 'Failed to refuse allocation.' });
    }
});

module.exports = router;
