const User = require('../models/User');
const AttendanceLog = require('../models/AttendanceLog');
const LeaveRequest = require('../models/LeaveRequest');
const Holiday = require('../models/Holiday');
const Setting = require('../models/Setting');
const LeavePolicyService = require('./LeavePolicyService');
const { getISTDateString, parseISTDate, startOfISTDay } = require('../utils/istTime');

const TEAMS_STATUS_OVERRIDES_KEY = 'teamsStatusOverrides';

/** Active employees absent today (no clock-in, not on leave, working day per policy). */
async function fetchAbsentTodayEmployees(today) {
    const holidays = await Holiday.find({ isTentative: { $ne: true } }).select('date').lean();
    const isCompanyHoliday = (holidays || []).some((h) => getISTDateString(h.date) === today);
    if (isCompanyHoliday) return [];

    const todayDate = parseISTDate(today);
    const [year, month, day] = today.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dayOfWeek === 0) return [];

    const todayStart = startOfISTDay(todayDate);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const isSaturday = dayOfWeek === 6;

    const employees = await User.find({ isActive: true, role: { $ne: 'Admin' } })
        .select('fullName employeeCode designation department profileImageUrl alternateSaturdayPolicy')
        .lean();

    let filtered = employees;
    if (isSaturday) {
        filtered = employees.filter((emp) => {
            const policy = emp.alternateSaturdayPolicy || 'All Saturdays Working';
            return !LeavePolicyService.isSaturdayOff(todayDate, policy);
        });
    }

    const employeeIds = filtered.map((e) => e._id);
    if (employeeIds.length === 0) return [];

    const todayLogs = await AttendanceLog.find({
        user: { $in: employeeIds },
        attendanceDate: today,
        clockInTime: { $exists: true, $ne: null },
    })
        .select('user')
        .lean();

    const clockedInSet = new Set((todayLogs || []).map((l) => l.user.toString()));

    const approvedLeaves = await LeaveRequest.find({
        employee: { $in: employeeIds },
        status: 'Approved',
        leaveDates: { $elemMatch: { $gte: todayStart, $lt: todayEnd } },
    })
        .select('employee')
        .lean();

    const onLeaveSet = new Set((approvedLeaves || []).map((l) => l.employee.toString()));

    const overrideSetting = await Setting.findOne({ key: TEAMS_STATUS_OVERRIDES_KEY }).lean();
    const overrideMap = new Map();
    for (const o of Array.isArray(overrideSetting?.value) ? overrideSetting.value : []) {
        if (o.date === today && o.employeeId) {
            overrideMap.set(o.employeeId.toString(), { status: o.status });
        }
    }

    const absent = [];
    for (const emp of filtered) {
        const id = emp._id.toString();
        const override = overrideMap.get(id);

        if (override) {
            if (override.status === 'absent') {
                absent.push({
                    _id: emp._id,
                    fullName: emp.fullName,
                    employeeCode: emp.employeeCode,
                    designation: emp.designation,
                    department: emp.department,
                    profileImageUrl: emp.profileImageUrl,
                    status: 'Absent',
                });
            }
            continue;
        }

        if (onLeaveSet.has(id) || clockedInSet.has(id)) continue;

        absent.push({
            _id: emp._id,
            fullName: emp.fullName,
            employeeCode: emp.employeeCode,
            designation: emp.designation,
            department: emp.department,
            profileImageUrl: emp.profileImageUrl,
            status: 'Absent',
        });
    }

    absent.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    return absent;
}

module.exports = {
    fetchAbsentTodayEmployees,
};
