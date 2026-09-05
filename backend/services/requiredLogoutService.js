// backend/services/requiredLogoutService.js

/**
 * REQUIRED LOGOUT TIME CALCULATION SERVICE
 *
 * CRITICAL ARCHITECTURAL RULES:
 * 1. This function must NEVER call itself (no recursion)
 * 2. This function must NEVER be called by utilities it depends on
 * 3. getMoment() is a PURE utility - returns moment instance ONLY
 * 4. All business logic is contained in calculateRequiredLogoutTime()
 *
 * SHIFT POLICIES:
 * - 10 AM Shift: HARD 7 PM minimum logout (always)
 * - 11 AM Shift: FLEXIBLE
 *    • clock-in < 11 AM → 7 PM minimum
 *    • clock-in ≥ 11 AM → duration-based (clockIn + 9h)
 *
 * GLOBAL RULE:
 * - Required Log Out NEVER earlier than 7:00 PM for applicable shifts
 * - Breaks can ONLY push logout later, never earlier
 *
 * FORMULA:
 * excessBreak = max(0, totalBreak - allowedBreak)
 * durationLogout = clockIn + 9h + excessBreak
 * requiredLogout = max(durationLogout, policyBoundary)
 *
 * SAFETY: This module is 100% safe to import under Passenger.
 * - NO top-level runtime execution
 * - NO date calculations at import time
 * - NO function calls outside exported functions
 * - NO recursion or circular dependencies
 */

// Import dependencies (NO execution, just references)
const {
    SHIFT_TOTAL_MINUTES,
    PAID_BREAK_ALLOWANCE_MINUTES,
    SHIFT_10AM_CONFIG,
    SHIFT_11AM_CONFIG,
    isShiftMatch
} = require('../config/shiftPolicy');

// Lazy-loaded moment instance (initialized on first use)
let momentInstance = null;

/**
 * PURE UTILITY FUNCTION - Get moment-timezone instance
 * 
 * CRITICAL: This function must ONLY return moment instance.
 * ❌ NO business logic
 * ❌ NO Required Log Out calculation
 * ❌ NO calling calculateRequiredLogoutTime()
 * ❌ NO recursion
 * 
 * @returns {Function} moment-timezone instance
 */
function getMoment() {
    if (!momentInstance) {
        momentInstance = require('moment-timezone');
    }
    return momentInstance;
}

/**
 * Calculate required logout time based on shift rules, breaks and boundaries
 *
 * ANTI-RECURSION GUARANTEE:
 * This function must NEVER call itself directly or indirectly.
 * It is the TOP-LEVEL business logic function and should only be called
 * by higher-level services (dailyStatusService, dashboard APIs, etc.)
 *
 * @param {Object} params
 * @param {Date} params.clockInTime - Clock-in timestamp (required)
 * @param {number} params.totalPaidBreakMinutes - Total paid break taken in minutes (default: 0)
 * @param {number} params.totalUnpaidBreakMinutes - Total unpaid break taken in minutes (default: 0)
 * @param {Object} params.shift - Shift object with shiftName (required)
 * @param {string} params.attendanceDate - YYYY-MM-DD format (required)
 * @param {string} params.timezone - Timezone (default: 'Asia/Kolkata')
 * @returns {Object|null} { requiredLogoutTime, breakdown } or null if invalid input
 */
function calculateRequiredLogoutTime({
    clockInTime,
    totalPaidBreakMinutes = 0,
    totalUnpaidBreakMinutes = 0,
    shift,
    attendanceDate,
    timezone = 'Asia/Kolkata'
}) {
    // ============================================
    // STEP 1: LAZY-LOAD MOMENT (PURE UTILITY)
    // ============================================
    const moment = getMoment();

    // ============================================
    // STEP 2: VALIDATE INPUTS
    // ============================================
    if (!clockInTime || !shift || !attendanceDate) {
        return null;
    }

    // ============================================
    // STEP 3: CALCULATE EXCESS BREAK TIME
    // ============================================
    // Only breaks beyond the 30-minute allowance extend logout time
    const excessPaidBreakMinutes = Math.max(
        0,
        Math.floor(totalPaidBreakMinutes - PAID_BREAK_ALLOWANCE_MINUTES)
    );

    // All unpaid break time extends logout time
    const totalExtensionMinutes =
        excessPaidBreakMinutes + Math.floor(totalUnpaidBreakMinutes);

    // ============================================
    // STEP 4: CALCULATE DURATION-BASED LOGOUT
    // ============================================
    // Base calculation: clockIn + 9 hours + excess breaks
    const durationLogout = moment(clockInTime)
        .add(SHIFT_TOTAL_MINUTES + totalExtensionMinutes, 'minutes')
        .toDate();

    // ============================================
    // STEP 5: APPLY SHIFT-SPECIFIC BOUNDARY LOGIC
    // ============================================
    let boundaryLogout = null;
    let boundaryReason = 'none';

    // ------------------------------------------------
    // 10 AM SHIFT (General Shift 1)
    // ------------------------------------------------
    // RULE: HARD 7 PM floor - always enforced regardless of check-in time
    if (isShiftMatch(shift, SHIFT_10AM_CONFIG)) {
        const boundaryHour = String(SHIFT_10AM_CONFIG.minRequiredLogoutHour).padStart(2, '0');
        const boundaryMinute = String(SHIFT_10AM_CONFIG.minRequiredLogoutMinute).padStart(2, '0');
        
        boundaryLogout = moment.tz(
            `${attendanceDate} ${boundaryHour}:${boundaryMinute}`,
            'YYYY-MM-DD HH:mm',
            timezone
        ).toDate();
        
        boundaryReason = '10 AM shift - hard 7 PM floor';
    }

    // ------------------------------------------------
    // 11 AM SHIFT (General Shift 2)
    // ------------------------------------------------
    // RULE: FLEXIBLE - 7 PM floor only if check-in < 11 AM
    else if (isShiftMatch(shift, SHIFT_11AM_CONFIG)) {
        const clockInMoment = moment(clockInTime).tz(timezone);
        
        // Define the 11 AM boundary (not 10 AM as before)
        const shiftStartBoundary = moment.tz(
            `${attendanceDate} 11:00`,
            'YYYY-MM-DD HH:mm',
            timezone
        );

        // Case 1: Clock-in BEFORE 11:00 AM → apply 7 PM floor
        if (clockInMoment.isBefore(shiftStartBoundary)) {
            const minLogoutHour = String(SHIFT_11AM_CONFIG.minRequiredLogoutWhenEarlyHour).padStart(2, '0');
            const minLogoutMinute = String(SHIFT_11AM_CONFIG.minRequiredLogoutWhenEarlyMinute).padStart(2, '0');
            
            boundaryLogout = moment.tz(
                `${attendanceDate} ${minLogoutHour}:${minLogoutMinute}`,
                'YYYY-MM-DD HH:mm',
                timezone
            ).toDate();
            
            boundaryReason = '11 AM shift - early check-in (< 11 AM) - 7 PM floor';
        }
        // Case 2: Clock-in AT or AFTER 11:00 AM → duration-based only
        else {
            boundaryReason = '11 AM shift - on-time/late check-in (≥ 11 AM) - no floor';
        }
    }

    // ============================================
    // STEP 6: CALCULATE FINAL REQUIRED LOGOUT
    // ============================================
    // Take the LATER of duration-based or boundary logout
    let requiredLogoutTime = durationLogout;

    if (boundaryLogout) {
        requiredLogoutTime = new Date(
            Math.max(durationLogout.getTime(), boundaryLogout.getTime())
        );
    }

    // ============================================
    // STEP 7: ENFORCE GLOBAL 7 PM MINIMUM
    // ============================================
    // GLOBAL RULE: Required Log Out NEVER earlier than 7 PM
    const globalMinimum = moment.tz(
        `${attendanceDate} 19:00`,
        'YYYY-MM-DD HH:mm',
        timezone
    ).toDate();

    const finalRequiredLogoutTime = new Date(
        Math.max(requiredLogoutTime.getTime(), globalMinimum.getTime())
    );

    // ============================================
    // STEP 8: RETURN RESULT WITH BREAKDOWN
    // ============================================
    return {
        requiredLogoutTime: finalRequiredLogoutTime,
        breakdown: {
            clockInTime: new Date(clockInTime),
            durationLogout,
            boundaryLogout,
            boundaryReason,
            globalMinimum,
            baseShiftMinutes: SHIFT_TOTAL_MINUTES,
            paidBreakMinutes: totalPaidBreakMinutes,
            excessPaidBreakMinutes,
            unpaidBreakMinutes: totalUnpaidBreakMinutes,
            totalExtensionMinutes
        }
    };
}

module.exports = {
    calculateRequiredLogoutTime
};
