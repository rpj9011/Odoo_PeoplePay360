// backend/services/teamsUpcomingLeavesService.js
/**
 * Teams Upcoming Leaves Notification Service
 * 
 * Allows HR to manually send a report of all employees on leave in the upcoming weeks.
 * HR can preview, add/remove employees, and send to Teams channel.
 */

const axios = require('axios');
const User = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');
const Setting = require('../models/Setting');
const { getISTNow, getISTDateString, startOfISTDay } = require('../utils/istTime');

const TEAMS_WEBHOOK_KEY = 'teamsAttendanceWebhookUrl';

/**
 * Returns a display label for a leave record combining requestType + leaveType.
 */
const buildLeaveLabel = (requestType, leaveType) => {
    const typeMap = {
        'Sick':             { emoji: '🤒', name: 'Sick Leave'        },
        'Casual':           { emoji: '📅', name: 'Casual Leave'       },
        'Planned':          { emoji: '🏖️', name: 'Planned Leave'      },
        'Compensatory':     { emoji: '🔄', name: 'Compensatory Leave' },
        'Comp-Off':         { emoji: '🔄', name: 'Comp Off'           },
        'COMP_OFF':         { emoji: '🔄', name: 'Comp Off'           },
        'Loss of Pay':      { emoji: '💸', name: 'Loss of Pay'        },
        'Backdated Leave':  { emoji: '📋', name: 'Backdated Leave'    },
        'YEAR_END':         { emoji: '🗓️', name: 'Year-End Leave'     },
    };

    const { emoji = '🟡', name = 'On Leave' } = typeMap[requestType] || {};

    if (leaveType === 'Half Day - First Half') {
        return `🌗 Half Day (AM)${name !== 'On Leave' ? ` – ${name.replace(' Leave', '')}` : ''}`;
    }
    if (leaveType === 'Half Day - Second Half') {
        return `🌓 Half Day (PM)${name !== 'On Leave' ? ` – ${name.replace(' Leave', '')}` : ''}`;
    }

    return `${emoji} ${name}`;
};

/**
 * Format date range for display
 */
const formatDateRange = (dates) => {
    if (!dates || dates.length === 0) return '—';
    
    const sortedDates = dates.map(d => new Date(d)).sort((a, b) => a - b);
    const first = sortedDates[0];
    const last = sortedDates[sortedDates.length - 1];
    
    const formatDate = (date) => date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
    });
    
    if (sortedDates.length === 1) {
        return formatDate(first);
    }
    
    return `${formatDate(first)} - ${formatDate(last)}`;
};

/**
 * Get upcoming leaves for the next N weeks
 */
const getUpcomingLeaves = async (weeksAhead = 2) => {
    const now = getISTNow();
    const startDate = startOfISTDay(now);
    const endDate = new Date(startDate.getTime() + (weeksAhead * 7 * 24 * 60 * 60 * 1000));
    
    // Get all approved leaves that fall within the date range
    const upcomingLeaves = await LeaveRequest.find({
        status: 'Approved',
        leaveDates: {
            $elemMatch: {
                $gte: startDate,
                $lt: endDate,
            }
        }
    })
    .populate('employee', 'fullName designation')
    .select('employee leaveType requestType leaveDates')
    .lean();
    
    // Group by employee and format
    const employeeLeaveMap = new Map();
    
    for (const leave of upcomingLeaves) {
        if (!leave.employee) continue;
        
        const empId = leave.employee._id.toString();
        const leaveDatesInRange = leave.leaveDates.filter(d => {
            const date = new Date(d);
            return date >= startDate && date < endDate;
        });
        
        if (leaveDatesInRange.length === 0) continue;
        
        if (!employeeLeaveMap.has(empId)) {
            employeeLeaveMap.set(empId, {
                id: empId,
                name: leave.employee.fullName,
                designation: leave.employee.designation || '—',
                leaves: []
            });
        }
        
        employeeLeaveMap.get(empId).leaves.push({
            leaveType: buildLeaveLabel(leave.requestType, leave.leaveType),
            dateRange: formatDateRange(leaveDatesInRange),
            dates: leaveDatesInRange,
            requestType: leave.requestType,
            leaveTypeRaw: leave.leaveType,
        });
    }
    
    // Convert to array and sort by name
    const employees = Array.from(employeeLeaveMap.values())
        .sort((a, b) => a.name.localeCompare(b.name));
    
    return {
        employees,
        weeksAhead,
        startDate: getISTDateString(startDate),
        endDate: getISTDateString(new Date(endDate.getTime() - 1)),
        totalEmployees: employees.length,
    };
};

/**
 * Build Adaptive Card payload for upcoming leaves
 */
const buildUpcomingLeavesPayload = (employees, weeksAhead, startDate, endDate) => {
    const startDateObj = new Date(startDate + 'T00:00:00+05:30');
    const endDateObj = new Date(endDate + 'T00:00:00+05:30');
    
    const formatDate = (dateStr) => {
        const date = new Date(dateStr + 'T00:00:00+05:30');
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
        });
    };
    
    const columns = [
        { width: 2 },  // Employee
        { width: 2 },  // Designation
        { width: 2 },  // Leave Type
        { width: 2 },  // Dates
    ];
    
    const makeHeaderCell = (text) => ({
        type: 'TableCell',
        style: 'accent',
        items: [{ type: 'TextBlock', text, weight: 'Bolder', color: 'Light', wrap: true }],
    });
    
    const headerRow = {
        type: 'TableRow',
        style: 'accent',
        cells: [
            makeHeaderCell('Employee'),
            makeHeaderCell('Designation'),
            makeHeaderCell('Leave Type'),
            makeHeaderCell('Dates'),
        ],
    };
    
    const rows = [];
    
    for (const emp of employees) {
        for (const leave of emp.leaves) {
            rows.push({
                type: 'TableRow',
                cells: [
                    {
                        type: 'TableCell',
                        items: [{ type: 'TextBlock', text: emp.name, wrap: true, weight: 'Bolder' }],
                    },
                    {
                        type: 'TableCell',
                        items: [{ type: 'TextBlock', text: emp.designation, wrap: true }],
                    },
                    {
                        type: 'TableCell',
                        items: [{ type: 'TextBlock', text: leave.leaveType, wrap: true, color: 'Warning' }],
                    },
                    {
                        type: 'TableCell',
                        items: [{ type: 'TextBlock', text: leave.dateRange, wrap: true }],
                    },
                ],
            });
        }
    }
    
    const bodyBlocks = [
        // Header banner
        {
            type: 'ColumnSet',
            style: 'emphasis',
            bleed: true,
            columns: [
                {
                    type: 'Column',
                    width: 'auto',
                    items: [{ type: 'TextBlock', text: '📅', size: 'ExtraLarge' }],
                    verticalContentAlignment: 'Center',
                },
                {
                    type: 'Column',
                    width: 'stretch',
                    items: [
                        {
                            type: 'TextBlock',
                            text: `Upcoming Leaves (Next ${weeksAhead} Week${weeksAhead > 1 ? 's' : ''})`,
                            weight: 'Bolder',
                            size: 'Large',
                            color: 'Accent',
                        },
                        {
                            type: 'TextBlock',
                            text: `${formatDate(startDate)} - ${formatDate(endDate)}`,
                            isSubtle: true,
                            spacing: 'None',
                            wrap: true,
                        },
                    ],
                    verticalContentAlignment: 'Center',
                },
            ],
        },
        // Summary
        {
            type: 'TextBlock',
            spacing: 'Medium',
            text: employees.length === 0
                ? '✅ No employees on leave in the upcoming period.'
                : `📊 **${employees.length} employee${employees.length > 1 ? 's' : ''}** will be on leave`,
            wrap: true,
            size: 'Medium',
        },
    ];
    
    // Table
    if (rows.length > 0) {
        bodyBlocks.push({
            type: 'Table',
            gridStyle: 'accent',
            firstRowAsHeader: true,
            columns,
            rows: [headerRow, ...rows],
        });
    }
    
    // Footer
    bodyBlocks.push({
        type: 'TextBlock',
        spacing: 'Small',
        separator: true,
        text: `Total: **${employees.length}** employee${employees.length > 1 ? 's' : ''} on leave`,
        isSubtle: true,
        size: 'Small',
        wrap: true,
    });
    
    return {
        type: 'message',
        attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            contentUrl: null,
            content: {
                '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
                type: 'AdaptiveCard',
                version: '1.4',
                body: bodyBlocks,
            },
        }],
    };
};

/**
 * Send upcoming leaves report to Teams
 */
const sendUpcomingLeavesReport = async (employees, weeksAhead, startDate, endDate) => {
    const webhookSetting = await Setting.findOne({ key: TEAMS_WEBHOOK_KEY });
    const webhookUrl = webhookSetting?.value;
    
    if (!webhookUrl) {
        throw new Error('No webhook URL configured.');
    }
    
    const payload = buildUpcomingLeavesPayload(employees, weeksAhead, startDate, endDate);
    
    const response = await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
    });
    
    if (response.status !== 200 && response.status !== 202) {
        throw new Error(`Webhook returned ${response.status}`);
    }
    
    console.log('[TeamsUpcomingLeaves] ✅ Report sent successfully.');
};

module.exports = {
    getUpcomingLeaves,
    sendUpcomingLeavesReport,
};
