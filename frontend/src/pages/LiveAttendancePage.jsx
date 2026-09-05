import React, { useCallback, useEffect, useRef, useState, memo } from 'react';
import {
    Alert,
    Avatar,
    Box,
    CircularProgress,
    IconButton,
    Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import GroupsIcon from '@mui/icons-material/Groups';
import WorkOutlineIcon from '@mui/icons-material/WorkOutline';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import FreeBreakfastOutlinedIcon from '@mui/icons-material/FreeBreakfastOutlined';
import api from '../api/axios';
import socket from '../socket';
import { formatISTTime, formatISTDate, parseISTDate } from '../utils/istTime';
import '../styles/LiveAttendancePage.css';

const REFRESH_INTERVAL_MS = 60000;
const SOCKET_THROTTLE_MS = 500;

const LEAVE_RANGE_OPTIONS = [
    { value: 'today', label: 'Today' },
    { value: 'upcoming', label: 'Upcoming' },
];

const BADGE_MAP = {
    Present: 'present',
    Late: 'late',
    Absent: 'absent',
    'On Leave': 'leave',
    'Upcoming Leave': 'upcoming',
    'On Break': 'break',
};

const KpiCard = memo(({ variant, label, value, icon }) => (
    <div className={`la-kpi-card la-kpi-card--${variant}`}>
        <div>
            <div className="la-kpi-label">{label}</div>
            <div className="la-kpi-value">{value}</div>
        </div>
        <div className="la-kpi-icon">{icon}</div>
    </div>
));

const StatusBadge = ({ status }) => {
    const key = BADGE_MAP[status] || 'present';
    return <span className={`la-badge la-badge--${key}`}>{status}</span>;
};

const EmployeeRow = ({ employee, avatarColor, badge, detail, timeLabel, timeValue }) => {
    const name = employee?.fullName || '—';
    const subtitle = [employee?.designation, employee?.employeeCode].filter(Boolean).join(' · ');

    return (
        <div className="la-row">
            <Avatar
                className="la-row__avatar"
                src={employee?.profileImageUrl || undefined}
                sx={{ bgcolor: avatarColor || '#1f2937' }}
            >
                {name.charAt(0) || '?'}
            </Avatar>
            <div className="la-row__main">
                <div className="la-row__name">{name}</div>
                <div className="la-row__meta">{subtitle || employee?.department || '—'}</div>
            </div>
            <div className="la-row__aside">
                {badge}
                {detail && <div className="la-row__detail">{detail}</div>}
                {timeLabel && (
                    <div>
                        <div className="la-row__time-label">{timeLabel}</div>
                        <div className="la-row__time">{timeValue || '—'}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

const Panel = ({ variant, title, count, children, filters }) => (
    <section className={`la-panel la-panel--${variant}`}>
        <div className="la-panel__head">
            <h2 className="la-panel__title">{title}</h2>
            <span className="la-panel__count">{count}</span>
        </div>
        {filters}
        <div className="la-panel__body">{children}</div>
    </section>
);

const formatClockTime = (value) => {
    if (!value) return '—';
    return formatISTTime(value, { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatLeaveDateLabel = (dateKey) => {
    if (!dateKey) return '—';
    return formatISTDate(parseISTDate(dateKey), { day: '2-digit', month: 'short' });
};

const formatLeaveRangeLabel = (employee) => {
    if (!employee?.leaveStart || !employee?.leaveEnd) return '—';
    if (employee.leaveStart === employee.leaveEnd) return formatLeaveDateLabel(employee.leaveStart);
    return `${formatLeaveDateLabel(employee.leaveStart)} – ${formatLeaveDateLabel(employee.leaveEnd)}`;
};

const formatLeaveDayTypeLabel = (dayType) => {
    if (!dayType || dayType === 'Full Day') return 'Full Day';
    if (dayType === 'Half Day - First Half') return 'Half Day · 1st Half';
    if (dayType === 'Half Day - Second Half') return 'Half Day · 2nd Half';
    if (String(dayType).startsWith('Half Day')) return 'Half Day';
    return dayType;
};

const LiveAttendancePage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [leaveRange, setLeaveRange] = useState('today');
    const fetchInFlightRef = useRef(false);

    const fetchOverview = useCallback(async (isInitial = false, range = leaveRange) => {
        if (fetchInFlightRef.current) return;
        fetchInFlightRef.current = true;

        if (isInitial) setLoading(true);
        else setRefreshing(true);
        setError('');

        try {
            const response = await api.get('/attendance/live-overview', {
                params: { leaveRange: range },
            });
            setData(response.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to load live attendance data.');
        } finally {
            fetchInFlightRef.current = false;
            setLoading(false);
            setRefreshing(false);
        }
    }, [leaveRange]);

    useEffect(() => {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.classList.add('live-attendance-layout');
            mainContent.scrollTop = 0;
        }
        return () => {
            mainContent?.classList.remove('live-attendance-layout');
        };
    }, []);

    useEffect(() => {
        fetchOverview(true, leaveRange);
    }, [leaveRange, fetchOverview]);

    useEffect(() => {
        const intervalId = setInterval(() => fetchOverview(false, leaveRange), REFRESH_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [fetchOverview, leaveRange]);

    useEffect(() => {
        let scheduledTimer = null;
        let lastRun = 0;

        const scheduleRefresh = () => {
            const delay = Math.max(0, SOCKET_THROTTLE_MS - (Date.now() - lastRun));
            if (scheduledTimer) clearTimeout(scheduledTimer);
            scheduledTimer = setTimeout(async () => {
                lastRun = Date.now();
                await fetchOverview(false, leaveRange);
            }, delay);
        };

        socket.on('attendance_log_updated', scheduleRefresh);
        socket.on('leave_request_updated', scheduleRefresh);
        socket.on('leave_status_updated', scheduleRefresh);
        socket.on('live_attendance_refreshed', scheduleRefresh);

        return () => {
            if (scheduledTimer) clearTimeout(scheduledTimer);
            socket.off('attendance_log_updated', scheduleRefresh);
            socket.off('leave_request_updated', scheduleRefresh);
            socket.off('leave_status_updated', scheduleRefresh);
            socket.off('live_attendance_refreshed', scheduleRefresh);
        };
    }, [fetchOverview, leaveRange]);

    const leaveEmptyText = {
        today: 'No one on leave today',
        upcoming: 'No upcoming leaves',
    };

    const counts = data?.counts || {};
    const todayLabel = data?.date ? formatISTDate(data.date) : formatISTDate(new Date());
    const lastUpdated = data?.lastUpdated
        ? formatISTTime(data.lastUpdated, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
        : '—';

    if (loading && !data) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <CircularProgress sx={{ color: '#d32f2f' }} />
            </Box>
        );
    }

    const presentList = data?.present || [];
    const breakList = data?.onBreak || [];
    const leaveList = data?.onLeave || [];
    const absentList = data?.absent || [];

    return (
        <div className="live-attendance-dashboard">
            <header className="la-header">
                <div className="la-header__left">
                    <div className="la-header__icon">
                        <GroupsIcon fontSize="small" />
                    </div>
                    <div>
                        <p className="la-header__eyebrow">Real-time view</p>
                        <h1 className="la-header__title">Live Attendance</h1>
                        <p className="la-header__desc">Who is present, absent, on leave, or on break</p>
                    </div>
                </div>
                <div className="la-header__right">
                    <span className="la-live-pill">
                        <span className="la-live-dot" />
                        Live · {todayLabel}
                    </span>
                    <span className="la-updated">Updated {lastUpdated}</span>
                    <Tooltip title="Refresh">
                        <span>
                            <IconButton
                                className="la-refresh-btn"
                                size="small"
                                onClick={() => fetchOverview(false, leaveRange)}
                                disabled={refreshing}
                            >
                                {refreshing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon fontSize="small" />}
                            </IconButton>
                        </span>
                    </Tooltip>
                </div>
            </header>

            {error && <Alert severity="error">{error}</Alert>}

            <div className="la-kpi-grid">
                <KpiCard variant="present" label="Present" value={counts.present ?? 0} icon={<WorkOutlineIcon fontSize="small" />} />
                <KpiCard variant="absent" label="Absent" value={counts.absent ?? 0} icon={<PersonOffOutlinedIcon fontSize="small" />} />
                <KpiCard variant="leave" label="On Leave" value={counts.onLeave ?? 0} icon={<EventBusyOutlinedIcon fontSize="small" />} />
                <KpiCard variant="break" label="On Break" value={counts.onBreak ?? 0} icon={<FreeBreakfastOutlinedIcon fontSize="small" />} />
            </div>

            <div className="la-panels-grid">
                <Panel variant="present" title="Present" count={presentList.length}>
                    {presentList.length === 0 ? (
                        <div className="la-empty">Everyone is away or not clocked in</div>
                    ) : (
                        presentList.map((employee) => (
                            <EmployeeRow
                                key={employee._id}
                                employee={employee}
                                avatarColor="#0d9488"
                                badge={<StatusBadge status={employee.status || 'Present'} />}
                                timeLabel="Clock in"
                                timeValue={formatClockTime(employee.clockInTime)}
                            />
                        ))
                    )}
                </Panel>

                <Panel variant="break" title="On Break" count={breakList.length}>
                    {breakList.length === 0 ? (
                        <div className="la-empty">No active breaks right now</div>
                    ) : (
                        breakList.map((employee) => (
                            <EmployeeRow
                                key={employee._id}
                                employee={employee}
                                avatarColor="#7c3aed"
                                badge={<StatusBadge status="On Break" />}
                                timeLabel={employee.breakType || 'Started'}
                                timeValue={formatClockTime(employee.breakStartTime)}
                            />
                        ))
                    )}
                </Panel>

                <Panel
                    variant="leave"
                    title="On Leave"
                    count={leaveList.length}
                    filters={(
                        <div className="la-filters">
                            {LEAVE_RANGE_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    className={`la-filter-chip${leaveRange === option.value ? ' active' : ''}`}
                                    onClick={() => setLeaveRange(option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                >
                    {leaveList.length === 0 ? (
                        <div className="la-empty">{leaveEmptyText[leaveRange] || leaveEmptyText.today}</div>
                    ) : (
                        leaveList.map((employee) => (
                            <EmployeeRow
                                key={`${employee._id}-${employee.leaveRequestId || employee.leaveStart || ''}`}
                                employee={employee}
                                avatarColor="#d97706"
                                badge={<StatusBadge status={employee.status || 'On Leave'} />}
                                detail={[
                                    employee.leaveType || 'Leave',
                                    formatLeaveDayTypeLabel(employee.leaveDayType),
                                    employee.isOnLeaveToday
                                        ? `Until ${formatLeaveDateLabel(employee.leaveEnd)}`
                                        : formatLeaveRangeLabel(employee),
                                ].join(' · ')}
                            />
                        ))
                    )}
                </Panel>

                <Panel variant="absent" title="Absent" count={absentList.length}>
                    {absentList.length === 0 ? (
                        <div className="la-empty">No absent employees today</div>
                    ) : (
                        absentList.map((employee) => (
                            <EmployeeRow
                                key={employee._id}
                                employee={employee}
                                avatarColor="#dc2626"
                                badge={<StatusBadge status="Absent" />}
                            />
                        ))
                    )}
                </Panel>
            </div>
        </div>
    );
};

export default LiveAttendancePage;
