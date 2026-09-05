// backend/routes/internal/employeeFeed.js
//
// Internal-only read-only API consumed by salary-service.
// Returns employee list from AMS for creating financial profiles.
//
// ── Security ──────────────────────────────────────────────────────────────────
// Protected by X-Service-Token header (separate from user JWT auth).
// SERVICE_TOKEN must be set in AMS's .env — same value as salary-service's env.
// At the network/reverse-proxy level, this route group should be restricted to
// salary-service's server IP only (belt-and-suspenders over the token check).
//
// This route NEVER returns PII beyond employeeId + name + basic info.
// It NEVER shares: bank details, PAN, passwords, JWT secrets, or session data.
//
// ── Response shape ─────────────────────────────────────────────────────────────
// {
//   employees: [
//     { employeeId, fullName, email, department, designation, isActive, employmentStatus }
//   ]
// }
'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

// ─── Service-token middleware (inline — separate from authenticateToken) ───────
function safeCompare(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

function requireServiceToken(req, res, next) {
    const provided = req.headers['x-service-token'];
    const expected = process.env.SERVICE_TOKEN;

    if (!expected) {
        console.error('[EmployeeFeed] SERVICE_TOKEN is not set in AMS .env — rejecting request');
        return res.status(503).json({ error: 'Internal feed not configured' });
    }
    if (!provided || !safeCompare(provided, expected)) {
        console.warn(`[EmployeeFeed] Invalid service token from ${req.ip}`);
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

// ─── GET /internal/employees ──────────────────────────────────────────────
router.get('/', requireServiceToken, async (req, res) => {
    try {
        const User = require('../../models/User');
        
        // Fetch all employees (excluding Admin role) with minimal fields
        const employees = await User.find({ 
            role: { $ne: 'Admin' } 
        })
        .select('_id employeeCode fullName email department designation isActive employmentStatus joiningDate')
        .sort({ fullName: 1 })
        .lean();

        // Map to a clean format
        const employeeList = employees.map(emp => ({
            employeeId: emp.employeeCode || emp._id.toString(),
            fullName: emp.fullName || '',
            email: emp.email || '',
            department: emp.department || '',
            designation: emp.designation || '',
            isActive: emp.isActive !== false,
            employmentStatus: emp.employmentStatus || 'On-Role',
            joiningDate: emp.joiningDate || null
        }));

        return res.json({
            data: {
                employees: employeeList,
                count: employeeList.length
            }
        });

    } catch (err) {
        console.error('[EmployeeFeed] Error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch employee list' });
    }
});

module.exports = router;
