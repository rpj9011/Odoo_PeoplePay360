// backend/routes/salaryConfigRoutes.js
// ─────────────────────────────────────────────────────────────────────────────
// Full CRUD for SalaryStructure and SalaryRule documents.
// Mounted at /api/salary-structures and /api/salary-rules in server.js.
//
// Access model (mirrors spec §A-salary-config):
//   GET  (list/detail)  — PAYROLL_READ  (Admin, HRPayrollUser, HRPayrollManager)
//   POST / PUT / DELETE — SALARY_CONFIG_WRITE (Admin, HRPayrollManager only)
//                         HRPayrollUser is intentionally read-only on config.
//
// Formula validation:
//   On POST/PUT of a SalaryRule with computationMethod='Formula', the formula
//   string is validated by the same expr-eval evaluator used at compute-time
//   (validateFormula from payrollComputationService).  Bad formulas are caught
//   at config-save time rather than at compute time (audit item #29 follow-up).
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const express  = require('express');
const mongoose = require('mongoose');
const router   = express.Router();

const authenticateToken = require('../middleware/authenticateToken');
const { PAYROLL_READ, SALARY_CONFIG_WRITE } = require('../config/roles');

// ── Role guards ───────────────────────────────────────────────────────────────
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
const requireRead        = requireRoles(PAYROLL_READ);
const requireConfigWrite = requireRoles(SALARY_CONFIG_WRITE);

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidId(id) { return mongoose.Types.ObjectId.isValid(id); }

// ══════════════════════════════════════════════════════════════════════════════
// SALARY RULES   /api/salary-rules
// (Rules are mounted before Structures so the populate query in Structure
//  can reference them. Order of route registration doesn't technically
//  matter, but listing leaf resources first aids readability.)
// ══════════════════════════════════════════════════════════════════════════════

const SalaryRule = require('../models/SalaryRule');

// ── GET /api/salary-rules ─────────────────────────────────────────────────────
router.get('/salary-rules', authenticateToken, requireRead, async (req, res) => {
    try {
        const filter = {};
        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive === 'true';
        }
        if (req.query.category) filter.category = req.query.category;

        const rules = await SalaryRule.find(filter)
            .sort({ sequence: 1, name: 1 })
            .lean();

        res.json({ success: true, data: rules, count: rules.length });
    } catch (err) {
        console.error('[SalaryConfig] GET /salary-rules:', err.message);
        res.status(500).json({ error: 'Failed to fetch salary rules.' });
    }
});

// ── GET /api/salary-rules/:id ─────────────────────────────────────────────────
router.get('/salary-rules/:id', authenticateToken, requireRead, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID.' });
        const rule = await SalaryRule.findById(req.params.id).lean();
        if (!rule) return res.status(404).json({ error: 'Salary rule not found.' });
        res.json({ success: true, data: rule });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch salary rule.' });
    }
});

// ── POST /api/salary-rules ────────────────────────────────────────────────────
router.post('/salary-rules', authenticateToken, requireConfigWrite, async (req, res) => {
    try {
        const {
            name, code, category, sequence, computationMethod,
            fixedAmount, percentage, percentageBaseCategory, formula, appliesTo, isActive,
        } = req.body;

        if (!name || !code || !category || !computationMethod || !appliesTo) {
            return res.status(400).json({ error: 'name, code, category, computationMethod, and appliesTo are required.' });
        }

        // Validate formula at config-save time
        if (computationMethod === 'Formula') {
            const { validateFormula } = require('../services/payrollComputationService');
            const check = validateFormula(formula);
            if (!check.valid) {
                return res.status(400).json({ error: `Invalid formula: ${check.error}` });
            }
        }

        const rule = new SalaryRule({
            name, code: code.toUpperCase().trim(),
            category, sequence: sequence ?? 10,
            computationMethod,
            fixedAmount, percentage, percentageBaseCategory, formula,
            appliesTo,
            isActive: isActive !== undefined ? isActive : true,
        });

        await rule.save();
        res.status(201).json({ success: true, data: rule });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: `A salary rule with code '${req.body.code?.toUpperCase()}' already exists.` });
        }
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        console.error('[SalaryConfig] POST /salary-rules:', err.message);
        res.status(500).json({ error: 'Failed to create salary rule.' });
    }
});

// ── PUT /api/salary-rules/:id ─────────────────────────────────────────────────
router.put('/salary-rules/:id', authenticateToken, requireConfigWrite, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID.' });

        const rule = await SalaryRule.findById(req.params.id);
        if (!rule) return res.status(404).json({ error: 'Salary rule not found.' });

        const updatable = [
            'name', 'category', 'sequence', 'computationMethod',
            'fixedAmount', 'percentage', 'percentageBaseCategory', 'formula', 'appliesTo', 'isActive',
        ];

        // Validate formula before persisting
        const incomingMethod  = req.body.computationMethod || rule.computationMethod;
        const incomingFormula = req.body.formula           ?? rule.formula;
        if (incomingMethod === 'Formula') {
            const { validateFormula } = require('../services/payrollComputationService');
            const check = validateFormula(incomingFormula);
            if (!check.valid) {
                return res.status(400).json({ error: `Invalid formula: ${check.error}` });
            }
        }

        updatable.forEach(field => {
            if (req.body[field] !== undefined) rule[field] = req.body[field];
        });

        await rule.save();
        res.json({ success: true, data: rule });
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        console.error('[SalaryConfig] PUT /salary-rules/:id:', err.message);
        res.status(500).json({ error: 'Failed to update salary rule.' });
    }
});

// ── DELETE /api/salary-rules/:id ──────────────────────────────────────────────
router.delete('/salary-rules/:id', authenticateToken, requireConfigWrite, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID.' });

        const SalaryStructure = require('../models/SalaryStructure');

        // Block deletion if any structure references this rule
        const refCount = await SalaryStructure.countDocuments({
            'salaryRules.rule': req.params.id,
        });
        if (refCount > 0) {
            return res.status(409).json({
                error: `Cannot delete: ${refCount} salary structure(s) reference this rule. Remove it from those structures first.`,
            });
        }

        const deleted = await SalaryRule.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Salary rule not found.' });

        res.json({ success: true, message: 'Salary rule deleted.', deletedId: req.params.id });
    } catch (err) {
        console.error('[SalaryConfig] DELETE /salary-rules/:id:', err.message);
        res.status(500).json({ error: 'Failed to delete salary rule.' });
    }
});

// ── POST /api/salary-rules/validate-formula ───────────────────────────────────
// Lightweight endpoint so the SalaryRuleForm can check formulas on-the-fly
// without saving anything.
router.post('/salary-rules/validate-formula', authenticateToken, requireRead, (req, res) => {
    try {
        const { formula } = req.body;
        if (!formula) return res.status(400).json({ error: 'formula is required.' });
        const { validateFormula } = require('../services/payrollComputationService');
        const result = validateFormula(formula);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: 'Formula validation error.' });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// SALARY STRUCTURES   /api/salary-structures
// ══════════════════════════════════════════════════════════════════════════════

const SalaryStructure = require('../models/SalaryStructure');

// ── GET /api/salary-structures ────────────────────────────────────────────────
router.get('/salary-structures', authenticateToken, requireRead, async (req, res) => {
    try {
        const filter = {};
        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive === 'true';
        }

        const structures = await SalaryStructure.find(filter)
            .populate('salaryRules.rule', 'name code category sequence computationMethod appliesTo isActive')
            .sort({ name: 1 })
            .lean();

        // Count contracts referencing each structure
        const Contract = require('../models/Contract');
        const structureIds = structures.map(s => s._id);
        const contractCounts = await Contract.aggregate([
            { $match: { salaryStructure: { $in: structureIds }, status: 'Running' } },
            { $group: { _id: '$salaryStructure', count: { $sum: 1 } } },
        ]);
        const countMap = Object.fromEntries(contractCounts.map(c => [String(c._id), c.count]));

        const data = structures.map(s => ({
            ...s,
            ruleCount:      s.salaryRules?.length || 0,
            employeeCount:  countMap[String(s._id)] || 0,
        }));

        res.json({ success: true, data, count: data.length });
    } catch (err) {
        console.error('[SalaryConfig] GET /salary-structures:', err.message);
        res.status(500).json({ error: 'Failed to fetch salary structures.' });
    }
});

// ── GET /api/salary-structures/:id ───────────────────────────────────────────
router.get('/salary-structures/:id', authenticateToken, requireRead, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID.' });

        const structure = await SalaryStructure.findById(req.params.id)
            .populate('salaryRules.rule', 'name code category sequence computationMethod fixedAmount percentage percentageBaseCategory formula appliesTo isActive')
            .lean();

        if (!structure) return res.status(404).json({ error: 'Salary structure not found.' });

        res.json({ success: true, data: structure });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch salary structure.' });
    }
});

// ── POST /api/salary-structures ───────────────────────────────────────────────
router.post('/salary-structures', authenticateToken, requireConfigWrite, async (req, res) => {
    try {
        const { name, code, description, salaryRules, isActive } = req.body;

        if (!name) return res.status(400).json({ error: 'name is required.' });
        if (!code) return res.status(400).json({ error: 'code is required.' });

        // Validate that all referenced rule IDs exist
        if (salaryRules && salaryRules.length > 0) {
            const ruleIds = salaryRules.map(r => r.rule || r);
            const found   = await SalaryRule.countDocuments({ _id: { $in: ruleIds } });
            if (found !== ruleIds.length) {
                return res.status(400).json({ error: 'One or more salary rule IDs do not exist.' });
            }
        }

        const structure = new SalaryStructure({
            name,
            code:        code.toUpperCase().trim(),
            description: description || '',
            salaryRules: (salaryRules || []).map((r, i) => ({
                rule:     r.rule || r,
                sequence: r.sequence ?? (i + 1) * 10,
            })),
            isActive: isActive !== undefined ? isActive : true,
        });

        await structure.save();

        const populated = await SalaryStructure.findById(structure._id)
            .populate('salaryRules.rule', 'name code category sequence computationMethod appliesTo')
            .lean();

        res.status(201).json({ success: true, data: populated });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: `A salary structure with code '${req.body.code?.toUpperCase()}' already exists.` });
        }
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        console.error('[SalaryConfig] POST /salary-structures:', err.message);
        res.status(500).json({ error: 'Failed to create salary structure.' });
    }
});

// ── PUT /api/salary-structures/:id ────────────────────────────────────────────
router.put('/salary-structures/:id', authenticateToken, requireConfigWrite, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID.' });

        const structure = await SalaryStructure.findById(req.params.id);
        if (!structure) return res.status(404).json({ error: 'Salary structure not found.' });

        const updatable = ['name', 'description', 'isActive'];
        updatable.forEach(field => {
            if (req.body[field] !== undefined) structure[field] = req.body[field];
        });

        // salaryRules replacement (full replace — caller sends the full ordered array)
        if (req.body.salaryRules !== undefined) {
            if (req.body.salaryRules.length > 0) {
                const ruleIds = req.body.salaryRules.map(r => r.rule || r);
                const found   = await SalaryRule.countDocuments({ _id: { $in: ruleIds } });
                if (found !== ruleIds.length) {
                    return res.status(400).json({ error: 'One or more salary rule IDs do not exist.' });
                }
            }
            structure.salaryRules = req.body.salaryRules.map((r, i) => ({
                rule:     r.rule || r,
                sequence: r.sequence ?? (i + 1) * 10,
            }));
        }

        await structure.save();

        const populated = await SalaryStructure.findById(structure._id)
            .populate('salaryRules.rule', 'name code category sequence computationMethod appliesTo')
            .lean();

        res.json({ success: true, data: populated });
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: err.message });
        }
        console.error('[SalaryConfig] PUT /salary-structures/:id:', err.message);
        res.status(500).json({ error: 'Failed to update salary structure.' });
    }
});

// ── DELETE /api/salary-structures/:id ─────────────────────────────────────────
router.delete('/salary-structures/:id', authenticateToken, requireConfigWrite, async (req, res) => {
    try {
        if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Invalid ID.' });

        // Block if any Running contracts reference this structure
        const Contract = require('../models/Contract');
        const refCount  = await Contract.countDocuments({
            salaryStructure: req.params.id,
            status:          'Running',
        });
        if (refCount > 0) {
            return res.status(409).json({
                error: `Cannot delete: ${refCount} Running contract(s) use this structure. Reassign those contracts first.`,
            });
        }

        const deleted = await SalaryStructure.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Salary structure not found.' });

        res.json({ success: true, message: 'Salary structure deleted.', deletedId: req.params.id });
    } catch (err) {
        console.error('[SalaryConfig] DELETE /salary-structures/:id:', err.message);
        res.status(500).json({ error: 'Failed to delete salary structure.' });
    }
});

module.exports = router;
