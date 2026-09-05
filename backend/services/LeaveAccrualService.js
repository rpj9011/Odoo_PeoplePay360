// backend/services/LeaveAccrualService.js
/**
 * Leave Accrual Service - Automated Monthly Leave Accrual
 * 
 * BUSINESS RULES:
 * 1. Permanent employees only (Probation/Intern excluded)
 * 2. Monthly accrual based on leave type configuration:
 *    - Sick Leave: 6 days/year = 0.5 days/month
 *    - Casual Leave: 6 days/year = 0.5 days/month
 *    - Planned Leave: 10 days/year with half-year distribution
 *      * First Half (Jan-Jun): 5 days total (accrued monthly)
 *      * Second Half (Jul-Dec): 5 days total (accrued monthly)
 * 3. No over-accrual beyond annual limits
 * 4. Idempotent execution (safe to re-run)
 * 5. Complete audit trail via LeaveLedger
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const LeaveLedger = require('../models/LeaveLedger');
const LeaveAccrualLock = require('../models/LeaveAccrualLock');
const { getISTNow, getISTDateParts } = require('../utils/istTime');
const { logger } = require('../utils/logger');

class LeaveAccrualService {
    /**
     * Accrual configuration per leave type
     */
    static ACCRUAL_CONFIG = {
        sick: {
            annualQuota: 6,
            monthlyAccrual: 0.5,
            halfYearDistribution: false
        },
        casual: {
            annualQuota: 6,
            monthlyAccrual: 0.5,
            halfYearDistribution: false
        },
        paid: { // Planned Leave
            annualQuota: 10,
            monthlyAccrual: null, // Calculated based on half-year
            halfYearDistribution: true,
            firstHalfQuota: 5,  // Jan-Jun
            secondHalfQuota: 5  // Jul-Dec
        }
    };

    /**
     * Process monthly accrual for all eligible employees
     * @param {number} month - Month (1-12)
     * @param {number} year - Year
     * @param {Object} options - { dryRun: boolean, employeeIds: Array }
     * @returns {Object} Processing results
     */
    static async processMonthlyAccrual(month, year, options = {}) {
        const { dryRun = false, employeeIds = null } = options;
        
        logger.info(`[LeaveAccrual] Starting accrual for ${year}-${month.toString().padStart(2, '0')}`, {
            dryRun,
            targetEmployees: employeeIds ? employeeIds.length : 'all'
        });

        // Step 1: Acquire lock (skip in dry run)
        let lock = null;
        if (!dryRun) {
            const lockResult = await LeaveAccrualLock.acquireLock(month, year);
            if (!lockResult.success) {
                logger.warn(`[LeaveAccrual] Accrual already processed for ${year}-${month}`, {
                    reason: lockResult.reason,
                    existingLock: lockResult.existingLock
                });
                return {
                    success: false,
                    reason: lockResult.reason,
                    existingLock: lockResult.existingLock
                };
            }
            lock = lockResult.lock;
        }

        const results = {
            month,
            year,
            dryRun,
            employeesProcessed: 0,
            employeesFailed: 0,
            totalEmployees: 0,
            accruals: [],
            errors: [],
            startTime: new Date(),
            endTime: null
        };

        const session = dryRun ? null : await mongoose.startSession();
        
        try {
            if (!dryRun) {
                session.startTransaction();
            }

            // Step 2: Get eligible employees
            const query = {
                isActive: true,
                employmentStatus: 'Permanent'
            };
            
            if (employeeIds && employeeIds.length > 0) {
                query._id = { $in: employeeIds };
            }

            const employees = await User.find(query)
                .select('_id fullName employeeCode leaveBalances leaveEntitlements joiningDate probationConfirmation')
                .lean();

            results.totalEmployees = employees.length;
            logger.info(`[LeaveAccrual] Found ${employees.length} eligible employees`);

            // Step 3: Process each employee
            for (const employee of employees) {
                try {
                    const employeeResult = await this.accrueForEmployee(
                        employee,
                        month,
                        year,
                        session,
                        dryRun
                    );
                    
                    results.accruals.push(employeeResult);
                    results.employeesProcessed++;
                    
                    logger.debug(`[LeaveAccrual] Processed ${employee.fullName}`, employeeResult);
                } catch (error) {
                    results.employeesFailed++;
                    results.errors.push({
                        employeeId: employee._id,
                        employeeName: employee.fullName,
                        error: error.message,
                        timestamp: new Date()
                    });
                    
                    logger.error(`[LeaveAccrual] Failed for ${employee.fullName}`, {
                        error: error.message,
                        stack: error.stack
                    });
                }
            }

            // Step 4: Commit transaction
            if (!dryRun && session) {
                await session.commitTransaction();
                logger.info(`[LeaveAccrual] Transaction committed successfully`);
            }

            results.endTime = new Date();
            results.success = true;

            // Step 5: Release lock
            if (!dryRun && lock) {
                await LeaveAccrualLock.releaseLock(lock._id, 'COMPLETED', {
                    employeesProcessed: results.employeesProcessed,
                    employeesFailed: results.employeesFailed,
                    totalEmployees: results.totalEmployees,
                    errors: results.errors,
                    metadata: {
                        duration: results.endTime - results.startTime,
                        accrualsSummary: this.summarizeAccruals(results.accruals)
                    }
                });
            }

            logger.info(`[LeaveAccrual] Completed successfully`, {
                processed: results.employeesProcessed,
                failed: results.employeesFailed,
                duration: results.endTime - results.startTime
            });

            return results;

        } catch (error) {
            // Rollback transaction
            if (!dryRun && session) {
                await session.abortTransaction();
                logger.error(`[LeaveAccrual] Transaction aborted`, { error: error.message });
            }

            // Release lock with failed status
            if (!dryRun && lock) {
                await LeaveAccrualLock.releaseLock(lock._id, 'FAILED', {
                    employeesProcessed: results.employeesProcessed,
                    employeesFailed: results.employeesFailed,
                    totalEmployees: results.totalEmployees,
                    errors: results.errors,
                    metadata: { error: error.message }
                });
            }

            logger.error(`[LeaveAccrual] Fatal error`, {
                error: error.message,
                stack: error.stack
            });

            throw error;
        } finally {
            if (session) {
                session.endSession();
            }
        }
    }

    /**
     * Accrue leave for a single employee
     * @param {Object} employee - Employee document
     * @param {number} month - Month (1-12)
     * @param {number} year - Year
     * @param {Object} session - MongoDB session
     * @param {boolean} dryRun - Dry run mode
     * @returns {Object} Accrual result
     */
    static async accrueForEmployee(employee, month, year, session, dryRun) {
        const result = {
            employeeId: employee._id,
            employeeName: employee.fullName,
            employeeCode: employee.employeeCode,
            accruals: {}
        };

        // Check if employee joined after this month
        const joiningDate = new Date(employee.joiningDate);
        const accrualDate = new Date(year, month - 1, 1);
        
        if (joiningDate > accrualDate) {
            result.skipped = true;
            result.reason = 'Joined after accrual month';
            return result;
        }

        // Process each leave type
        for (const [leaveType, config] of Object.entries(this.ACCRUAL_CONFIG)) {
            const accrualAmount = this.calculateAccrualAmount(leaveType, month, config);
            
            if (accrualAmount === 0) {
                continue;
            }

            const currentBalance = employee.leaveBalances[leaveType] || 0;
            let entitlement = employee.leaveEntitlements[leaveType] || config.annualQuota;

            // If this employee was confirmed this same calendar year, the monthly cron
            // must respect the prorated remaining-year cap instead of the full annual
            // entitlement — otherwise it would double-credit on top of the confirmation
            // lump sum. This override is year-scoped and self-expiring: it is ignored
            // entirely once `year` no longer matches, with no reset job required.
            const confirmationCap = employee.probationConfirmation;
            if (confirmationCap && confirmationCap.year === year && confirmationCap.proratedEntitlements?.[leaveType] != null) {
                entitlement = confirmationCap.proratedEntitlements[leaveType];
            }
            
            // Check if already at or above entitlement
            if (currentBalance >= entitlement) {
                result.accruals[leaveType] = {
                    amount: 0,
                    reason: 'Already at maximum',
                    currentBalance,
                    entitlement
                };
                continue;
            }

            // Calculate actual accrual (don't exceed entitlement)
            const maxAccrual = entitlement - currentBalance;
            const actualAccrual = Math.min(accrualAmount, maxAccrual);
            const newBalance = currentBalance + actualAccrual;

            result.accruals[leaveType] = {
                amount: actualAccrual,
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                entitlement
            };

            // Update balance and record in ledger (skip in dry run)
            if (!dryRun) {
                // Update user balance
                await User.updateOne(
                    { _id: employee._id },
                    { $set: { [`leaveBalances.${leaveType}`]: newBalance } },
                    { session }
                );

                // Record in ledger
                await LeaveLedger.recordTransaction({
                    employeeId: employee._id,
                    leaveType,
                    transactionType: 'ACCRUAL',
                    amount: actualAccrual,
                    balanceBefore: currentBalance,
                    balanceAfter: newBalance,
                    month,
                    year,
                    source: 'CRON',
                    description: `Monthly accrual for ${this.getMonthName(month)} ${year}`,
                    metadata: {
                        accrualConfig: config,
                        entitlement
                    }
                }, session);
            }
        }

        return result;
    }

    /**
     * Calculate accrual amount for a leave type and month
     * @param {string} leaveType - Leave type (sick, casual, paid)
     * @param {number} month - Month (1-12)
     * @param {Object} config - Accrual configuration
     * @returns {number} Accrual amount
     */
    static calculateAccrualAmount(leaveType, month, config) {
        if (!config.halfYearDistribution) {
            // Simple monthly accrual
            return config.monthlyAccrual;
        }

        // Half-year distribution (Planned Leave)
        const isFirstHalf = month <= 6;
        const halfYearQuota = isFirstHalf ? config.firstHalfQuota : config.secondHalfQuota;
        const monthsInHalf = 6;
        
        return halfYearQuota / monthsInHalf;
    }

    /**
     * Compute the prorated remaining-year leave quota for an employee being confirmed
     * mid-year. Sums calculateAccrualAmount() for each leave type from the confirmation
     * month through December, using the SAME per-month formulas the monthly cron uses,
     * so this never drifts from the cron's math.
     * @param {Date} confirmationDate
     * @returns {{ year: number, month: number, entitlements: {sick:number, casual:number, paid:number} }}
     */
    static computeProratedRemainingYearEntitlement(confirmationDate) {
        const year = confirmationDate.getFullYear();
        const confirmationMonth = confirmationDate.getMonth() + 1; // 1-12

        const entitlements = {};
        for (const [leaveType, config] of Object.entries(this.ACCRUAL_CONFIG)) {
            let total = 0;
            for (let m = confirmationMonth; m <= 12; m++) {
                total += this.calculateAccrualAmount(leaveType, m, config);
            }
            entitlements[leaveType] = Math.round(total * 10) / 10; // 1 decimal, matches rest of codebase
        }

        return { year, month: confirmationMonth, entitlements };
    }

    /**
     * Apply the one-time confirmation leave allotment. Called ONLY from
     * probationTrackingService.promoteEmployeeToPermanent. Transactional.
     * ADDITIVE to any pre-existing balance (does not overwrite/destroy existing balance,
     * e.g. for Intern->Permanent conversions that may already carry a small balance).
     * Does NOT touch leaveEntitlements.
     * @param {ObjectId} employeeId
     * @param {Date} confirmationDate
     * @param {ObjectId} adminId - admin performing the confirmation (for ledger audit)
     * @returns {Object} result summary
     */
    static async applyConfirmationAllotment(employeeId, confirmationDate, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const employee = await User.findById(employeeId).session(session);
            if (!employee) {
                throw new Error('Employee not found');
            }

            const { year, month, entitlements } = this.computeProratedRemainingYearEntitlement(confirmationDate);
            const monthName = this.getMonthName(month);
            const remainingMonths = 12 - month + 1;

            const result = { employeeId, year, month, allotments: {} };

            for (const leaveType of Object.keys(entitlements)) {
                const amount = entitlements[leaveType];
                if (amount <= 0) continue;

                const currentBalance = employee.leaveBalances?.[leaveType] || 0;
                const newBalance = currentBalance + amount;

                await User.updateOne(
                    { _id: employeeId },
                    { $inc: { [`leaveBalances.${leaveType}`]: amount } },
                    { session }
                );

                await LeaveLedger.recordTransaction({
                    employeeId,
                    leaveType,
                    transactionType: 'CONFIRMATION_ALLOTMENT',
                    amount,
                    balanceBefore: currentBalance,
                    balanceAfter: newBalance,
                    month,
                    year,
                    source: 'ADMIN',
                    performedBy: adminId,
                    description: `Pro-rated ${leaveType} leave allotment on confirmation (${monthName} ${year}): ${amount} day(s) for ${remainingMonths} remaining month(s) of the year`,
                    metadata: { confirmationMonth: month, confirmationYear: year, remainingMonths }
                }, session);

                result.allotments[leaveType] = { amount, balanceBefore: currentBalance, balanceAfter: newBalance };
            }

            // Store the self-expiring cap override. Year-scoped — automatically ignored
            // by accrueForEmployee once the calendar year changes. leaveEntitlements is
            // intentionally left untouched.
            await User.updateOne(
                { _id: employeeId },
                {
                    $set: {
                        probationConfirmation: {
                            year,
                            month,
                            proratedEntitlements: entitlements,
                            appliedAt: new Date()
                        }
                    }
                },
                { session }
            );

            await session.commitTransaction();

            logger.info(`[LeaveAccrual] Confirmation allotment applied`, {
                employeeId, year, month, allotments: result.allotments
            });

            return { success: true, ...result };
        } catch (error) {
            await session.abortTransaction();
            logger.error(`[LeaveAccrual] Confirmation allotment failed`, {
                error: error.message, employeeId
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Summarize accruals for reporting
     * @param {Array} accruals - Array of accrual results
     * @returns {Object} Summary
     */
    static summarizeAccruals(accruals) {
        const summary = {
            sick: { total: 0, count: 0 },
            casual: { total: 0, count: 0 },
            paid: { total: 0, count: 0 }
        };

        for (const accrual of accruals) {
            if (accrual.skipped) continue;
            
            for (const [leaveType, data] of Object.entries(accrual.accruals)) {
                if (data.amount > 0) {
                    summary[leaveType].total += data.amount;
                    summary[leaveType].count++;
                }
            }
        }

        return summary;
    }

    /**
     * Get month name
     * @param {number} month - Month (1-12)
     * @returns {string} Month name
     */
    static getMonthName(month) {
        const names = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return names[month - 1];
    }

    /**
     * Manual accrual adjustment (admin use)
     * @param {ObjectId} employeeId - Employee ID
     * @param {string} leaveType - Leave type
     * @param {number} amount - Adjustment amount (positive or negative)
     * @param {string} reason - Reason for adjustment
     * @param {ObjectId} adminId - Admin performing adjustment
     * @returns {Object} Adjustment result
     */
    static async manualAdjustment(employeeId, leaveType, amount, reason, adminId) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const employee = await User.findById(employeeId)
                .select('fullName leaveBalances leaveEntitlements')
                .session(session);

            if (!employee) {
                throw new Error('Employee not found');
            }

            const currentBalance = employee.leaveBalances[leaveType] || 0;
            const newBalance = Math.max(0, currentBalance + amount);

            // Update balance
            await User.updateOne(
                { _id: employeeId },
                { $set: { [`leaveBalances.${leaveType}`]: newBalance } },
                { session }
            );

            // Record in ledger
            const now = getISTNow();
            const { month, year } = getISTDateParts(now);

            await LeaveLedger.recordTransaction({
                employeeId,
                leaveType,
                transactionType: 'ADJUSTMENT',
                amount,
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                month,
                year,
                source: 'ADMIN',
                performedBy: adminId,
                description: reason,
                metadata: {
                    adjustmentType: amount > 0 ? 'CREDIT' : 'DEBIT'
                }
            }, session);

            await session.commitTransaction();

            logger.info(`[LeaveAccrual] Manual adjustment completed`, {
                employeeId,
                leaveType,
                amount,
                balanceBefore: currentBalance,
                balanceAfter: newBalance,
                adminId
            });

            return {
                success: true,
                employeeName: employee.fullName,
                leaveType,
                amount,
                balanceBefore: currentBalance,
                balanceAfter: newBalance
            };

        } catch (error) {
            await session.abortTransaction();
            logger.error(`[LeaveAccrual] Manual adjustment failed`, {
                error: error.message,
                employeeId,
                leaveType,
                amount
            });
            throw error;
        } finally {
            session.endSession();
        }
    }

    /**
     * Get accrual history for an employee
     * @param {ObjectId} employeeId - Employee ID
     * @param {Object} options - Query options
     * @returns {Array} Accrual history
     */
    static async getAccrualHistory(employeeId, options = {}) {
        return await LeaveLedger.getBalanceHistory(employeeId, null, options);
    }

    /**
     * Verify balance integrity for an employee
     * @param {ObjectId} employeeId - Employee ID
     * @returns {Object} Verification results
     */
    static async verifyBalanceIntegrity(employeeId) {
        const results = {};
        
        for (const leaveType of ['sick', 'casual', 'paid']) {
            results[leaveType] = await LeaveLedger.verifyBalance(employeeId, leaveType);
        }
        
        return results;
    }
}

module.exports = LeaveAccrualService;
