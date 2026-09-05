#!/usr/bin/env node
// backend/scripts/migrate-shifts.js
// ─────────────────────────────────────────────────────────────────────────────
// One-time migration: convert existing Shift documents from the old flat schema
// (startTime / endTime / durationHours) to the new weeklyPattern + timezone schema.
//
// WHAT IT DOES
// ────────────
// For each Shift document that lacks a weeklyPattern (or has an incomplete one):
//   1. Builds a Mon–Fri weeklyPattern from the legacy startTime/endTime/paidBreakMinutes.
//   2. Sets timezone to 'Asia/Kolkata' (the project default) if absent.
//   3. Recomputes totalWeeklyHours via the model's helper.
//   4. Preserves the legacy fields (startTime, endTime, durationHours) for backward compat.
//
// SAFE TO RE-RUN
// ─────────────
// Skips any document that already has a complete 7-entry weeklyPattern.
//
// USAGE
// ─────
//   node backend/scripts/migrate-shifts.js
//
// The script reads MONGODB_URI from backend/.env automatically.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Colours for console output (same helpers as seed.js)
const OK   = (msg) => console.log(`  ✅  ${msg}`);
const SKIP = (msg) => console.log(`  ⏭️   ${msg}`);
const WARN = (msg) => console.warn(`  ⚠️   ${msg}`);
const INFO = (msg) => console.log(`\n──  ${msg}`);

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌  MONGODB_URI not set in backend/.env');
        process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('🔌  Connected to MongoDB');

    // Load the updated model (which has buildDefaultPattern as a static)
    const Shift = require('../models/Shift');

    INFO('Migrating Shift documents to weeklyPattern schema…');

    const shifts = await Shift.find({}).lean();
    console.log(`   Found ${shifts.length} shift document(s) total.`);

    let migrated = 0;
    let skipped  = 0;

    for (const doc of shifts) {
        // Already migrated: has a complete 7-entry weeklyPattern
        if (Array.isArray(doc.weeklyPattern) && doc.weeklyPattern.length === 7) {
            SKIP(`${doc.shiftName} — already has weeklyPattern (7 entries).`);
            skipped++;
            continue;
        }

        // Build pattern from legacy fields
        const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        const legacyStart = doc.startTime || null;
        const legacyEnd   = doc.endTime   || null;
        const legacyBreak = doc.paidBreakMinutes || 0;

        const weeklyPattern = DAYS.map(day => {
            const isWeekday = !['Sat', 'Sun'].includes(day);

            if (!isWeekday) {
                return { day, isWorkingDay: false, startTime: null, endTime: null, breakMinutes: 0 };
            }

            if (doc.shiftType === 'Flexible') {
                return { day, isWorkingDay: true, startTime: null, endTime: null, breakMinutes: legacyBreak };
            }

            // Fixed — apply the single legacy time block to every weekday
            return {
                day,
                isWorkingDay: true,
                startTime:    legacyStart,
                endTime:      legacyEnd,
                breakMinutes: legacyBreak,
            };
        });

        // Compute totalWeeklyHours manually here (same logic as the pre-save hook)
        function parseH(t) {
            if (!t) return null;
            const [h, m] = t.split(':').map(Number);
            if (isNaN(h) || isNaN(m)) return null;
            return h + m / 60;
        }

        let totalWeeklyHours;
        if (doc.shiftType === 'Flexible') {
            const workingDays = weeklyPattern.filter(e => e.isWorkingDay).length;
            const daily = (doc.durationHours != null && doc.durationHours > 0) ? doc.durationHours : 8;
            totalWeeklyHours = Math.round(workingDays * daily * 100) / 100;
        } else {
            let total = 0;
            for (const entry of weeklyPattern) {
                if (!entry.isWorkingDay) continue;
                const s = parseH(entry.startTime);
                const e = parseH(entry.endTime);
                if (s == null || e == null) continue;
                let diff = e - s;
                if (diff < 0) diff += 24;
                total += Math.max(0, diff - entry.breakMinutes / 60);
            }
            totalWeeklyHours = Math.round(total * 100) / 100;
        }

        await Shift.updateOne(
            { _id: doc._id },
            {
                $set: {
                    weeklyPattern,
                    totalWeeklyHours,
                    timezone: doc.timezone || 'Asia/Kolkata',
                },
            }
        );

        OK(`${doc.shiftName} (${doc.shiftType}) → weeklyPattern set, totalWeeklyHours=${totalWeeklyHours}h`);
        migrated++;
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log(`  ✅  MIGRATION COMPLETE — ${migrated} migrated, ${skipped} skipped`);
    console.log('══════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('🔌  Disconnected from MongoDB.\n');
}

main().catch(err => {
    console.error('\n❌  Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
