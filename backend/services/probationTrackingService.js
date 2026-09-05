// backend/services/probationTrackingService.js
// REMOVED: Legacy working-days-based probation logic
// Reason: Company policy uses calendar months + leave/absence extensions
// All probation calculations now use /api/analytics/probation-tracker endpoint (single source of truth)

const User = require('../models/User');
const NewNotificationService = require('./NewNotificationService');

class ProbationTrackingService {
    /**
     * REMOVED: Legacy working-days-based probation calculation
     * Use /api/analytics/probation-tracker endpoint instead (authoritative source)
     * Company policy: Probation is 6 calendar months from joining date, extended by approved leaves AND absences.
     * 
     * @deprecated This method has been permanently removed
     * @throws Error - This method is no longer available
     */
    static async calculateProbationProgress(userId, startDate) {
        throw new Error('Legacy probation calculation method has been removed. Use /api/analytics/probation-tracker endpoint instead.');
    }
    
    /**
     * REMOVED: Legacy working-days-based probation completion check
     * Use /api/analytics/probation-tracker endpoint for accurate probation data.
     * Company policy: Probation is 6 calendar months from joining date, extended by approved leaves AND absences.
     * 
     * @deprecated This method has been permanently removed
     * @throws Error - This method is no longer available
     */
    static async checkProbationCompletions() {
        throw new Error('Legacy probation completion check has been removed. Use /api/analytics/probation-tracker endpoint instead.');
    }

    /**
     * REMOVED: Legacy date-based probation status check
     * This method relied on probationEndDate field which may be incorrect.
     * For accurate probation end dates, use /api/analytics/probation-tracker endpoint.
     * 
     * @deprecated This method has been permanently removed
     * @throws Error - This method is no longer available
     */
    static async checkDateBasedProbationStatus() {
        throw new Error('Legacy date-based probation status check has been removed. Use /api/analytics/probation-tracker endpoint instead.');
    }

    /**
     * REMOVED: Legacy notification creation method
     * Use /api/analytics/probation-tracker endpoint for probation data and create notifications separately.
     * 
     * @deprecated This method has been permanently removed
     * @throws Error - This method is no longer available
     */
    static async createProbationCompletionNotificationNew(employee) {
        throw new Error('Legacy notification creation method has been removed.');
    }
    
    /**
     * REMOVED: Legacy notification creation method
     * Use /api/analytics/probation-tracker endpoint for probation data and create notifications separately.
     * 
     * @deprecated This method has been permanently removed
     * @throws Error - This method is no longer available
     */
    static async createProbationCompletionNotification(employee, progress) {
        throw new Error('Legacy notification creation method has been removed.');
    }
    
    /**
     * REMOVED: Legacy notification check method
     * 
     * @deprecated This method has been permanently removed
     * @throws Error - This method is no longer available
     */
    static async getExistingProbationNotification(employeeId) {
        throw new Error('Legacy notification check method has been removed.');
    }
    
    /**
     * Promote employee to permanent status with leave allocation
     * This method is still active and used for promoting employees.
     */
    static async promoteEmployeeToPermanent(employeeId, adminUserId) {
        try {
            const employee = await User.findById(employeeId);
            if (!employee) {
                throw new Error('Employee not found');
            }
            
            if (employee.employmentStatus !== 'Probation') {
                throw new Error('Employee is not on probation');
            }
            
            // Update employment status to Permanent
            employee.employmentStatus = 'Permanent';
            employee.confirmationDate = new Date();

            await employee.save();

            // Grant the prorated remaining-year leave allotment (Option C).
            // This credits leaveBalances directly via its own transaction and sets the
            // self-expiring probationConfirmation cap — do NOT set leaveBalances or
            // leaveEntitlements manually here, LeaveAccrualService owns that now.
            const LeaveAccrualService = require('./LeaveAccrualService');
            const allotmentResult = await LeaveAccrualService.applyConfirmationAllotment(
                employeeId,
                employee.confirmationDate,
                adminUserId
            );

            // Refresh employee doc so the notification/response below reflects the new balances
            const updatedEmployee = await User.findById(employeeId);
            
            // Create success notification for admin
            await NewNotificationService.createAndEmitNotification({
                message: `${updatedEmployee.fullName} has been successfully promoted to permanent employee with leave allocations.`,
                type: 'success',
                userId: adminUserId,
                userName: 'System',
                recipientType: 'admin',
                category: 'probation',
                priority: 'medium'
            });
            
            // Create notification for the employee
            await NewNotificationService.createAndEmitNotification({
                message: `Congratulations! You have been promoted to permanent employee status. Your leave balances have been allocated.`,
                type: 'success',
                userId: employeeId,
                userName: updatedEmployee.fullName,
                recipientType: 'user',
                category: 'probation',
                priority: 'high'
            });
            
            console.log(`[ProbationTracking] Successfully promoted ${updatedEmployee.fullName} to permanent`);
            
            return {
                success: true,
                message: 'Employee promoted to permanent status successfully',
                employee: {
                    id: updatedEmployee._id,
                    name: updatedEmployee.fullName,
                    employeeCode: updatedEmployee.employeeCode,
                    employmentStatus: updatedEmployee.employmentStatus,
                    leaveBalances: updatedEmployee.leaveBalances
                },
                confirmationAllotment: allotmentResult.allotments
            };
        } catch (error) {
            console.error('[ProbationTracking] Error promoting employee:', error);
            throw error;
        }
    }
}

module.exports = ProbationTrackingService;
