const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const BreakLog = require('../models/BreakLog');
const LeaveRequest = require('../models/LeaveRequest');
const { getTodayISTKey, getISTDateString, parseISTDate, startOfISTDay } = require('../utils/istTime');
const { fetchAbsentTodayEmployees } = require('./dashboardEmployeeLists');

const VALID_LEAVE_RANGES = new Set(['today', 'upcoming']);

function mapEmployeeBase(user, extra = {}) {
    return {
        _id: user._id,
        fullName: user.fullName,
        employeeCode: user.employeeCode,
        designation: user.designation,
        department: user.department,
        profileImageUrl: user.profileImageUrl,
        ...extra,
    };
}

function addDaysIST(dateKey, days) {
    const base = startOfISTDay(dateKey);
    return getISTDateString(new Date(base.getTime() + days * 24 * 60 * 60 * 1000));
}

function getISTWeekdayIndex(dateKey) {
    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
    }).format(parseISTDate(dateKey));
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[weekday] ?? 0;
}

function getWeekBoundsIST(todayKey) {
    const weekday = getISTWeekdayIndex(todayKey);
    const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
    const weekStart = addDaysIST(todayKey, -daysFromMonday);
    const weekEnd = addDaysIST(weekStart, 6);
    return { weekStart, weekEnd };
}

function getLeaveDateKeys(leave) {
    return (leave.leaveDates || [])
        .map((date) => getISTDateString(date))
        .filter(Boolean)
        .sort();
}

function getLeaveBoundsFromDates(dateKeys) {
    if (!dateKeys.length) return null;
    return { start: dateKeys[0], end: dateKeys[dateKeys.length - 1] };
}

function rangesOverlap(startA, endA, startB, endB) {
    return startA <= endB && endA >= startB;
}

function buildLeaveRow(leave) {
    const dateKeys = getLeaveDateKeys(leave);
    const bounds = getLeaveBoundsFromDates(dateKeys);
    if (!bounds) return null;

    const today = getTodayISTKey();
    const includesToday = dateKeys.includes(today);

    return mapEmployeeBase(leave.employee, {
        status: includesToday ? 'On Leave' : 'Upcoming Leave',
        leaveType: leave.requestType,
        leaveDayType: leave.leaveType,
        leaveStart: bounds.start,
        leaveEnd: bounds.end,
        leaveDates: dateKeys,
        isOnLeaveToday: includesToday,
        leaveRequestId: leave._id,
    });
}

function mergeLeaveRowsByEmployee(rows) {
    const merged = new Map();

    for (const row of rows) {
        const key = row._id.toString();
        const existing = merged.get(key);

        if (!existing) {
            merged.set(key, { ...row });
            continue;
        }

        const leaveStart = row.leaveStart < existing.leaveStart ? row.leaveStart : existing.leaveStart;
        const leaveEnd = row.leaveEnd > existing.leaveEnd ? row.leaveEnd : existing.leaveEnd;
        const leaveDates = [...new Set([...(existing.leaveDates || []), ...(row.leaveDates || [])])].sort();

        merged.set(key, {
            ...existing,
            leaveStart,
            leaveEnd,
            leaveDates,
            isOnLeaveToday: existing.isOnLeaveToday || row.isOnLeaveToday,
            status: (existing.isOnLeaveToday || row.isOnLeaveToday) ? 'On Leave' : 'Upcoming Leave',
            leaveType: row.isOnLeaveToday ? row.leaveType : existing.leaveType,
            leaveDayType: row.isOnLeaveToday ? row.leaveDayType : existing.leaveDayType,
        });
    }

    return Array.from(merged.values());
}

function filterLeaveRows(rows, leaveRange, todayKey) {
    return rows.filter((row) => {
        const { leaveStart, leaveEnd } = row;

        if (leaveRange === 'today') {
            return row.isOnLeaveToday;
        }

        if (leaveRange === 'upcoming') {
            // All future leaves: any leave that ends on or after tomorrow
            const tomorrow = addDaysIST(todayKey, 1);
            return leaveEnd >= tomorrow;
        }

        return row.isOnLeaveToday;
    });
}

async function fetchApprovedLeavesForCatalog(todayKey) {
    const queryStart = startOfISTDay(todayKey);
    // Fetch up to 1 year ahead to cover all upcoming leaves
    const catalogEnd = addDaysIST(todayKey, 365);
    const queryEnd = startOfISTDay(addDaysIST(catalogEnd, 1));

    return LeaveRequest.find({
        status: 'Approved',
        leaveDates: {
            $elemMatch: {
                $gte: queryStart,
                $lt: queryEnd,
            },
        },
    })
        .populate({
            path: 'employee',
            match: { role: { $ne: 'Admin' }, isActive: true },
            select: 'fullName employeeCode designation department profileImageUrl',
        })
        .select('employee requestType leaveType leaveDates')
        .lean();
}

async function getLiveAttendanceOverview(options = {}) {
    const leaveRange = VALID_LEAVE_RANGES.has(options.leaveRange)
        ? options.leaveRange
        : 'today';
    const today = getTodayISTKey();

    const [presentLogs, approvedLeavesCatalog, absentList] = await Promise.all([
        AttendanceLog.find({
            attendanceDate: today,
            clockInTime: { $exists: true, $ne: null },
        })
            .populate({
                path: 'user',
                match: { role: { $ne: 'Admin' }, isActive: true },
                select: 'fullName employeeCode designation department profileImageUrl',
            })
            .select('user clockInTime isLate')
            .lean(),
        fetchApprovedLeavesForCatalog(today),
        fetchAbsentTodayEmployees(today),
    ]);

    const leaveCatalogRows = mergeLeaveRowsByEmployee(
        (approvedLeavesCatalog || [])
            .map(buildLeaveRow)
            .filter(Boolean)
    );

    const onLeaveTodayRows = leaveCatalogRows.filter((row) => row.isOnLeaveToday);
    const onLeave = filterLeaveRows(leaveCatalogRows, leaveRange, today)
        .sort((a, b) => {
            if (a.leaveStart !== b.leaveStart) return a.leaveStart.localeCompare(b.leaveStart);
            return (a.fullName || '').localeCompare(b.fullName || '');
        });

    const onLeaveIds = new Set(onLeaveTodayRows.map((emp) => emp._id.toString()));

    const clockedInLogs = (presentLogs || []).filter((log) => log.user && log.user._id);
    const logIds = clockedInLogs.map((log) => log._id);
    const logIdToUserId = new Map(clockedInLogs.map((log) => [log._id.toString(), log.user._id.toString()]));

    const activeBreaks = logIds.length > 0
        ? await BreakLog.find({
            attendanceLog: { $in: logIds },
            endTime: null,
        })
            .select('attendanceLog breakType startTime')
            .lean()
        : [];

    const userIdOnBreak = new Map();
    for (const brk of activeBreaks) {
        const userId = logIdToUserId.get(brk.attendanceLog.toString());
        if (userId) {
            userIdOnBreak.set(userId, brk);
        }
    }

    const present = [];
    const onBreak = [];

    for (const log of clockedInLogs) {
        const userId = log.user._id.toString();
        if (onLeaveIds.has(userId)) continue;

        const activeBreak = userIdOnBreak.get(userId);
        const employee = mapEmployeeBase(log.user, {
            clockInTime: log.clockInTime,
            isLate: !!log.isLate,
        });

        if (activeBreak) {
            onBreak.push({
                ...employee,
                status: 'On Break',
                breakType: activeBreak.breakType,
                breakStartTime: activeBreak.startTime,
            });
        } else {
            present.push({
                ...employee,
                status: log.isLate ? 'Late' : 'Present',
            });
        }
    }

    present.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    onBreak.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

    return {
        date: today,
        leaveRange,
        lastUpdated: new Date().toISOString(),
        counts: {
            present: present.length,
            absent: absentList.length,
            onLeave: onLeaveTodayRows.length,
            onLeaveFiltered: onLeave.length,
            onBreak: onBreak.length,
            total: await User.countDocuments({ role: { $ne: 'Admin' }, isActive: true }),
        },
        present,
        absent: absentList,
        onLeave,
        onBreak,
    };
}

module.exports = {
    getLiveAttendanceOverview,
    VALID_LEAVE_RANGES,
};
