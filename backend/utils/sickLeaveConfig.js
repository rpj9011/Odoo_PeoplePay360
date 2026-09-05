/**
 * Sick Leave Configuration - Single source of truth for SL thresholds
 * All thresholds are configurable via Settings model
 */

const Setting = require('../models/Setting');

// Default fallback values
const DEFAULTS = {
    RETROSPECTIVE_WINDOW_DAYS: 3, // Allow SL application within 3 working days after leave date
    MEDICAL_CERT_THRESHOLD_DAYS: 2, // Require certificate for consecutive SL >= 2 days
    MEDICAL_PROOF_DEADLINE_DAYS: 3, // Deadline for certificate upload (leave date + 3 days)
};

/**
 * Get retrospective application window (working days)
 * @returns {Promise<number>} Number of working days allowed for retrospective SL application
 */
async function getRetrospectiveWindowDays() {
    try {
        const setting = await Setting.findOne({ key: 'sickLeaveRetrospectiveWindowDays' }).lean();
        if (!setting || setting.value == null) {
            return DEFAULTS.RETROSPECTIVE_WINDOW_DAYS;
        }
        const n = parseInt(Number(setting.value), 10);
        if (isNaN(n) || n < 1 || n > 7) {
            return DEFAULTS.RETROSPECTIVE_WINDOW_DAYS;
        }
        return n;
    } catch (e) {
        console.error('[sickLeaveConfig] Failed to fetch retrospective window, using fallback:', e.message);
        return DEFAULTS.RETROSPECTIVE_WINDOW_DAYS;
    }
}

/**
 * Get medical certificate threshold (consecutive days)
 * @returns {Promise<number>} Number of consecutive SL days that require medical certificate
 */
async function getMedicalCertThresholdDays() {
    try {
        const setting = await Setting.findOne({ key: 'sickLeaveMedicalCertThresholdDays' }).lean();
        if (!setting || setting.value == null) {
            return DEFAULTS.MEDICAL_CERT_THRESHOLD_DAYS;
        }
        const n = parseInt(Number(setting.value), 10);
        if (isNaN(n) || n < 1 || n > 7) {
            return DEFAULTS.MEDICAL_CERT_THRESHOLD_DAYS;
        }
        return n;
    } catch (e) {
        console.error('[sickLeaveConfig] Failed to fetch medical cert threshold, using fallback:', e.message);
        return DEFAULTS.MEDICAL_CERT_THRESHOLD_DAYS;
    }
}

/**
 * Get medical proof deadline (days after leave date)
 * @returns {Promise<number>} Number of days after leave date for certificate upload deadline
 */
async function getMedicalProofDeadlineDays() {
    try {
        const setting = await Setting.findOne({ key: 'sickLeaveMedicalProofDeadlineDays' }).lean();
        if (!setting || setting.value == null) {
            return DEFAULTS.MEDICAL_PROOF_DEADLINE_DAYS;
        }
        const n = parseInt(Number(setting.value), 10);
        if (isNaN(n) || n < 1 || n > 14) {
            return DEFAULTS.MEDICAL_PROOF_DEADLINE_DAYS;
        }
        return n;
    } catch (e) {
        console.error('[sickLeaveConfig] Failed to fetch proof deadline, using fallback:', e.message);
        return DEFAULTS.MEDICAL_PROOF_DEADLINE_DAYS;
    }
}

/**
 * Get all SL configuration values (for admin UI)
 * @returns {Promise<Object>} Configuration object with all thresholds
 */
async function getAllConfig() {
    const [retrospectiveWindow, certThreshold, proofDeadline] = await Promise.all([
        getRetrospectiveWindowDays(),
        getMedicalCertThresholdDays(),
        getMedicalProofDeadlineDays(),
    ]);
    return {
        retrospectiveWindowDays: retrospectiveWindow,
        medicalCertThresholdDays: certThreshold,
        medicalProofDeadlineDays: proofDeadline,
    };
}

module.exports = {
    getRetrospectiveWindowDays,
    getMedicalCertThresholdDays,
    getMedicalProofDeadlineDays,
    getAllConfig,
    DEFAULTS,
};
