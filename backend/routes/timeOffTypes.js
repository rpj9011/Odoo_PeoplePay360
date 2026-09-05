// backend/routes/timeOffTypes.js
// CRUD for TimeOffType configuration records.
// GET  /api/time-off-types          — all roles (authenticated)
// GET  /api/time-off-types/:id      — all roles (authenticated)
// POST /api/time-off-types          — Admin / HRManager only
// PUT  /api/time-off-types/:id      — Admin / HRManager only
// DELETE /api/time-off-types/:id    — Admin only; blocked when Allocations reference it

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const authenticateToken = require('../middleware/authenticateToken');
const TimeOffType = require('../models/TimeOffType');
const Allocation = require('../models/Allocation');
const { HR_FAMILY } = require('../config/roles');

// ── Auth helpers ──────────────────────────────────────────────────────────────

const isAdminOrHr = (req, res, next) => {
    if (!HR_FAMILY.includes(req.user.role)) {
        return res.status(403).json({ error: 'Access forbidden: Requires Admin or HR role.' });
    }
    next();
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'Access forbidden: Requires Admin role.' });
    }
    next();
};

// ── GET /api/time-off-types ───────────────────────────────────────────────────
// Returns all time-off types. Pass ?activeOnly=true to filter inactive ones.
router.get('/', authenticateToken, async (req, res) => {
    try {
        const query = {};
        if (req.query.activeOnly === 'true') query.isActive = true;

        const types = await TimeOffType.find(query).sort({ name: 1 }).lean();
        res.json(types);
    } catch (error) {
        console.error('[TimeOffTypes] GET / error:', error);
        res.status(500).json({ error: 'Failed to fetch time-off types.' });
    }
});

// ── GET /api/time-off-types/:id ───────────────────────────────────────────────
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid ID.' });
        }
        const type = await TimeOffType.findById(req.params.id).lean();
        if (!type) return res.status(404).json({ error: 'Time-off type not found.' });
        res.json(type);
    } catch (error) {
        console.error('[TimeOffTypes] GET /:id error:', error);
        res.status(500).json({ error: 'Failed to fetch time-off type.' });
    }
});

// ── POST /api/time-off-types ──────────────────────────────────────────────────
router.post('/', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        const {
            name, unit, requiresAllocation, approvalRequired,
            includeInPayroll, legacyRequestTypeMapping, description, isActive,
        } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Name is required.' });
        }

        const existing = await TimeOffType.findOne({ name: name.trim() }).lean();
        if (existing) {
            return res.status(409).json({ error: `A time-off type named "${name.trim()}" already exists.` });
        }

        const created = await TimeOffType.create({
            name: name.trim(),
            unit: unit || 'Days',
            requiresAllocation: requiresAllocation !== undefined ? requiresAllocation : true,
            approvalRequired: approvalRequired !== undefined ? approvalRequired : true,
            includeInPayroll: includeInPayroll !== undefined ? includeInPayroll : true,
            legacyRequestTypeMapping: legacyRequestTypeMapping || null,
            description: description || '',
            isActive: isActive !== undefined ? isActive : true,
        });

        res.status(201).json({ message: 'Time-off type created successfully.', timeOffType: created });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'A time-off type with that name already exists.' });
        }
        console.error('[TimeOffTypes] POST / error:', error);
        res.status(500).json({ error: 'Failed to create time-off type.' });
    }
});

// ── PUT /api/time-off-types/:id ───────────────────────────────────────────────
router.put('/:id', [authenticateToken, isAdminOrHr], async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid ID.' });
        }

        const allowed = [
            'name', 'unit', 'requiresAllocation', 'approvalRequired',
            'includeInPayroll', 'legacyRequestTypeMapping', 'description', 'isActive',
        ];
        const updates = {};
        allowed.forEach(field => {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        });
        if (updates.name) updates.name = updates.name.trim();

        const updated = await TimeOffType.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );
        if (!updated) return res.status(404).json({ error: 'Time-off type not found.' });

        res.json({ message: 'Time-off type updated successfully.', timeOffType: updated });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'A time-off type with that name already exists.' });
        }
        console.error('[TimeOffTypes] PUT /:id error:', error);
        res.status(500).json({ error: 'Failed to update time-off type.' });
    }
});

// ── DELETE /api/time-off-types/:id ────────────────────────────────────────────
// Blocked when any Allocation references this type (integrity guard).
router.delete('/:id', [authenticateToken, isAdmin], async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid ID.' });
        }

        const refCount = await Allocation.countDocuments({ timeOffType: req.params.id });
        if (refCount > 0) {
            return res.status(409).json({
                error: `Cannot delete: ${refCount} allocation(s) reference this time-off type. ` +
                       'Archive it instead by setting isActive to false.',
            });
        }

        const deleted = await TimeOffType.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Time-off type not found.' });

        res.json({ message: 'Time-off type deleted successfully.' });
    } catch (error) {
        console.error('[TimeOffTypes] DELETE /:id error:', error);
        res.status(500).json({ error: 'Failed to delete time-off type.' });
    }
});

module.exports = router;
