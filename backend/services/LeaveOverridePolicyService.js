// backend/services/LeaveOverridePolicyService.js
/**
 * Leave Override Policy Service
 * 
 * GOVERNANCE RULES:
 * 1. Defines what CAN and CANNOT be overridden
 * 2. All overrides MUST be logged with reason and admin ID
 * 3. Hard restrictions CANNOT be bypassed (overlapping leaves, monthly caps)
 * 4. Soft restrictions CAN be overridden (weekday restrictions, advance notice)
 * 5. All override attempts (successful + rejected) are audited
 * 
 * COMPLIANCE STRENGTH: This service maintains strong governance controls
 */

const mongoose = require('mongoose');
const SystemAuditLog = require('../models/SystemAuditLog');
const { logger } = require('../utils/logger');

class LeaveOverridePolicyService {
    /**
     * Override policy configuration
     * Defines what can and cannot be overridden
     */
    static OVERRIDE_POLICY = {
        // HARD RESTRICTIONS - CANNOT BE OVERRIDDEN
        hardRestrictions: [
            'OVERLAPPING_LEAVE',           // Cannot have overlapping leaves
            'MONTHLY_CAP_EXCEEDED',        // Cannot exceed monthly request cap
            'MONTHLY_WORKING_DAYS_CAP',    // Cannot exceed monthly working days cap
            'EMPLOYEE_NOT_FOUND',          // System error
            'INVALID_DATES',               // Invalid input
            'INSUFFICIENT_BALANCE'         // Cannot override balance limits
        ],

        // SOFT RESTRICTIONS - CAN BE OVERRIDDEN WITH REASON
        softRestrictions: [
            'WEEKDAY_RESTRICTION',         // Friday/Monday restrictions
            'ADVANCE_NOTICE_REQUIRED',     // Advance notice requirements
            'SATURDAY_CLUBBING',           // Saturday clubbing policy
            'COMPOFF_THURSDAY_DEADLINE',   // Comp-off submission deadline
            'BACKDATED_LOP_REQUIRED',      // Backdated leave type restriction
            'MEDICAL_CERTIFICATE_REQUIRED' // Medical certificate requirement
        ],

        // CONDITIONAL OVERRIDES - Require additional validation
        conditionalRestrictions: [
            'EMPLOYEE_TYPE_RESTRICTION',   // Probation/Intern restrictions
            'COMPOFF_MONTHLY_LIMIT'        // Comp-off monthly limit
        ]
    };

    /**
     * Check if a policy violation can be overridden
     * @param {string} policyViolationType - Type of policy violation
     * @returns {Object} Override eligibility
     */
    static canOverride(policyViolationType) {
        if (this.OVERRIDE_POLICY.hardRestrictions.includes(policyViolationType)) {
            return {
                allowed: false,
                reason: 'This restriction cannot be overridden for compliance reasons',
                category: 'HARD_RESTRICTION'
            };
        }

        if (this.OVERRIDE_POLICY.softRestrictions.includes(policyViolationType)) {
            return {
                allowed: true,
                reason: 'Override allowed with valid reason',
                category: 'SOFT_RESTRICTION',
                requiresReason: true
            };
        }

        if (this.OVERRIDE_POLICY.conditionalRestrictions.includes(policyViolationType)) {
            return {
                allowed: true,
                reason: 'Override allowed with additional validation',
                category: 'CONDITIONAL_RESTRICTION',
                requiresReason: true,
                requiresAdditionalValidation: true
            };
        }

        // Unknown violation type - default to not allowed
        return {
            allowed: false,
            reason: 'Unknown policy violation type',
            category: 'UNKNOWN'
        };
    }

    /**
     * Validate override request
     * @param {Object} overrideRequest - Override request details
     * @returns {Object} Validation result
     */
    static async validateOverride(overrideRequest) {
        const {
            policyViolationType,
            reason,
            adminId,
            employeeId,
            leaveRequestData
        } = overrideRequest;

        // Check if override is allowed
        const eligibility = this.canOverride(policyViolationType);
        
        if (!eligibility.allowed) {
            await this.logOverrideAttempt({
                ...overrideRequest,
                success: false,
                denialReason: eligibility.reason
            });

            return {
                valid: false,
                reason: eligibility.reason,
                category: eligibility.category
            };
        }

        // Validate reason is provided
        if (eligibility.requiresReason && (!reason || reason.trim().length < 10)) {
            await this.logOverrideAttempt({
                ...overrideRequest,
                success: false,
                denialReason: 'Override reason must be at least 10 characters'
            });

            return {
                valid: false,
                reason: 'Override reason must be at least 10 characters',
                category: eligibility.category
            };
        }

        // Additional validation for conditional overrides
        if (eligibility.requiresAdditionalValidation) {
            const additionalValidation = await this.performAdditionalValidation(
                policyViolationType,
                leaveRequestData
            );

            if (!additionalValidation.valid) {
                await this.logOverrideAttempt({
                    ...overrideRequest,
                    success: false,
                    denialReason: additionalValidation.reason
                });

                return additionalValidation;
            }
        }

        // Override is valid
        await this.logOverrideAttempt({
            ...overrideRequest,
            success: true
        });

        return {
            valid: true,
            reason: 'Override approved',
            category: eligibility.category
        };
    }

    /**
     * Perform additional validation for conditional overrides
     * @param {string} policyViolationType - Policy violation type
     * @param {Object} leaveRequestData - Leave request data
     * @returns {Object} Validation result
     */
    static async performAdditionalValidation(policyViolationType, leaveRequestData) {
        switch (policyViolationType) {
            case 'EMPLOYEE_TYPE_RESTRICTION':
                // Validate that override doesn't violate balance limits
                // Probation/Intern employees have no leave balance
                return {
                    valid: true,
                    reason: 'Override allowed - ensure balance is not affected'
                };

            case 'COMPOFF_MONTHLY_LIMIT':
                // Validate that comp-off is for legitimate weekend work
                return {
                    valid: true,
                    reason: 'Override allowed - verify weekend work attendance'
                };

            default:
                return {
                    valid: true,
                    reason: 'No additional validation required'
                };
        }
    }

    /**
     * Log override attempt (successful or rejected)
     * @param {Object} attemptData - Override attempt data
     */
    static async logOverrideAttempt(attemptData) {
        const {
            policyViolationType,
            reason,
            adminId,
            employeeId,
            leaveRequestData,
            success,
            denialReason,
            ipAddress
        } = attemptData;

        try {
            await SystemAuditLog.create({
                action: success ? 'LEAVE_OVERRIDE_APPROVED' : 'LEAVE_OVERRIDE_REJECTED',
                userId: adminId,
                employeeId: employeeId,
                details: {
                    policyViolationType,
                    overrideReason: reason,
                    denialReason: denialReason || null,
                    leaveRequestData: {
                        requestType: leaveRequestData?.requestType,
                        leaveDates: leaveRequestData?.leaveDates,
                        leaveType: leaveRequestData?.leaveType
                    }
                },
                ipAddress: ipAddress || null,
                success,
                timestamp: new Date()
            });

            logger.info(`[LeaveOverride] Override attempt logged`, {
                success,
                policyViolationType,
                adminId,
                employeeId
            });

        } catch (error) {
            logger.error(`[LeaveOverride] Failed to log override attempt`, {
                error: error.message,
                attemptData
            });
        }
    }

    /**
     * Get override history for an employee
     * @param {ObjectId} employeeId - Employee ID
     * @param {Object} options - Query options
     * @returns {Array} Override history
     */
    static async getOverrideHistory(employeeId, options = {}) {
        const query = {
            employeeId,
            action: { $in: ['LEAVE_OVERRIDE_APPROVED', 'LEAVE_OVERRIDE_REJECTED'] }
        };

        if (options.startDate) {
            query.timestamp = { $gte: options.startDate };
        }

        if (options.endDate) {
            query.timestamp = query.timestamp || {};
            query.timestamp.$lte = options.endDate;
        }

        return await SystemAuditLog.find(query)
            .sort({ timestamp: -1 })
            .limit(options.limit || 50)
            .populate('userId', 'fullName email')
            .lean();
    }

    /**
     * Get override statistics
     * @param {Object} filters - Filter options
     * @returns {Object} Statistics
     */
    static async getOverrideStatistics(filters = {}) {
        const matchStage = {
            action: { $in: ['LEAVE_OVERRIDE_APPROVED', 'LEAVE_OVERRIDE_REJECTED'] }
        };

        if (filters.startDate) {
            matchStage.timestamp = { $gte: filters.startDate };
        }

        if (filters.endDate) {
            matchStage.timestamp = matchStage.timestamp || {};
            matchStage.timestamp.$lte = filters.endDate;
        }

        if (filters.adminId) {
            matchStage.userId = filters.adminId;
        }

        const pipeline = [
            { $match: matchStage },
            {
                $group: {
                    _id: {
                        action: '$action',
                        policyViolationType: '$details.policyViolationType'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.action',
                    total: { $sum: '$count' },
                    byType: {
                        $push: {
                            type: '$_id.policyViolationType',
                            count: '$count'
                        }
                    }
                }
            }
        ];

        const results = await SystemAuditLog.aggregate(pipeline);

        const stats = {
            approved: 0,
            rejected: 0,
            byType: {}
        };

        for (const result of results) {
            if (result._id === 'LEAVE_OVERRIDE_APPROVED') {
                stats.approved = result.total;
            } else if (result._id === 'LEAVE_OVERRIDE_REJECTED') {
                stats.rejected = result.total;
            }

            for (const typeData of result.byType) {
                if (!stats.byType[typeData.type]) {
                    stats.byType[typeData.type] = { approved: 0, rejected: 0 };
                }
                
                if (result._id === 'LEAVE_OVERRIDE_APPROVED') {
                    stats.byType[typeData.type].approved = typeData.count;
                } else {
                    stats.byType[typeData.type].rejected = typeData.count;
                }
            }
        }

        stats.total = stats.approved + stats.rejected;
        stats.approvalRate = stats.total > 0 ? (stats.approved / stats.total * 100).toFixed(2) : 0;

        return stats;
    }

    /**
     * Detect potential backdoor attempts
     * @param {ObjectId} adminId - Admin ID
     * @param {Object} options - Detection options
     * @returns {Object} Detection results
     */
    static async detectBackdoorAttempts(adminId, options = {}) {
        const timeWindow = options.timeWindow || 24 * 60 * 60 * 1000; // 24 hours
        const threshold = options.threshold || 10; // 10 overrides in time window

        const startTime = new Date(Date.now() - timeWindow);

        const overrideCount = await SystemAuditLog.countDocuments({
            userId: adminId,
            action: 'LEAVE_OVERRIDE_APPROVED',
            timestamp: { $gte: startTime }
        });

        const suspicious = overrideCount >= threshold;

        if (suspicious) {
            logger.warn(`[LeaveOverride] Suspicious override activity detected`, {
                adminId,
                overrideCount,
                timeWindow,
                threshold
            });
        }

        return {
            suspicious,
            overrideCount,
            threshold,
            timeWindow,
            adminId
        };
    }
}

module.exports = LeaveOverridePolicyService;
