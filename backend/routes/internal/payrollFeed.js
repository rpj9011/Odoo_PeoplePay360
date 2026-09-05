// backend/routes/internal/payrollFeed.js
//
// Internal-only read-only API consumed by salary-service.
// Returns attendance and leave summary for one employee for one month.
//
// ── Security ──────────────────────────────────────────────────────────────────
// Protected by X-Service-Token header (separate from user JWT auth).
// SERVICE_TOKEN must be set in AMS's .env — same value as salary-service's env.
// At the network/reverse-proxy level, this route group should be restricted to
// salary-service's server IP only (belt-and-suspenders over the token check).
//
// This route NEVER returns PII beyond employeeId + name.
// It NEVER shares: bank details, PAN, passwords, JWT secrets, or session data.
//
// ── Response shape ─────────────────────────────────────────────────────────────
// {
//   employeeId, employeeName,
//   month, year, workingDays,
//   presentDays, paidLeaveDays, unpaidLeaveDays, halfDays, lopDays, overtimeHours
// }
'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const mongoose = require('mongoose');

// ─── Service-token middleware (inline — separate from authenticateToken) ───────
// This is intentionally NOT reusing authenticateToken. A bug in the user auth
// path cannot accidentally expose this internal route, and vice versa.
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
        // SERVICE_TOKEN not configured on AMS side — refuse to serve
        console.error('[PayrollFeed] SERVICE_TOKEN is not set in AMS .env — rejecting request');
        return res.status(503).json({ error: 'Internal feed not configured' });
    }
    if (!provided || !safeCompare(provided, expected)) {
        console.warn(`[PayrollFeed] Invalid service token from ${req.ip}`);
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

// ─── GET /internal/payroll-feed/:employeeId?month=&year= ──────────────────────
router.get('/:employeeId', requireServiceToken, async (req, res) => {
    const { employeeId } = req.params;
    const month = parseInt(req.query.month, 10);
    const year  = parseInt(req.query.year,  10);

    if (!month || month < 1 || month > 12 || !year || year < 2020) {
        return res.status(400).json({ error: 'Valid month (1–12) and year (>=2020) are required' });
    }

    try {
        const User = require('../../models/User');
        const AttendanceLog  = require('../../models/AttendanceLog');
        const LeaveRequest   = require('../../models/LeaveRequest');

        // Resolve AMS User from employeeId string (custom field) or _id
        let user;
        if (mongoose.Types.ObjectId.isValid(employeeId)) {
            user = await User.findById(employeeId).select('_id fullName employeeId').lean();
        }
        if (!user) {
            user = await User.findOne({ employeeId }).select('_id fullName employeeId').lean();
        }
        if (!user) {
            return res.status(404).json({ error: `Employee ${employeeId} not found in AMS` });
        }

        // ── Build date range strings (YYYY-MM-DD) for the given month ──────────
        const padded    = String(month).padStart(2, '0');
        const daysInMonth = new Date(year, month, 0).getDate();
        const dateFrom  = `${year}-${padded}-01`;
        const dateTo    = `${year}-${padded}-${String(daysInMonth).padStart(2, '0')}`;

        // ── Attendance logs for the month ──────────────────────────────────────
        const logs = await AttendanceLog.find({
            user: user._id,
            attendanceDate: { $gte: dateFrom, $lte: dateTo },
        }).lean();

        let presentDays   = 0;
        let halfDays      = 0;
        let totalWorkHours = 0;

        for (const log of logs) {
            const status = log.attendanceStatus;
            if (status === 'On-time' || status === 'Late') {
                if (log.isHalfDay) {
                    halfDays += 1;
                } else {
                    presentDays += 1;
                }
            } else if (status === 'Half-day') {
                halfDays += 1;
            }
            totalWorkHours += (log.totalWorkingHours || 0);
        }

        // ── Approved leave requests that fall within the month ─────────────────
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd   = new Date(year, month, 0, 23, 59, 59, 999);

        const leaveRequests = await LeaveRequest.find({
            employee: user._id,
            status:   'Approved',
            leaveDates: { $elemMatch: { $gte: monthStart, $lte: monthEnd } },
        }).lean();

        let paidLeaveDays   = 0;
        let unpaidLeaveDays = 0;
        let lopDays         = 0;

        for (const lr of leaveRequests) {
            // Count only leaveDates that fall within this month
            const datesInMonth = (lr.leaveDates || []).filter(d => {
                const dt = new Date(d);
                return dt >= monthStart && dt <= monthEnd;
            });

            const count = datesInMonth.length;
            // Half-day leaves count as 0.5
            const leaveType = lr.leaveType || 'Full Day';
            const dayCount  = (leaveType !== 'Full Day') ? count * 0.5 : count;

            if (lr.requestType === 'Loss of Pay') {
                lopDays         += dayCount;
                unpaidLeaveDays += dayCount;
            } else if (lr.requestType === 'Compensatory' || lr.requestType === 'Comp-Off') {
                paidLeaveDays += dayCount; // comp-off is paid
            } else {
                // Planned, Sick, Casual, Backdated — check dayTypeAllocations for LOP splits
                if (lr.dayTypeAllocations && lr.dayTypeAllocations.length > 0) {
                    for (const alloc of lr.dayTypeAllocations) {
                        const allocDate = new Date(alloc.date);
                        if (allocDate >= monthStart && allocDate <= monthEnd) {
                            if (alloc.requestType === 'Loss of Pay') {
                                lopDays         += leaveType !== 'Full Day' ? 0.5 : 1;
                                unpaidLeaveDays += leaveType !== 'Full Day' ? 0.5 : 1;
                            } else {
                                paidLeaveDays += leaveType !== 'Full Day' ? 0.5 : 1;
                            }
                        }
                    }
                } else {
                    paidLeaveDays += dayCount;
                }
            }
        }

        // Overtime hours — hours beyond standard shift (simple: totalWorkHours - standard * presentDays)
        // Exposing raw totalWorkHours; salary-service will compute overtime against its own settings
        const overtimeHours = Math.max(0, Math.round((totalWorkHours - (presentDays * 8)) * 100) / 100);

        // Working days in the month (Mon–Sat by default — salary-service has standardWorkingDays setting)
        const workingDays = countWorkingDays(year, month);

        return res.json({
            data: {
                employeeId:     employeeId,
                employeeName:   user.fullName || '',
                month,
                year,
                workingDays,
                presentDays,
                halfDays,
                paidLeaveDays,
                unpaidLeaveDays,
                lopDays,
                overtimeHours,
                // Raw hours for salary-service to use with its own overtime rate
                totalWorkHours: Math.round(totalWorkHours * 100) / 100,
            },
        });

    } catch (err) {
        console.error('[PayrollFeed] Error:', err.message, { employeeId, month, year });
        return res.status(500).json({ error: 'Failed to fetch payroll feed data' });
    }
});

// ─── Helper: count working days (Mon–Sat) in a month ──────────────────────────
function countWorkingDays(year, month) {
    let count = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const dow = new Date(year, month - 1, d).getDay();
        if (dow !== 0) count++; // 0 = Sunday
    }
    return count;
}

module.exports = router;
