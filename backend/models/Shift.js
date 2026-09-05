// backend/models/Shift.js
// ─────────────────────────────────────────────────────────────────────────────
// Working Schedule model.
//
// SCHEMA CHANGE (2026): replaced the single flat startTime/endTime/durationHours
// block with a per-day weeklyPattern (7 entries, Mon–Sun).  totalWeeklyHours is
// now computed automatically by the pre-save hook — it is never set manually.
//
// BACKWARD COMPATIBILITY: existing documents that still have the old flat fields
// will continue to be readable by Mongoose (the old paths are kept as virtual
// getters for any code that reads shiftGroup.durationHours).  Run the migration
// script  `node backend/scripts/migrate-shifts.js`  to convert them permanently.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const mongoose = require('mongoose');

// ── Day-pattern entry ─────────────────────────────────────────────────────────
const dayPatternSchema = new mongoose.Schema(
    {
        day: {
            type: String,
            enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            required: true,
        },
        isWorkingDay: { type: Boolean, default: false },
        // "HH:mm" 24-hour strings; null/undefined when isWorkingDay === false
        startTime: { type: String, default: null },
        endTime:   { type: String, default: null },
        // Paid break minutes for this day (deducted when computing hours)
        breakMinutes: { type: Number, default: 0 },
    },
    { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────
const shiftSchema = new mongoose.Schema(
    {
        shiftName: { type: String, required: true },
        shiftType: { type: String, enum: ['Fixed', 'Flexible'], required: true },

        // IANA timezone name (e.g. "Asia/Kolkata", "America/New_York").
        // Defaults to the widely-used Indian Standard Time for existing data.
        timezone: { type: String, default: 'Asia/Kolkata' },

        // Per-day schedule — always 7 entries in Mon…Sun order.
        // The pre-save hook validates and computes totalWeeklyHours from these.
        weeklyPattern: {
            type: [dayPatternSchema],
            default: () => buildDefaultPattern('Fixed'),
        },

        // Computed by pre-save hook — do NOT set this field manually.
        totalWeeklyHours: { type: Number, default: 0 },

        // ── Legacy flat fields (kept for backward compat with old documents) ──
        // These are intentionally NOT required so that new documents (which use
        // weeklyPattern instead) can be saved without them.
        startTime:        { type: String, default: null },
        endTime:          { type: String, default: null },
        durationHours:    { type: Number, default: null },
        paidBreakMinutes: { type: Number, default: 0 },
    },
    { timestamps: true }
);

// ── Helper: build a default 7-day pattern ────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Returns a default weeklyPattern array.
 * Fixed: Mon–Fri 09:00–18:00, 60 min break. Sat/Sun off.
 * Flexible: Mon–Fri working, no fixed times. Sat/Sun off.
 */
function buildDefaultPattern(shiftType) {
    return DAYS.map(day => {
        const isWeekday = !['Sat', 'Sun'].includes(day);
        if (shiftType === 'Fixed') {
            return {
                day,
                isWorkingDay:  isWeekday,
                startTime:     isWeekday ? '09:00' : null,
                endTime:       isWeekday ? '18:00' : null,
                breakMinutes:  isWeekday ? 60 : 0,
            };
        }
        // Flexible — no fixed start/end
        return { day, isWorkingDay: isWeekday, startTime: null, endTime: null, breakMinutes: 0 };
    });
}

// ── Exported helper (used by migration script) ────────────────────────────────
shiftSchema.statics.buildDefaultPattern = buildDefaultPattern;

// ── Utility: parse "HH:mm" → fractional hours ─────────────────────────────────
function parseHours(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h + m / 60;
}

/**
 * Compute total weekly hours from a weeklyPattern array.
 * For each working day:
 *   netHours = (endTime - startTime) - breakMinutes/60
 * Handles overnight shifts (endTime < startTime → add 24h).
 * Flexible days with no times contribute 0 to the total
 * (the shiftType === 'Flexible' branch below handles the overall total).
 */
function computeWeeklyHours(pattern) {
    if (!Array.isArray(pattern)) return 0;
    let total = 0;
    for (const entry of pattern) {
        if (!entry.isWorkingDay) continue;
        const start = parseHours(entry.startTime);
        const end   = parseHours(entry.endTime);
        if (start == null || end == null) continue;
        let diff = end - start;
        if (diff < 0) diff += 24;           // overnight shift
        const netHours = Math.max(0, diff - (entry.breakMinutes || 0) / 60);
        total += netHours;
    }
    return Math.round(total * 100) / 100;   // 2 decimal places
}

// ── Pre-save hook ─────────────────────────────────────────────────────────────
shiftSchema.pre('save', function (next) {
    try {
        // ── Ensure weeklyPattern is always exactly 7 entries in DAYS order ──
        if (!this.weeklyPattern || this.weeklyPattern.length !== 7) {
            this.weeklyPattern = buildDefaultPattern(this.shiftType);
        } else {
            // Patch: ensure every entry has the correct day label in order
            this.weeklyPattern = DAYS.map((day, i) => {
                const existing = this.weeklyPattern.find(e => e.day === day) || this.weeklyPattern[i] || {};
                return {
                    day,
                    isWorkingDay: !!existing.isWorkingDay,
                    startTime:    existing.startTime  || null,
                    endTime:      existing.endTime    || null,
                    breakMinutes: existing.breakMinutes || 0,
                };
            });
        }

        // ── For Flexible shifts: clear times on all days ─────────────────────
        if (this.shiftType === 'Flexible') {
            this.weeklyPattern = this.weeklyPattern.map(e => ({
                ...e,
                startTime: null,
                endTime:   null,
            }));
            // For Flexible schedules totalWeeklyHours = workingDays × 0 (no fixed times)
            // We count the number of working days × a default 8h as a nominal total,
            // but flag it clearly.  If the operator sets a nominal daily target via
            // durationHours (legacy field), honour that instead.
            const workingDays = this.weeklyPattern.filter(e => e.isWorkingDay).length;
            const dailyTarget = (this.durationHours != null && Number(this.durationHours) > 0)
                ? Number(this.durationHours)
                : 8;
            this.totalWeeklyHours = Math.round(workingDays * dailyTarget * 100) / 100;
        } else {
            // Fixed: compute from pattern
            this.totalWeeklyHours = computeWeeklyHours(this.weeklyPattern);
        }

        // ── Keep legacy durationHours in sync (used by attendance engine) ────
        // Set to average daily hours across working days so old code that reads
        // shiftGroup.durationHours still gets a reasonable value.
        const workingDayCount = this.weeklyPattern.filter(e => e.isWorkingDay).length;
        if (workingDayCount > 0) {
            this.durationHours = Math.round((this.totalWeeklyHours / workingDayCount) * 100) / 100;
        } else {
            this.durationHours = 0;
        }

        // Keep legacy startTime/endTime in sync using Monday's values (most schedules
        // have the same pattern Mon–Fri).  This lets any code still reading
        // shiftGroup.startTime keep working without changes.
        const monday = this.weeklyPattern.find(e => e.day === 'Mon');
        if (monday?.isWorkingDay) {
            this.startTime = monday.startTime || null;
            this.endTime   = monday.endTime   || null;
        }

        next();
    } catch (err) {
        next(err);
    }
});

// ── Virtual: backwards-compat accessor ───────────────────────────────────────
// Code that reads shift.weeklyHours instead of shift.totalWeeklyHours still works.
shiftSchema.virtual('weeklyHours').get(function () {
    return this.totalWeeklyHours;
});

module.exports = mongoose.model('Shift', shiftSchema);
