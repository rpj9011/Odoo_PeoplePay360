// backend/cron/leaveAccrualCron.js
/**
 * Leave Accrual Cron Job
 * 
 * SCHEDULE: 1st of every month at 00:05 IST
 * PURPOSE: Automated monthly leave accrual for permanent employees
 * SAFETY: Idempotent execution (safe to re-run)
 */

const LeaveAccrualService = require('../services/LeaveAccrualService');
const { getISTNow, getISTDateParts } = require('../utils/istTime');
const { logger } = require('../utils/logger');

/**
 * Execute monthly leave accrual
 * @param {Object} options - Execution options
 * @returns {Object} Execution result
 */
async function executeLeaveAccrual(options = {}) {
    const startTime = Date.now();
    const now = getISTNow();
    const { month, year } = getISTDateParts(now);

    logger.info(`[LeaveAccrualCron] Starting monthly accrual`, {
        month,
        year,
        timestamp: now.toISOString(),
        options
    });

    try {
        // Execute accrual
        const result = await LeaveAccrualService.processMonthlyAccrual(
            month,
            year,
            options
        );

        const duration = Date.now() - startTime;

        if (result.success) {
            logger.info(`[LeaveAccrualCron] Accrual completed successfully`, {
                month,
                year,
                employeesProcessed: result.employeesProcessed,
                employeesFailed: result.employeesFailed,
                duration: `${duration}ms`
            });

            // Send notification email to HR (optional)
            if (process.env.ENABLE_ACCRUAL_NOTIFICATIONS === 'true') {
                await sendAccrualNotification(result);
            }
        } else {
            logger.warn(`[LeaveAccrualCron] Accrual skipped or failed`, {
                month,
                year,
                reason: result.reason,
                duration: `${duration}ms`
            });
        }

        return result;

    } catch (error) {
        const duration = Date.now() - startTime;
        
        logger.error(`[LeaveAccrualCron] Fatal error during accrual`, {
            month,
            year,
            error: error.message,
            stack: error.stack,
            duration: `${duration}ms`
        });

        // Send error notification to admins
        if (process.env.ENABLE_ACCRUAL_NOTIFICATIONS === 'true') {
            await sendAccrualErrorNotification(error, month, year);
        }

        throw error;
    }
}

/**
 * Send accrual completion notification to HR
 * @param {Object} result - Accrual result
 */
async function sendAccrualNotification(result) {
    try {
        const { sendEmail } = require('../services/mailService');
        const Setting = require('../models/Setting');

        // Get HR notification emails
        let recipients = [];
        const hrEmailSetting = await Setting.findOne({ key: 'hrNotificationEmails' });
        
        if (hrEmailSetting && Array.isArray(hrEmailSetting.value) && hrEmailSetting.value.length > 0) {
            recipients = hrEmailSetting.value;
        } else if (process.env.HR_EMAILS) {
            recipients = process.env.HR_EMAILS.split(',').map(email => email.trim());
        }

        if (recipients.length === 0) {
            logger.warn(`[LeaveAccrualCron] No HR email recipients configured for notification`);
            return;
        }

        const summary = result.accruals.reduce((acc, emp) => {
            if (!emp.skipped) {
                for (const [leaveType, data] of Object.entries(emp.accruals)) {
                    if (data.amount > 0) {
                        acc[leaveType] = (acc[leaveType] || 0) + data.amount;
                    }
                }
            }
            return acc;
        }, {});

        const subject = `Leave Accrual Completed - ${LeaveAccrualService.getMonthName(result.month)} ${result.year}`;
        const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #4CAF50; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">Leave Accrual Completed</h1>
                </div>
                <div style="padding: 20px;">
                    <p>The monthly leave accrual for <strong>${LeaveAccrualService.getMonthName(result.month)} ${result.year}</strong> has been completed successfully.</p>
                    
                    <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px;">Summary</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr style="background-color: #f9f9f9;">
                            <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Employees Processed:</td>
                            <td style="padding: 10px; border: 1px solid #eee;">${result.employeesProcessed}</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Employees Failed:</td>
                            <td style="padding: 10px; border: 1px solid #eee;">${result.employeesFailed}</td>
                        </tr>
                        <tr style="background-color: #f9f9f9;">
                            <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Total Employees:</td>
                            <td style="padding: 10px; border: 1px solid #eee;">${result.totalEmployees}</td>
                        </tr>
                    </table>

                    <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px;">Accrual Breakdown</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                        <tr style="background-color: #f9f9f9;">
                            <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Sick Leave:</td>
                            <td style="padding: 10px; border: 1px solid #eee;">${summary.sick || 0} days</td>
                        </tr>
                        <tr>
                            <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Casual Leave:</td>
                            <td style="padding: 10px; border: 1px solid #eee;">${summary.casual || 0} days</td>
                        </tr>
                        <tr style="background-color: #f9f9f9;">
                            <td style="padding: 10px; border: 1px solid #eee; font-weight: bold;">Planned Leave:</td>
                            <td style="padding: 10px; border: 1px solid #eee;">${summary.paid || 0} days</td>
                        </tr>
                    </table>

                    ${result.employeesFailed > 0 ? `
                        <div style="margin-top: 20px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107;">
                            <strong>Warning:</strong> ${result.employeesFailed} employee(s) failed to process. Please check the system logs for details.
                        </div>
                    ` : ''}

                    <div style="text-align: center; margin-top: 30px;">
                        <a href="${process.env.FRONTEND_URL || 'https://attendance.bylinelms.com'}/admin/leave-management" style="background-color: #4CAF50; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Leave Management</a>
                    </div>
                </div>
                <div style="background-color: #f2f2f2; padding: 10px; text-align: center; font-size: 12px; color: #777;">
                    This is an automated notification from the AMS Portal.
                </div>
            </div>
        `;

        await sendEmail({
            to: recipients.join(','),
            subject,
            html,
            isHREmail: true
        });

        logger.info(`[LeaveAccrualCron] Notification email sent to HR`);

    } catch (error) {
        logger.error(`[LeaveAccrualCron] Failed to send notification email`, {
            error: error.message
        });
    }
}

/**
 * Send error notification to admins
 * @param {Error} error - Error object
 * @param {number} month - Month
 * @param {number} year - Year
 */
async function sendAccrualErrorNotification(error, month, year) {
    try {
        const { sendEmail } = require('../services/mailService');
        const Setting = require('../models/Setting');

        // Get admin emails
        let recipients = [];
        const adminEmailSetting = await Setting.findOne({ key: 'adminNotificationEmails' });
        
        if (adminEmailSetting && Array.isArray(adminEmailSetting.value) && adminEmailSetting.value.length > 0) {
            recipients = adminEmailSetting.value;
        } else if (process.env.ADMIN_EMAILS) {
            recipients = process.env.ADMIN_EMAILS.split(',').map(email => email.trim());
        }

        if (recipients.length === 0) {
            logger.warn(`[LeaveAccrualCron] No admin email recipients configured for error notification`);
            return;
        }

        const subject = `URGENT: Leave Accrual Failed - ${LeaveAccrualService.getMonthName(month)} ${year}`;
        const html = `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
                <div style="background-color: #D32F2F; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">⚠️ Leave Accrual Failed</h1>
                </div>
                <div style="padding: 20px;">
                    <p>The monthly leave accrual for <strong>${LeaveAccrualService.getMonthName(month)} ${year}</strong> has failed.</p>
                    
                    <div style="margin-top: 20px; padding: 15px; background-color: #ffebee; border-left: 4px solid #D32F2F;">
                        <strong>Error:</strong><br>
                        <code style="display: block; margin-top: 10px; padding: 10px; background-color: #fff; border: 1px solid #ddd; border-radius: 4px; overflow-x: auto;">${error.message}</code>
                    </div>

                    <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px;">Action Required</h3>
                    <ul>
                        <li>Check system logs for detailed error information</li>
                        <li>Verify database connectivity and integrity</li>
                        <li>Manually trigger accrual if needed</li>
                        <li>Contact technical support if issue persists</li>
                    </ul>

                    <div style="text-align: center; margin-top: 30px;">
                        <a href="${process.env.FRONTEND_URL || 'https://attendance.bylinelms.com'}/admin/system-logs" style="background-color: #D32F2F; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">View System Logs</a>
                    </div>
                </div>
                <div style="background-color: #f2f2f2; padding: 10px; text-align: center; font-size: 12px; color: #777;">
                    This is an automated alert from the AMS Portal.
                </div>
            </div>
        `;

        await sendEmail({
            to: recipients.join(','),
            subject,
            html,
            isHREmail: true
        });

        logger.info(`[LeaveAccrualCron] Error notification email sent to admins`);

    } catch (emailError) {
        logger.error(`[LeaveAccrualCron] Failed to send error notification email`, {
            error: emailError.message
        });
    }
}

module.exports = {
    executeLeaveAccrual,
    sendAccrualNotification,
    sendAccrualErrorNotification
};
