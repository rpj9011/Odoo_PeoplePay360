// frontend/src/components/payroll/PayrollDashboard.jsx
// Real payroll dashboard — all data from backend aggregation endpoints.
// Styled to match app design system (no Math.sin/Math.random/useMemo fabrication).

import React, { useState, useEffect, useCallback } from 'react';
import {
    Alert, Box, Card, CardContent, Chip, CircularProgress,
    Divider, FormControl, Grid, IconButton, InputLabel,
    MenuItem, Paper, Select, Tooltip, Typography,
} from '@mui/material';
import {
    AccountBalance, CalendarToday, CheckCircle, EventBusy,
    PendingActions, People, Refresh, TrendingDown, TrendingUp, Warning,
} from '@mui/icons-material';
import {
    BarChart, Bar, Cell, LineChart, Line, PieChart, Pie,
    XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
    Legend, ResponsiveContainer,
} from 'recharts';
import axios from '../../api/axios';
import { formatINR, formatINRShort } from '../../utils/currencyFormatter';

// ── Design tokens ─────────────────────────────────────────────────────────────
const RED     = '#E53935';
const TEXT    = '#1A1A1A';
const MUTED   = '#6B7280';
const BORDER  = '#E5E7EB';

// Chart palette — matches the app's accent colors
const CHART_COLORS = ['#1D4ED8', RED, '#166534', '#C2410C', '#6D28D9', '#0E7490'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildPeriod(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// ── StatCard ──────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, subtitle, icon, accentColor = RED, loading }) => (
    <Paper elevation={0} sx={{
        borderRadius: '12px', border: `1px solid ${BORDER}`,
        p: 2.5, height: '100%', position: 'relative', overflow: 'hidden',
        '&::before': {
            content: '""', position: 'absolute', top: 0, left: 0,
            width: '100%', height: '3px',
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}66)`,
        },
    }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Typography variant="caption" color={MUTED}
                sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.7rem', fontWeight: 600 }}>
                {title}
            </Typography>
            <Box sx={{
                width: 34, height: 34, borderRadius: '8px',
                bgcolor: `${accentColor}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {React.cloneElement(icon, { sx: { fontSize: 18, color: accentColor } })}
            </Box>
        </Box>
        {loading ? (
            <CircularProgress size={20} sx={{ mt: 1.5, color: accentColor }} />
        ) : (
            <>
                <Typography variant="h5" fontWeight={700} color={TEXT} sx={{ mt: 1, lineHeight: 1.2 }}>
                    {value ?? '—'}
                </Typography>
                {subtitle && (
                    <Typography variant="caption" color={MUTED} sx={{ mt: 0.5, display: 'block' }}>
                        {subtitle}
                    </Typography>
                )}
            </>
        )}
    </Paper>
);

// ── ChartCard ─────────────────────────────────────────────────────────────────
const ChartCard = ({ title, loading, empty, children, height = 300 }) => (
    <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, p: 2.5, height: '100%' }}>
        <Typography variant="body2" fontWeight={700} color={TEXT} sx={{ mb: 2 }}>{title}</Typography>
        <Divider sx={{ mb: 2 }} />
        {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}>
                <CircularProgress size={28} sx={{ color: RED }} />
            </Box>
        ) : empty ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height, color: MUTED }}>
                <Typography variant="body2">No data for this period</Typography>
            </Box>
        ) : children}
    </Paper>
);

// ── Main component ────────────────────────────────────────────────────────────
const PayrollDashboard = () => {
    const now = new Date();
    const [selectedYear,  setSelectedYear]  = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

    const period = buildPeriod(selectedYear, selectedMonth);

    const [kpis,        setKpis]        = useState(null);
    const [kpisLoading, setKpisLoading] = useState(true);
    const [byDept,      setByDept]      = useState([]);
    const [deptLoading, setDeptLoading] = useState(true);
    const [trend,       setTrend]       = useState([]);
    const [trendLoading,setTrendLoading]= useState(true);
    const [alerts,      setAlerts]      = useState([]);
    const [alertsLoading,setAlertsLoading]= useState(true);
    const [attendance,  setAttendance]  = useState(null);
    const [attLoading,  setAttLoading]  = useState(true);
    const [timeoff,     setTimeoff]     = useState(null);
    const [toLoading,   setToLoading]   = useState(true);
    const [fetchError,  setFetchError]  = useState('');

    const fetchAll = useCallback(() => {
        setFetchError('');
        const p = { period };

        setKpisLoading(true);
        axios.get('/payroll/dashboard/kpis', { params: p })
            .then(r => setKpis(r.data?.data))
            .catch(() => setFetchError('Failed to load KPIs.'))
            .finally(() => setKpisLoading(false));

        setDeptLoading(true);
        axios.get('/payroll/dashboard/salary-by-department', { params: p })
            .then(r => setByDept(r.data?.data || []))
            .finally(() => setDeptLoading(false));

        setTrendLoading(true);
        axios.get('/payroll/dashboard/monthly-trend', { params: { months: 6 } })
            .then(r => setTrend(r.data?.data || []))
            .finally(() => setTrendLoading(false));

        setAlertsLoading(true);
        axios.get('/payroll/dashboard/alerts')
            .then(r => setAlerts(r.data?.data || []))
            .finally(() => setAlertsLoading(false));

        setAttLoading(true);
        axios.get('/payroll/dashboard/attendance-overview', { params: p })
            .then(r => setAttendance(r.data?.data))
            .finally(() => setAttLoading(false));

        setToLoading(true);
        axios.get('/payroll/dashboard/timeoff-overview', { params: p })
            .then(r => setTimeoff(r.data?.data))
            .finally(() => setToLoading(false));
    }, [period]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Period selector ───────────────────────────────────────────────────────
    const filterSx = {
        minWidth: 110, '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#fff' },
        '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED },
    };
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    return (
        <Box>
            {/* ── Period toolbar ── */}
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
                <FormControl size="small" sx={filterSx}>
                    <InputLabel>Month</InputLabel>
                    <Select label="Month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                        {MONTHS.map((m, i) => <MenuItem key={i} value={i}>{m}</MenuItem>)}
                    </Select>
                </FormControl>

                <FormControl size="small" sx={{ ...filterSx, minWidth: 90 }}>
                    <InputLabel>Year</InputLabel>
                    <Select label="Year" value={selectedYear} onChange={e => setSelectedYear(e.target.value)}>
                        {Array.from({ length: 5 }, (_, i) => now.getFullYear() - i).map(y => (
                            <MenuItem key={y} value={y}>{y}</MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Tooltip title="Refresh">
                    <IconButton onClick={fetchAll} size="small" sx={{ color: MUTED }}>
                        <Refresh fontSize="small" />
                    </IconButton>
                </Tooltip>

                <Typography variant="caption" color={MUTED} sx={{ ml: 'auto' }}>
                    Showing data for {MONTHS[selectedMonth]} {selectedYear}
                </Typography>
            </Box>

            {fetchError && <Alert severity="error" sx={{ borderRadius: '8px', mb: 2 }}>{fetchError}</Alert>}

            {/* ── Primary KPI row ── */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="Total Net Salary Paid" icon={<AccountBalance />}
                        value={kpis ? formatINRShort(kpis.totalNetSalaryPaid) : null}
                        subtitle={`${kpis?.payslipsGenerated ?? 0} payslips generated`}
                        accentColor="#166534" loading={kpisLoading} />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="Average Salary" icon={<People />}
                        value={kpis ? formatINRShort(kpis.averageSalary) : null}
                        subtitle="Per paid payslip this period"
                        accentColor="#1D4ED8" loading={kpisLoading} />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="Attendance Health" icon={<CheckCircle />}
                        value={kpis?.attendanceHealthPct != null ? `${kpis.attendanceHealthPct}%` : null}
                        subtitle="% on-time check-ins"
                        accentColor={kpis?.attendanceHealthPct >= 80 ? '#166534' : RED}
                        loading={kpisLoading} />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <StatCard title="Approved Time Off" icon={<EventBusy />}
                        value={kpis?.approvedTimeOffDays ?? null}
                        subtitle="Days approved this period"
                        accentColor="#C2410C" loading={kpisLoading} />
                </Grid>
            </Grid>

            {/* ── Secondary KPI row ── */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <StatCard title="Pending Payruns" icon={<PendingActions />}
                        value={kpis?.pendingPayruns ?? null}
                        subtitle="Draft / Computed / Validated"
                        accentColor="#C2410C" loading={kpisLoading} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <StatCard title="Paid Payruns" icon={<CheckCircle />}
                        value={kpis?.paidPayruns ?? null}
                        subtitle="All time"
                        accentColor="#166534" loading={kpisLoading} />
                </Grid>
                <Grid item xs={12} sm={4}>
                    <StatCard title="Pending Leave Requests" icon={<EventBusy />}
                        value={timeoff?.pendingRequests ?? null}
                        subtitle="Awaiting approval this period"
                        accentColor="#6D28D9" loading={toLoading} />
                </Grid>
            </Grid>

            {/* ── Charts row ── */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid item xs={12} md={8}>
                    <ChartCard title="Monthly Net Salary Trend (last 6 months)"
                        loading={trendLoading} empty={trend.length === 0} height={260}>
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={trend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                                <XAxis dataKey="monthShort" tick={{ fontSize: 11, fill: MUTED }} />
                                <YAxis tick={{ fontSize: 11, fill: MUTED }} tickFormatter={v => formatINRShort(v)} />
                                <RTooltip
                                    formatter={v => [formatINR(v), 'Net Salary']}
                                    labelFormatter={(_, p) => p?.[0]?.payload?.month || ''}
                                    contentStyle={{ borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '0.82rem' }} />
                                <Line type="monotone" dataKey="totalNet" stroke={RED} strokeWidth={2.5}
                                    dot={{ r: 4, fill: RED }} activeDot={{ r: 6 }} name="Net Salary" />
                            </LineChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </Grid>
                <Grid item xs={12} md={4}>
                    <ChartCard title="Salary by Department"
                        loading={deptLoading} empty={byDept.length === 0} height={260}>
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={byDept} dataKey="totalNet" nameKey="department"
                                    cx="50%" cy="50%" outerRadius={95} labelLine={false}
                                    label={({ department, percent }) => `${department}: ${(percent * 100).toFixed(0)}%`}>
                                    {byDept.map((_, i) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                    ))}
                                </Pie>
                                <RTooltip formatter={v => formatINR(v)}
                                    contentStyle={{ borderRadius: '8px', border: `1px solid ${BORDER}`, fontSize: '0.82rem' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartCard>
                </Grid>
            </Grid>

            {/* ── Attendance + Time-off overview ── */}
            <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, p: 2.5 }}>
                        <Typography variant="body2" fontWeight={700} color={TEXT} sx={{ mb: 2 }}>
                            Attendance Overview — {period}
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        {attLoading ? <CircularProgress size={22} sx={{ color: RED }} /> : !attendance ? (
                            <Typography variant="body2" color={MUTED}>No data</Typography>
                        ) : (
                            <Box>
                                {[
                                    ['On-time',  attendance.onTime,  '#166534', `${attendance.onTimePct}%`],
                                    ['Late',     attendance.late,    '#C2410C', `${attendance.latePct}%`],
                                    ['Half-day', attendance.halfDay, '#1D4ED8', ''],
                                    ['Absent',   attendance.absent,  RED,       `${attendance.absentPct}%`],
                                    ['On Leave', attendance.onLeave, '#6D28D9', ''],
                                ].map(([label, count, color, pct]) => (
                                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                                            <Typography variant="body2" color={TEXT}>{label}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" fontWeight={700} color={TEXT}>{count ?? 0}</Typography>
                                            {pct && (
                                                <Chip label={pct} size="small"
                                                    sx={{ fontSize: '0.65rem', height: 18, bgcolor: `${color}15`, color, border: `1px solid ${color}44` }} />
                                            )}
                                        </Box>
                                    </Box>
                                ))}
                                <Divider sx={{ my: 1 }} />
                                <Typography variant="caption" color={MUTED}>Total log entries: {attendance.totalLogs}</Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, p: 2.5 }}>
                        <Typography variant="body2" fontWeight={700} color={TEXT} sx={{ mb: 2 }}>
                            Time-Off Overview — {period}
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        {toLoading ? <CircularProgress size={22} sx={{ color: RED }} /> : !timeoff ? (
                            <Typography variant="body2" color={MUTED}>No data</Typography>
                        ) : (
                            <Box>
                                {[
                                    ['Pending Requests',      timeoff.pendingRequests,     '#C2410C'],
                                    ['Approved Requests',     timeoff.approvedRequests,     '#166534'],
                                    ['Approved Days',         timeoff.approvedDays,         '#1D4ED8'],
                                    ['LOP Days',              timeoff.lopDays,              RED],
                                    ['Confirmed Allocations', timeoff.confirmedAllocations, '#6D28D9'],
                                ].map(([label, count, color]) => (
                                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                                            <Typography variant="body2" color={TEXT}>{label}</Typography>
                                        </Box>
                                        <Typography variant="body2" fontWeight={700} color={TEXT}>{count ?? 0}</Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Paper>
                </Grid>
            </Grid>

            {/* ── Live Alerts ── */}
            <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Typography variant="body2" fontWeight={700} color={TEXT}>Live Payroll Alerts</Typography>
                    {alerts.length > 0 && (
                        <Chip label={alerts.length} size="small"
                            sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#FEE2E2', color: '#991b1b', border: '1px solid #FECACA', fontWeight: 700 }} />
                    )}
                </Box>
                <Divider sx={{ mb: 1.5 }} />
                {alertsLoading ? (
                    <CircularProgress size={22} sx={{ color: RED }} />
                ) : alerts.length === 0 ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircle sx={{ fontSize: 16, color: '#166534' }} />
                        <Typography variant="body2" color="#166534">No active alerts — all payruns are clean.</Typography>
                    </Box>
                ) : (
                    <Box sx={{ maxHeight: 260, overflowY: 'auto' }}>
                        {alerts.map((a, i) => (
                            <Alert key={i} severity={a.severity === 'error' ? 'error' : 'warning'}
                                sx={{ mb: 0.75, py: 0.5, borderRadius: '8px', fontSize: '0.8rem' }}>
                                {a.payrunName && <strong>[{a.payrunName}] </strong>}
                                {a.employeeName && <strong>{a.employeeName}: </strong>}
                                {a.message}
                                <Chip label={a.status} size="small"
                                    sx={{ ml: 1, fontSize: '0.62rem', height: 16 }} />
                            </Alert>
                        ))}
                    </Box>
                )}
            </Paper>
        </Box>
    );
};

export default PayrollDashboard;
