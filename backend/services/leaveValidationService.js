// backend/services/leaveValidationService.js
const User = require('../models/User');
const LeavePolicyService = require('./LeavePolicyService');
const { parseISTDate, getISTDateString } = require('../utils/istTime');

/**
 * Leave Validation Service - Thin facade over LeavePolicyService.
 * All policy rules live in LeavePolicyService only. This module preserves API shape for routes.
 */

class LeaveValidationService {
    static getHalfYearPeriod(date) {
        const month = date.getMonth();
        return month < 6 ? 'First Half' : 'Second Half';
    }

    static calculateLeaveDuration(leaveDates, leaveType) {
        return leaveDates.length * (leaveType === 'Full Day' ? 1 : 0.5);
    }

    static isPermanentEmployee(employee) {
        return employee.employmentStatus === 'Permanent';
    }

    /**
     * Main validation - delegates entirely to LeavePolicyService.validateApply.
     * @param {Object} employee - Employee document
     * @param {string} requestType
     * @param {Array} leaveDates - Already normalized to YYYY-MM-DD or Date
     * @param {string} leaveType
     * @param {string|null} medicalCertificate
     * @param {string|Date|null} alternateDate
     * @param {Object} [context] - { excludeRequestId }
     * @param {string} [reason] - Reason text (min 100 chars enforced when provided)
     */
    static async validateLeaveRequest(employee, requestType, leaveDates, leaveType, medicalCertificate = null, alternateDate = null, context = {}, reason = null) {
        const request = {
            requestType,
            leaveType: leaveType || 'Full Day',
            leaveDates,
            alternateDate: alternateDate || null,
            medicalCertificate: medicalCertificate || null,
            reason: reason !== undefined && reason !== null ? String(reason) : undefined
        };
        return LeavePolicyService.validateApply(request, employee, context);
    }

    static async checkLeaveEligibility(employeeId, requestType, leaveDates, leaveType, medicalCertificate = null) {
        try {
            const employee = await User.findById(employeeId);
            if (!employee) {
                return { valid: false, errors: ['Employee not found.'], warnings: [] };
            }
            return await this.validateLeaveRequest(employee, requestType, leaveDates, leaveType, medicalCertificate, null);
        } catch (error) {
            console.error('Error checking leave eligibility:', error);
            return { valid: false, errors: ['Error checking leave eligibility.'], warnings: [] };
        }
    }
}

module.exports = LeaveValidationService;
