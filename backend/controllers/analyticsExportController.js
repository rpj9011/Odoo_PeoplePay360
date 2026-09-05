/**
 * ANALYTICS EXPORT CONTROLLER
 * 
 * Handles exporting employee analytics data to Excel and PDF formats.
 * Updated with corrected overtime calculation logic.
 */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const User = require('../models/User');
const AttendanceSummaryService = require('../services/AttendanceSummaryService');
const AttendanceLog = require('../models/AttendanceLog');
const analyticsCacheService = require('../services/analyticsCacheService');
const { getISTDateString } = require('../utils/istTime');

/**
 * Calculate overtime hours based on new logic:
 * - Daily work requirement: 8.5 hours
 * - Overtime: Hours worked AFTER 8.5 hours completion AND after 7 PM
 * - Exclude: Work done before 10 AM (doesn't count as overtime even if early)
 * 
 * @param {Object} log - Attendance log with clock in/out times
 * @param {number} totalWorkingHours - Total hours worked
 * @returns {number} Overtime hours
 */
function calculateOvertimeHours(log, totalWorkingHours) {
    // If no clock times or less than required hours, no overtime
    if (!log.clockInTime || !log.clockOutTime || totalWorkingHours <= 8.5) {
        return 0;
    }
    
    try {
        // Ensure clock times are strings
        const clockInTime = String(log.clockInTime || '');
        const clockOutTime = String(log.clockOutTime || '');
        
        // Validate format
        if (!clockInTime.includes(':') || !clockOutTime.includes(':')) {
            return 0;
        }
        
        // Parse clock-out time to check if after 7 PM
        const clockOutParts = clockOutTime.split(':');
        const clockOutHour = parseInt(clockOutParts[0]);
        
        // Parse clock-in time to check if before 10 AM
        const clockInParts = clockInTime.split(':');
        const clockInHour = parseInt(clockInParts[0]);
        
        // Calculate hours worked after completing 8.5 hours
        const hoursAboveRequired = totalWorkingHours - 8.5;
        
        // Only count as overtime if:
        // 1. Worked more than 8.5 hours
        // 2. Clock out is after 7 PM (19:00)
        if (hoursAboveRequired > 0 && clockOutHour >= 19) {
            // Don't count time before 10 AM as overtime contribution
            // This is handled by using totalWorkingHours which should already exclude
            // or appropriately account for early arrival
            return hoursAboveRequired;
        }
        
        return 0;
    } catch (error) {
        console.error('[calculateOvertimeHours] Error:', error);
        return 0;
    }
}

/**
 * Calculate employee KPIs
 */
function calculateEmployeeKPIs(summaryData, detailedLogsMap, shiftGroup) {
    const totalDays = summaryData.length;
    let presentDays = 0;
    let absentDays = 0;
    let halfDays = 0;
    let leaveDays = 0;
    let weekendDays = 0;
    let holidayDays = 0;
    let totalWorkedHours = 0;
    let overtimeHours = 0;
    
    summaryData.forEach(day => {
        const status = day.finalStatus;
        const detailedLog = detailedLogsMap.get(day.date);
        const workingHours = day.totalWorkingHours || 0;
        
        if (status === 'Present' || status === 'On-time' || status === 'Late') {
            presentDays++;
            totalWorkedHours += workingHours;
            
            // Calculate overtime using new logic
            if (detailedLog) {
                const dayOvertime = calculateOvertimeHours(detailedLog, workingHours);
                overtimeHours += dayOvertime;
            }
        } else if (status === 'Absent') {
            absentDays++;
        } else if (status === 'Leave' || status === 'Approved Leave') {
            leaveDays++;
        } else if (status === 'Weekend' || status === 'Weekly Off') {
            weekendDays++;
        } else if (status === 'Holiday') {
            holidayDays++;
        }
        
        if (day.isHalfDay) {
            halfDays++;
        }
    });
    
    const workingDays = totalDays - weekendDays - holidayDays;
    const attendanceRate = workingDays > 0 ? ((presentDays + halfDays * 0.5) / workingDays * 100) : 0;
    const avgWorkingHours = presentDays > 0 ? (totalWorkedHours / presentDays) : 0;
    
    return {
        totalDays,
        presentDays,
        absentDays,
        halfDays,
        leaveDays,
        weekendDays,
        holidayDays,
        workingDays,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        totalWorkedHours: Math.round(totalWorkedHours * 100) / 100,
        avgWorkingHours: Math.round(avgWorkingHours * 100) / 100,
        overtimeHours: Math.round(overtimeHours * 100) / 100
    };
}

/**
 * Determine day type for display
 */
function determineDayType(day, detailedLog) {
    if (day.finalStatus === 'Weekend' || day.finalStatus === 'Weekly Off') return 'Weekend';
    if (day.finalStatus === 'Holiday') return 'Holiday';
    if (day.finalStatus === 'Leave' || day.finalStatus === 'Approved Leave') return 'Leave';
    if (day.finalStatus === 'Absent') return 'Absent';
    if (detailedLog?.overriddenByAdmin) return 'Override';
    return 'Regular';
}

/**
 * Format hours to HH:MM format
 */
function formatHoursToHHMM(hours) {
    if (!hours || hours === 0) return '00:00';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Generate PDF report for employee analytics
 */
async function generatePDF(employee, metrics, dailyLogs, month, year) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ 
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 }
            });
            
            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            
            // Title
            doc.fontSize(20).font('Helvetica-Bold').text('Employee Analytics Report', { align: 'center' });
            doc.moveDown();
            
            // Employee Information
            doc.fontSize(14).font('Helvetica-Bold').text('Employee Information', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica');
            doc.text(`Employee Name: ${employee.fullName}`);
            doc.text(`Employee Code: ${employee.employeeCode}`);
            doc.text(`Department: ${employee.department || 'N/A'}`);
            doc.text(`Designation: ${employee.designation || 'N/A'}`);
            doc.text(`Shift Group: ${employee.shiftGroup?.name || 'N/A'}`);
            const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
            doc.text(`Period: ${monthName} ${year}`);
            doc.moveDown();
            
            // Summary Metrics - As shown in the image
            doc.fontSize(14).font('Helvetica-Bold').text('Summary Metrics', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica');
            
            // Create a table-like layout for metrics
            const startY = doc.y;
            const col1X = 50;
            const col2X = 200;
            const col3X = 350;
            const lineHeight = 20;
            
            // Row 1: Present Days, Leave Days, Absent Days
            doc.text('Present Days:', col1X, startY);
            doc.text(metrics.presentDays.toString(), col1X + 120, startY);
            doc.text('Leave Days:', col2X, startY);
            doc.text(metrics.leaveDays.toString(), col2X + 100, startY);
            
            // Row 2: Non-Working Days, Total Net Hours, Avg Working Hours
            doc.text('Absent Days:', col1X, startY + lineHeight);
            doc.text(metrics.absentDays.toString(), col1X + 120, startY + lineHeight);
            doc.text('Non-Working Days:', col2X, startY + lineHeight);
            doc.text((metrics.leaveDays + metrics.absentDays).toString(), col2X + 100, startY + lineHeight);
            
            // Row 3: Overtime Hours, Attendance %
            doc.text('Total Net Hours:', col1X, startY + lineHeight * 2);
            doc.text(formatHoursToHHMM(metrics.totalWorkedHours), col1X + 120, startY + lineHeight * 2);
            doc.text('Avg Working Hours:', col2X, startY + lineHeight * 2);
            doc.text(formatHoursToHHMM(metrics.avgWorkingHours), col2X + 100, startY + lineHeight * 2);
            
            // Row 4
            doc.text('Overtime Hours:', col1X, startY + lineHeight * 3);
            doc.text(formatHoursToHHMM(metrics.overtimeHours), col1X + 120, startY + lineHeight * 3);
            doc.text('Attendance %:', col2X, startY + lineHeight * 3);
            doc.text(`${metrics.attendanceRate.toFixed(2)}%`, col2X + 100, startY + lineHeight * 3);
            
            doc.moveDown(5);
            
            // Daily Attendance Logs
            doc.fontSize(14).font('Helvetica-Bold').text('Daily Attendance Logs', { underline: true });
            doc.moveDown(0.5);
            
            // Table headers
            doc.fontSize(9).font('Helvetica-Bold');
            const tableTop = doc.y;
            const tableHeaders = [
                { text: 'Date', x: 50, width: 60 },
                { text: 'Clock In', x: 110, width: 50 },
                { text: 'Clock Out', x: 160, width: 50 },
                { text: 'Worked', x: 210, width: 45 },
                { text: 'Break', x: 255, width: 40 },
                { text: 'Total', x: 295, width: 40 },
                { text: 'Type', x: 335, width: 50 },
                { text: 'Status', x: 385, width: 70 },
                { text: 'OT', x: 455, width: 35 },
                { text: 'Admin', x: 490, width: 55 }
            ];
            
            tableHeaders.forEach(header => {
                doc.text(header.text, header.x, tableTop, { width: header.width, align: 'left' });
            });
            
            doc.moveTo(50, tableTop + 12).lineTo(545, tableTop + 12).stroke();
            doc.moveDown(0.3);
            
            // Table rows
            doc.fontSize(8).font('Helvetica');
            dailyLogs.forEach((log, index) => {
                const y = doc.y;
                
                // Check if we need a new page
                if (y > 700) {
                    doc.addPage();
                    doc.fontSize(9).font('Helvetica-Bold');
                    tableHeaders.forEach(header => {
                        doc.text(header.text, header.x, 50, { width: header.width, align: 'left' });
                    });
                    doc.moveTo(50, 62).lineTo(545, 62).stroke();
                    doc.moveDown(0.3);
                    doc.fontSize(8).font('Helvetica');
                }
                
                const currentY = doc.y;
                doc.text(log.date, 50, currentY, { width: 60 });
                doc.text(log.clockIn, 110, currentY, { width: 50 });
                doc.text(log.clockOut, 160, currentY, { width: 50 });
                doc.text(formatHoursToHHMM(log.workedTime), 210, currentY, { width: 45 });
                doc.text(formatHoursToHHMM(log.breakTime), 255, currentY, { width: 40 });
                doc.text(formatHoursToHHMM(log.totalTime), 295, currentY, { width: 40 });
                doc.text(log.dayType, 335, currentY, { width: 50 });
                doc.text(log.status, 385, currentY, { width: 70 });
                doc.text(formatHoursToHHMM(log.overtime), 455, currentY, { width: 35 });
                doc.text(log.overriddenByAdmin, 490, currentY, { width: 55 });
                
                doc.moveDown(0.8);
            });
            
            // Footer - add to all pages
            const pages = doc.bufferedPageRange();
            if (pages && pages.count > 0) {
                for (let i = 0; i < pages.count; i++) {
                    try {
                        doc.switchToPage(i);
                        doc.fontSize(8).font('Helvetica')
                            .text(
                                `Generated on ${new Date().toLocaleDateString()} | Page ${i + 1} of ${pages.count}`,
                                50,
                                doc.page.height - 40,
                                { align: 'center' }
                            );
                    } catch (pageError) {
                        console.error(`[generatePDF] Error adding footer to page ${i}:`, pageError);
                    }
                }
            }
            
            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * GET /api/analytics/export/employee/:employeeId
 * Export employee analytics to Excel or CSV format
 */
async function exportEmployeeAnalytics(req, res) {
    try {
        const { employeeId } = req.params;
        const { month, year, format = 'xlsx' } = req.query;
        
        // Validate employee ID
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID format'
            });
        }
        
        // Validate month and year
        if (!month || !year) {
            return res.status(400).json({
                success: false,
                message: 'Month and year are required'
            });
        }
        
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);
        
        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({
                success: false,
                message: 'Invalid month. Must be between 01 and 12'
            });
        }
        
        // Validate format (removed CSV, added PDF)
        if (!['xlsx', 'pdf'].includes(format)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid format. Must be xlsx or pdf'
            });
        }
        
        // Fetch employee details
        const employee = await User.findById(employeeId)
            .select('fullName employeeCode department designation email joiningDate resignationDate')
            .populate('shiftGroup', 'name shiftType startTime endTime')
            .lean();
        
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        
        // Calculate date range
        const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(yearNum, monthNum, 0).getDate();
        const endDate = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        
        // Adjust date range if employee joined mid-month or resigned
        let effectiveStartDate = startDate;
        let effectiveEndDate = endDate;
        
        if (employee.joiningDate) {
            const joiningDateStr = getISTDateString(employee.joiningDate);
            if (joiningDateStr > startDate) {
                effectiveStartDate = joiningDateStr;
            }
        }
        
        if (employee.resignationDate) {
            const resignationDateStr = getISTDateString(employee.resignationDate);
            if (resignationDateStr < endDate) {
                effectiveEndDate = resignationDateStr;
            }
        }
        
        // Get attendance summary data
        const summaryData = await AttendanceSummaryService.getEmployeeAttendanceSummary(
            employeeId,
            effectiveStartDate,
            effectiveEndDate
        );
        
        // Fetch detailed attendance logs
        const detailedLogs = await AttendanceLog.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(employeeId),
                    attendanceDate: { $gte: effectiveStartDate, $lte: effectiveEndDate }
                }
            },
            {
                $project: {
                    attendanceDate: 1,
                    clockInTime: 1,
                    clockOutTime: 1,
                    totalWorkingHours: 1,
                    paidBreakMinutesTaken: 1,
                    unpaidBreakMinutesTaken: 1,
                    attendanceStatus: 1,
                    isHalfDay: 1,
                    halfDayReasonText: 1,
                    overriddenByAdmin: 1,
                    totalBreakTime: {
                        $divide: [
                            { $add: [
                                { $ifNull: ['$paidBreakMinutesTaken', 0] },
                                { $ifNull: ['$unpaidBreakMinutesTaken', 0] }
                            ]},
                            60
                        ]
                    }
                }
            },
            { $sort: { attendanceDate: 1 } }
        ]);
        
        // Create logs map
        const logsMap = new Map();
        detailedLogs.forEach(log => {
            logsMap.set(log.attendanceDate, log);
        });
        
        // Calculate KPIs with updated overtime logic
        const metrics = calculateEmployeeKPIs(summaryData, logsMap, employee.shiftGroup);
        
        // Build daily logs with overtime calculation
        const dailyLogs = summaryData.map(day => {
            const detailedLog = logsMap.get(day.date);
            const workingHours = day.totalWorkingHours || 0;
            const overtime = detailedLog ? calculateOvertimeHours(detailedLog, workingHours) : 0;
            
            return {
                date: day.date,
                clockIn: detailedLog?.clockInTime || '-',
                clockOut: detailedLog?.clockOutTime || '-',
                workedTime: workingHours,
                breakTime: detailedLog?.totalBreakTime || 0,
                totalTime: workingHours + (detailedLog?.totalBreakTime || 0),
                dayType: determineDayType(day, detailedLog),
                status: day.finalStatus,
                isHalfDay: day.isHalfDay ? 'Yes' : 'No',
                halfDayReason: day.halfDayReasonText || '-',
                overriddenByAdmin: day.overriddenByAdmin ? 'Yes' : 'No',
                overtime: overtime
            };
        });
        
        
        const monthName = new Date(yearNum, monthNum - 1).toLocaleString('default', { month: 'long' });
        const filename = `${employee.fullName.replace(/\s+/g, '_')}_Analytics_${monthName}_${yearNum}.${format}`;
        
        if (format === 'pdf') {
            // Generate PDF
            const pdfBuffer = await generatePDF(employee, metrics, dailyLogs, monthNum, yearNum);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(pdfBuffer);
            
        } else if (format === 'xlsx') {
            // Create Excel workbook
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Attendance System';
            workbook.created = new Date();
            
            const worksheet = workbook.addWorksheet('Employee Analytics');
            
            // Add employee info section
            worksheet.mergeCells('A1:D1');
            worksheet.getCell('A1').value = 'Employee Analytics Report';
            worksheet.getCell('A1').font = { size: 16, bold: true };
            worksheet.getCell('A1').alignment = { horizontal: 'center' };
            
            worksheet.getCell('A3').value = 'Employee Name:';
            worksheet.getCell('B3').value = employee.fullName;
            worksheet.getCell('A4').value = 'Employee Code:';
            worksheet.getCell('B4').value = employee.employeeCode;
            worksheet.getCell('A5').value = 'Department:';
            worksheet.getCell('B5').value = employee.department || 'N/A';
            worksheet.getCell('A6').value = 'Designation:';
            worksheet.getCell('B6').value = employee.designation || 'N/A';
            worksheet.getCell('A7').value = 'Shift Group:';
            worksheet.getCell('B7').value = employee.shiftGroup?.name || 'N/A';
            worksheet.getCell('A8').value = 'Period:';
            worksheet.getCell('B8').value = `${monthNum}/${yearNum}`;
            
            // Style employee info
            for (let i = 3; i <= 8; i++) {
                worksheet.getCell(`A${i}`).font = { bold: true };
            }
            
            // Add summary metrics section - matching the image layout
            worksheet.getCell('A10').value = 'Summary Metrics';
            worksheet.getCell('A10').font = { size: 14, bold: true };
            
            worksheet.getCell('A11').value = 'Present Days:';
            worksheet.getCell('B11').value = metrics.presentDays;
            worksheet.getCell('C11').value = 'Leave Days:';
            worksheet.getCell('D11').value = metrics.leaveDays;
            
            worksheet.getCell('A12').value = 'Absent Days:';
            worksheet.getCell('B12').value = metrics.absentDays;
            worksheet.getCell('C12').value = 'Non-Working Days:';
            worksheet.getCell('D12').value = metrics.leaveDays + metrics.absentDays;
            
            worksheet.getCell('A13').value = 'Total Net Hours:';
            worksheet.getCell('B13').value = formatHoursToHHMM(metrics.totalWorkedHours);
            worksheet.getCell('C13').value = 'Avg Working Hours:';
            worksheet.getCell('D13').value = formatHoursToHHMM(metrics.avgWorkingHours);
            
            worksheet.getCell('A14').value = 'Overtime Hours:';
            worksheet.getCell('B14').value = formatHoursToHHMM(metrics.overtimeHours);
            worksheet.getCell('C14').value = 'Attendance %:';
            worksheet.getCell('D14').value = `${metrics.attendanceRate.toFixed(2)}%`;
            
            // Style summary metrics
            for (let i = 11; i <= 14; i++) {
                worksheet.getCell(`A${i}`).font = { bold: true };
                worksheet.getCell(`C${i}`).font = { bold: true };
            }
            
            // Add daily logs table
            const tableStartRow = 16;
            worksheet.getCell(`A${tableStartRow}`).value = 'Daily Attendance Logs';
            worksheet.getCell(`A${tableStartRow}`).font = { size: 14, bold: true };
            
            // Add table headers
            const headerRow = tableStartRow + 1;
            const headers = [
                'Date', 'Clock In', 'Clock Out', 'Worked (hrs)', 'Break (hrs)', 
                'Total (hrs)', 'Day Type', 'Status', 'Half Day', 'Half Day Reason', 
                'Overtime (hrs)', 'Admin Override'
            ];
            worksheet.getRow(headerRow).values = headers;
            
            // Style headers
            worksheet.getRow(headerRow).font = { bold: true };
            worksheet.getRow(headerRow).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };
            
            // Add data rows
            dailyLogs.forEach((log, index) => {
                const row = headerRow + 1 + index;
                worksheet.getRow(row).values = [
                    log.date,
                    log.clockIn,
                    log.clockOut,
                    formatHoursToHHMM(log.workedTime),
                    formatHoursToHHMM(log.breakTime),
                    formatHoursToHHMM(log.totalTime),
                    log.dayType,
                    log.status,
                    log.isHalfDay,
                    log.halfDayReason,
                    formatHoursToHHMM(log.overtime),
                    log.overriddenByAdmin
                ];
            });
            
            // Auto-fit columns
            worksheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: true }, cell => {
                    const columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxLength) {
                        maxLength = columnLength;
                    }
                });
                column.width = maxLength < 10 ? 10 : maxLength + 2;
            });
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            // Write workbook to buffer first, then send
            const buffer = await workbook.xlsx.writeBuffer();
            res.send(buffer);
        }
        
    } catch (error) {
        console.error('[analyticsExportController.exportEmployeeAnalytics] Error:', error);
        
        // If headers already sent, can't send JSON error
        if (res.headersSent) {
            return res.end();
        }
        
        res.status(500).json({
            success: false,
            message: 'Failed to export employee analytics',
            error: error.message
        });
    }
}

module.exports = {
    exportEmployeeAnalytics
};
