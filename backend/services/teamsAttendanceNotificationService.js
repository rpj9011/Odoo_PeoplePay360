// backend/services/teamsAttendanceNotificationService.js
/**
 * Teams Attendance Notification Service — Power Automate Webhook
 *
 * INTELLIGENT DUAL-REPORT SYSTEM:
 *   Report 1 — Morning (default 11:35 IST): Covers Shift 1 & Shift 2 employees only.
 *   Report 2 — Afternoon (default 14:00 IST): Covers ALL shifts.
 *              Employees from Shift 1/2 who were absent at 11:35 but arrived by 2 PM
 *              are included as "Late" (with their actual clock-in time).
 *
 * EMPLOYEE STATUS OVERRIDE:
 *   Admins can override an employee's attendance status for a date range with a reason.
 *   Stored in 'teamsStatusOverrides' Setting key as an array.
 */

const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const LeaveRequest = require('../models/LeaveRequest');
const Setting = require('../models/Setting');
const { getISTNow, getISTDateString, startOfISTDay } = require('../utils/istTime');
const LeavePolicyService = require('./LeavePolicyService');

const TEAMS_WEBHOOK_KEY      = 'teamsAttendanceWebhookUrl';
const NOTIFICATION_SENT_KEY  = 'teamsAttendanceLastSentDate';
const REPORT_CONFIG_KEY      = 'teamsReportConfig';
const STATUS_OVERRIDES_KEY   = 'teamsStatusOverrides';
const MORNING_SENT_KEY       = 'teamsAttendanceMorningSentDate';
const AFTERNOON_SENT_KEY     = 'teamsAttendanceAfternoonSentDate';

const DEFAULT_CONFIG = {
    showAbsent:             true,
    showOnLeave:            true,
    showPresent:            false,
    showLateEmployees:      false,
    showClockInTime:        false,
    showLateMinutes:        false,
    showWorkingHours:       false,
    reportTime:             '11:35',  // Morning report (Shift 1 & 2)
    afternoonReportTime:    '14:00',  // Afternoon report (All shifts)
    afternoonReportEnabled: true,
    afternoonShiftStart:    '13:00',  // Shifts starting at/after this are "afternoon"
};

const isTodayWorkingDay = () => getISTNow().getDay() !== 0;

const getWebhookUrl = async () => {
    const s = await Setting.findOne({ key: TEAMS_WEBHOOK_KEY });
    return s?.value || null;
};

const getReportConfig = async () => {
    const s = await Setting.findOne({ key: REPORT_CONFIG_KEY });
    return s?.value ? { ...DEFAULT_CONFIG, ...s.value } : { ...DEFAULT_CONFIG };
};

const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

const isAfternoonShift = (shiftGroup, afternoonShiftStart) => {
    if (!shiftGroup?.startTime) return false;
    return timeToMinutes(shiftGroup.startTime) >= timeToMinutes(afternoonShiftStart);
};

// ─── Status Override helpers ─────────────────────────────────────────────────

const getStatusOverridesForDate = async (dateStr) => {
    const s = await Setting.findOne({ key: STATUS_OVERRIDES_KEY });
    const overrides = Array.isArray(s?.value) ? s.value : [];
    const map = new Map();
    for (const o of overrides) {
        if (o.date === dateStr && o.employeeId) {
            map.set(o.employeeId.toString(), { status: o.status, reason: o.reason });
        }
    }
    return map;
};

const saveStatusOverride = async (override) => {
    const s = await Setting.findOne({ key: STATUS_OVERRIDES_KEY });
    let overrides = Array.isArray(s?.value) ? [...s.value] : [];
    overrides = overrides.filter(o => !(o.employeeId === override.employeeId && o.date === override.date));
    overrides.push({ ...override, createdAt: new Date().toISOString() });
    await Setting.findOneAndUpdate({ key: STATUS_OVERRIDES_KEY }, { value: overrides }, { upsert: true, new: true });
};

const deleteStatusOverride = async (employeeId, date) => {
    const s = await Setting.findOne({ key: STATUS_OVERRIDES_KEY });
    let overrides = Array.isArray(s?.value) ? [...s.value] : [];
    overrides = overrides.filter(o => !(o.employeeId === employeeId && o.date === date));
    await Setting.findOneAndUpdate({ key: STATUS_OVERRIDES_KEY }, { value: overrides }, { upsert: true });
};

const getStatusOverrides = async (dateStr) => {
    const s = await Setting.findOne({ key: STATUS_OVERRIDES_KEY });
    let overrides = Array.isArray(s?.value) ? s.value : [];
    if (dateStr) overrides = overrides.filter(o => o.date === dateStr);
    // Auto-purge overrides older than 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    overrides = overrides.filter(o => !o.createdAt || new Date(o.createdAt) > cutoff);
    return overrides;
};

// ─── Formatting helpers ──────────────────────────────────────────────────────

const formatISTTime = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    });
};

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
    if (leaveType === 'Half Day - First Half')  return `🌗 Half Day (AM)${name !== 'On Leave' ? ` – ${name.replace(' Leave', '')}` : ''}`;
    if (leaveType === 'Half Day - Second Half') return `🌓 Half Day (PM)${name !== 'On Leave' ? ` – ${name.replace(' Leave', '')}` : ''}`;
    return `${emoji} ${name}`;
};

// ─── Core section builder ────────────────────────────────────────────────────

/**
 * Build attendance sections for a given scope.
 *
 * scope:
 *   'morning'   → Only non-afternoon-shift employees (for 11:35 report)
 *   'afternoon' → All employees (for 14:00 report); Shift-1/2 employees who
 *                 arrived late after morning cutoff now appear as Late
 *   'all'       → All employees (for preview/admin use)
 */
const buildSections = async (todayStr, scope = 'all', config = {}) => {
    const cfg        = { ...DEFAULT_CONFIG, ...config };
    const todayStart = startOfISTDay(getISTNow());
    const todayEnd   = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Parse today's date to check if it's Saturday
    const todayDate = new Date(todayStr + 'T00:00:00+05:30');
    const isSaturday = todayDate.getDay() === 6;

    const employees = await User.find({ isActive: true, role: { $nin: ['Admin'] } })
        .select('fullName designation _id shiftGroup alternateSaturdayPolicy')
        .populate({ path: 'shiftGroup', select: 'startTime endTime shiftName shiftType' })
        .lean();

    let filteredEmployees = employees;
    if (scope === 'morning') {
        filteredEmployees = employees.filter(e => !isAfternoonShift(e.shiftGroup, cfg.afternoonShiftStart));
    }

    // Filter out employees who have Saturday off (if today is Saturday)
    if (isSaturday) {
        filteredEmployees = filteredEmployees.filter(emp => {
            const saturdayPolicy = emp.alternateSaturdayPolicy || 'All Saturdays Working';
            const isSaturdayOff = LeavePolicyService.isSaturdayOff(todayDate, saturdayPolicy);
            return !isSaturdayOff; // Only include employees who are working today
        });
    }

    const employeeIds = filteredEmployees.map(e => e._id);

    const todayLogs = await AttendanceLog.find({
        user: { $in: employeeIds }, attendanceDate: todayStr,
    }).select('user clockInTime totalWorkingHours lateMinutes isLate attendanceStatus').lean();

    const logMap = new Map(todayLogs.map(l => [l.user.toString(), l]));

    const approvedLeaves = await LeaveRequest.find({
        employee: { $in: employeeIds }, status: 'Approved',
        leaveDates: { $elemMatch: { $gte: todayStart, $lt: todayEnd } },
    }).select('employee leaveType requestType').lean();

    const leaveMap = new Map();
    approvedLeaves.forEach(leave => leaveMap.set(leave.employee.toString(), buildLeaveLabel(leave.requestType, leave.leaveType)));

    const overrideMap = await getStatusOverridesForDate(todayStr);

    const sections = { present: [], late: [], onLeave: [], absent: [] };

    for (const emp of filteredEmployees) {
        const id  = emp._id.toString();
        const log = logMap.get(id);
        const override = overrideMap.get(id);

        const base = {
            name:        emp.fullName,
            designation: emp.designation,
            isAfternoon: isAfternoonShift(emp.shiftGroup, cfg.afternoonShiftStart),
        };

        // Admin status override takes priority
        if (override) {
            const overrideReason = override.reason || '';
            if (override.status === 'absent')   sections.absent.push({ ...base, overrideReason });
            else if (override.status === 'on_leave') sections.onLeave.push({ ...base, leaveType: '🟡 On Leave', overrideReason });
            else if (override.status === 'present') sections.present.push({ ...base, clockInTime: log?.clockInTime, totalWorkingHours: log?.totalWorkingHours, overrideReason });
            else if (override.status === 'late')    sections.late.push({ ...base, clockInTime: log?.clockInTime, lateMinutes: log?.lateMinutes, totalWorkingHours: log?.totalWorkingHours, overrideReason });
            continue;
        }

        // Normal classification
        if (leaveMap.has(id)) {
            sections.onLeave.push({ ...base, leaveType: leaveMap.get(id) });
        } else if (log?.clockInTime) {
            const empData = { ...base, clockInTime: log.clockInTime, totalWorkingHours: log.totalWorkingHours, lateMinutes: log.lateMinutes };
            // In afternoon scope: non-afternoon shift employees who clocked in late → Late
            if (scope === 'afternoon' && !base.isAfternoon) {
                // They were absent at morning report, now arrived late
                sections.late.push(empData);
            } else if (log.isLate) {
                sections.late.push(empData);
            } else {
                sections.present.push(empData);
            }
        } else {
            sections.absent.push({ ...base });
        }
    }

    Object.values(sections).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return { sections, totalEmployees: filteredEmployees.length };
};

// ─── Payload builder ─────────────────────────────────────────────────────────

const buildPayload = (sections, config, dateStr, reportLabel = '') => {
    const dateObj = new Date(dateStr + 'T00:00:00+05:30');
    const formattedDate = dateObj.toLocaleDateString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata',
    });

    const showTime    = config.showClockInTime  && (config.showAbsent || config.showPresent || config.showLateEmployees);
    const showHours   = config.showWorkingHours && (config.showPresent || config.showLateEmployees);
    const showLateMin = config.showLateMinutes  && config.showLateEmployees;

    // Check if any employee has an override reason — only show Reason column when needed
    const anyReason = [
        ...(sections.absent  || []),
        ...(sections.onLeave || []),
        ...(sections.present || []),
        ...(sections.late    || []),
    ].some(e => e.overrideReason);

    const columns = [{ width: 2 }, { width: 2 }, { width: 1 }];
    if (showTime)    columns.push({ width: 1 });
    if (showHours)   columns.push({ width: 1 });
    if (showLateMin) columns.push({ width: 1 });
    if (anyReason)   columns.push({ width: 2 });

    const makeHeaderCell = (text) => ({
        type: 'TableCell', style: 'accent',
        items: [{ type: 'TextBlock', text, weight: 'Bolder', color: 'Light', wrap: true }],
    });

    const headerCells = [makeHeaderCell('Employee'), makeHeaderCell('Designation'), makeHeaderCell('Status')];
    if (showTime)    headerCells.push(makeHeaderCell('Clock In'));
    if (showHours)   headerCells.push(makeHeaderCell('Hours'));
    if (showLateMin) headerCells.push(makeHeaderCell('Late By'));
    if (anyReason)   headerCells.push(makeHeaderCell('Note / Reason'));

    const headerRow = { type: 'TableRow', style: 'accent', cells: headerCells };

    const makeReasonCell = (reason) => ({
        type: 'TableCell',
        items: [{ type: 'TextBlock', text: reason || '—', wrap: true, color: reason ? 'Warning' : 'Default', isSubtle: !reason }],
    });

    const makeRow = (emp, statusText, statusColor, extraCells = []) => ({
        type: 'TableRow',
        cells: [
            { type: 'TableCell', items: [{ type: 'TextBlock', text: emp.name, wrap: true, weight: 'Bolder' }] },
            { type: 'TableCell', items: [{ type: 'TextBlock', text: emp.designation || '—', wrap: true }] },
            { type: 'TableCell', items: [{ type: 'TextBlock', text: statusText, wrap: true, color: statusColor }] },
            ...extraCells,
        ],
    });

    const allRows = [];

    if (config.showPresent && sections.present.length > 0) {
        sections.present.forEach(emp => {
            const extra = [];
            if (showTime)    extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: formatISTTime(emp.clockInTime), wrap: true, color: 'Good' }] });
            if (showHours)   extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: emp.totalWorkingHours ? `${emp.totalWorkingHours.toFixed(1)}h` : '—', wrap: true }] });
            if (showLateMin) extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: '—', wrap: true }] });
            if (anyReason)   extra.push(makeReasonCell(emp.overrideReason));
            allRows.push(makeRow(emp, '✅ Present', 'Good', extra));
        });
    }

    if (config.showLateEmployees && sections.late.length > 0) {
        sections.late.forEach(emp => {
            const extra = [];
            if (showTime)    extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: formatISTTime(emp.clockInTime), wrap: true, color: 'Warning' }] });
            if (showHours)   extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: emp.totalWorkingHours ? `${emp.totalWorkingHours.toFixed(1)}h` : '—', wrap: true }] });
            if (showLateMin) extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: emp.lateMinutes ? `${emp.lateMinutes} min` : '—', wrap: true, color: 'Warning' }] });
            if (anyReason)   extra.push(makeReasonCell(emp.overrideReason));
            allRows.push(makeRow(emp, '🕐 Late', 'Warning', extra));
        });
    }

    if (config.showOnLeave && sections.onLeave.length > 0) {
        sections.onLeave.forEach(emp => {
            const extra = [];
            if (showTime)    extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: '—', wrap: true }] });
            if (showHours)   extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: '—', wrap: true }] });
            if (showLateMin) extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: '—', wrap: true }] });
            if (anyReason)   extra.push(makeReasonCell(emp.overrideReason));
            allRows.push(makeRow(emp, emp.leaveType, 'Warning', extra));
        });
    }

    if (config.showAbsent && sections.absent.length > 0) {
        sections.absent.forEach(emp => {
            const extra = [];
            if (showTime)    extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: '—', wrap: true }] });
            if (showHours)   extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: '—', wrap: true }] });
            if (showLateMin) extra.push({ type: 'TableCell', items: [{ type: 'TextBlock', text: '—', wrap: true }] });
            if (anyReason)   extra.push(makeReasonCell(emp.overrideReason));
            allRows.push(makeRow(emp, '🔴 Absent', 'Attention', extra));
        });
    }

    const summaryParts = [];
    if (config.showPresent && sections.present.length > 0)       summaryParts.push(`✅ Present: **${sections.present.length}**`);
    if (config.showLateEmployees && sections.late.length > 0)    summaryParts.push(`🕐 Late: **${sections.late.length}**`);
    if (config.showOnLeave && sections.onLeave.length > 0)       summaryParts.push(`🟡 On Leave: **${sections.onLeave.length}**`);
    if (config.showAbsent && sections.absent.length > 0)         summaryParts.push(`🔴 Absent: **${sections.absent.length}**`);

    const notPresentCount = sections.onLeave.length + sections.absent.length;
    const reportTimeLabel = reportLabel || config.reportTime;

    const bodyBlocks = [
        {
            type: 'ColumnSet', style: 'emphasis', bleed: true,
            columns: [
                { type: 'Column', width: 'auto', items: [{ type: 'TextBlock', text: '📋', size: 'ExtraLarge' }], verticalContentAlignment: 'Center' },
                {
                    type: 'Column', width: 'stretch',
                    items: [
                        { type: 'TextBlock', text: `Daily Attendance Report${reportLabel ? ` — ${reportLabel}` : ''}`, weight: 'Bolder', size: 'Large', color: 'Accent' },
                        { type: 'TextBlock', text: formattedDate, isSubtle: true, spacing: 'None', wrap: true },
                    ],
                    verticalContentAlignment: 'Center',
                },
            ],
        },
        {
            type: 'TextBlock', spacing: 'Medium',
            text: notPresentCount === 0 && !config.showPresent && !config.showLateEmployees
                ? '✅ All employees accounted for!'
                : notPresentCount > 0
                    ? `⚠️ **${notPresentCount} employee${notPresentCount > 1 ? 's' : ''}** not present as of **${reportTimeLabel} IST**`
                    : `📊 Attendance summary as of **${reportTimeLabel} IST**`,
            wrap: true, size: 'Medium',
        },
    ];

    if (allRows.length > 0) {
        bodyBlocks.push({ type: 'Table', gridStyle: 'accent', firstRowAsHeader: true, columns, rows: [headerRow, ...allRows] });
    }

    if (summaryParts.length > 0) {
        bodyBlocks.push({ type: 'TextBlock', spacing: 'Small', separator: true, text: summaryParts.join('  ·  '), isSubtle: true, size: 'Small', wrap: true });
    }

    return {
        type: 'message',
        attachments: [{
            contentType: 'application/vnd.microsoft.card.adaptive',
            contentUrl: null,
            content: { '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: bodyBlocks },
        }],
    };
};

// ─── Preview data builder ─────────────────────────────────────────────────────

const getPreviewData = async (scope = 'all') => {
    const config   = await getReportConfig();
    const todayStr = getISTDateString(getISTNow());
    const { sections, totalEmployees } = await buildSections(todayStr, scope, config);
    const overrides = await getStatusOverrides(todayStr);
    return { sections, config, todayStr, totalEmployees, scope, overrides };
};

// ─── Send edited report ───────────────────────────────────────────────────────

const sendEditedReport = async (sections, config, todayStr, reportLabel = '') => {
    const webhookUrl = await getWebhookUrl();
    if (!webhookUrl) throw new Error('No webhook URL configured.');
    const payload = buildPayload(sections, config, todayStr || getISTDateString(getISTNow()), reportLabel);
    const response = await axios.post(webhookUrl, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
    if (response.status !== 200 && response.status !== 202) throw new Error(`Webhook returned ${response.status}`);
    console.log('[TeamsNotification] ✅ Edited report sent successfully.');
};

// ─── Automatic reports ────────────────────────────────────────────────────────

const sendMorningAttendanceReport = async () => {
    if (mongoose.connection.readyState !== 1) { return; }
    if (!isTodayWorkingDay())                  { return; }

    const todayStr = getISTDateString(getISTNow());
    const lastSent = await Setting.findOne({ key: MORNING_SENT_KEY });
    if (lastSent?.value === todayStr) { return; }

    const webhookUrl = await getWebhookUrl();
    if (!webhookUrl) { return; }

    const config = await getReportConfig();
    try {
        const { sections } = await buildSections(todayStr, 'morning', config);
        const payload = buildPayload(sections, config, todayStr, `Morning Report – ${config.reportTime} IST`);
        const response = await axios.post(webhookUrl, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
        if (response.status !== 200 && response.status !== 202) throw new Error(`Webhook returned ${response.status}`);
        await Setting.findOneAndUpdate({ key: MORNING_SENT_KEY }, { value: todayStr }, { upsert: true });
        console.log('[TeamsNotification] ✅ Morning report sent.');
    } catch (err) {
        console.error('[TeamsNotification] ❌ Morning report failed:', err.response?.data || err.message);
    }
};

const sendAfternoonAttendanceReport = async () => {
    if (mongoose.connection.readyState !== 1) { return; }
    if (!isTodayWorkingDay())                  { return; }

    const todayStr = getISTDateString(getISTNow());
    const lastSent = await Setting.findOne({ key: AFTERNOON_SENT_KEY });
    if (lastSent?.value === todayStr) { return; }

    const webhookUrl = await getWebhookUrl();
    if (!webhookUrl) { return; }

    const config = await getReportConfig();
    if (!config.afternoonReportEnabled) { return; }

    try {
        // Scope 'afternoon' = all employees; shift-1/2 latecomers appear as Late
        const { sections } = await buildSections(todayStr, 'afternoon', config);
        const payload = buildPayload(sections, config, todayStr, `Afternoon Report – ${config.afternoonReportTime} IST`);
        const response = await axios.post(webhookUrl, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 15000 });
        if (response.status !== 200 && response.status !== 202) throw new Error(`Webhook returned ${response.status}`);
        await Setting.findOneAndUpdate({ key: AFTERNOON_SENT_KEY }, { value: todayStr }, { upsert: true });
        console.log('[TeamsNotification] ✅ Afternoon report sent.');
    } catch (err) {
        console.error('[TeamsNotification] ❌ Afternoon report failed:', err.response?.data || err.message);
    }
};

module.exports = {
    sendMorningAttendanceReport,
    sendAfternoonAttendanceReport,
    sendEditedReport,
    getPreviewData,
    buildPayload,
    buildSections,
    getReportConfig,
    getStatusOverrides,
    saveStatusOverride,
    deleteStatusOverride,
    TEAMS_WEBHOOK_KEY,
    REPORT_CONFIG_KEY,
    STATUS_OVERRIDES_KEY,
    DEFAULT_CONFIG,
    MORNING_SENT_KEY,
    AFTERNOON_SENT_KEY,
};
