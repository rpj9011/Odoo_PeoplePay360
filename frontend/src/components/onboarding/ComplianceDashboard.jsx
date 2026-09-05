// frontend/src/components/onboarding/ComplianceDashboard.jsx
// Admin compliance dashboard embedded in AdminPoliciesPage.
// Shows: onboarding policy config, compliance table, filters, employee timeline, export.

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, Chip, Button, IconButton, Select, MenuItem, FormControl,
    InputLabel, TextField, Tooltip, CircularProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, Divider, Alert
} from '@mui/material';
import TimelineIcon from '@mui/icons-material/Timeline';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import api from '../../api/axios';

// ── Status chip styling ────────────────────────────────────────────────────────
const statusConfig = {
    completed:   { label: 'Completed',   color: '#14532d', bg: '#dcfce7', icon: <CheckCircleIcon sx={{ fontSize: 14 }} /> },
    incomplete:  { label: 'Incomplete',  color: '#92400e', bg: '#fef3c7', icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> },
    in_progress: { label: 'In Progress', color: '#1e3a5f', bg: '#dbeafe', icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} /> },
    pending:     { label: 'Pending',     color: '#713f12', bg: '#fef3c7', icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} /> },
    overdue:     { label: 'Overdue',     color: '#7f1d1d', bg: '#fee2e2', icon: <WarningAmberIcon sx={{ fontSize: 14 }} /> },
    expired:     { label: 'Expired',     color: '#374151', bg: '#f3f4f6', icon: <CancelIcon sx={{ fontSize: 14 }} /> },
};

const StatusChip = ({ status }) => {
    const cfg = statusConfig[status] || statusConfig.pending;
    return (
        <Chip
            size="small"
            icon={cfg.icon}
            label={cfg.label}
            sx={{ background: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: '0.72rem', px: 0.5 }}
        />
    );
};

const BoolChip = ({ val }) => (
    <Chip
        size="small"
        label={val ? 'Yes' : 'No'}
        sx={{
            background: val ? '#dcfce7' : '#fee2e2',
            color: val ? '#14532d' : '#7f1d1d',
            fontWeight: 600, fontSize: '0.72rem'
        }}
    />
);

// ── Timeline dialog ────────────────────────────────────────────────────────────
const TimelineDialog = ({ open, onClose, userId, userName }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !userId) return;
        setLoading(true);
        api.get(`/onboarding/admin/compliance/${userId}/timeline`)
            .then(r => setData(r.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [open, userId]);

    const eventLabels = {
        account_created:    '🏗️  Account Created',
        first_login:        '🔑  First Login',
        policy_opened:      '📄  Policy Opened',
        reading_started:    '📖  Reading Started',
        reading_completed:  '✅  Reading Completed',
        policy_accepted:    '✍️  Policy Accepted',
        tour_started:       '🗺️  Tour Started',
        tour_completed:     '🎯  Tour Completed',
        profile_completed:  '👤  Profile Completed',
        deadline_passed:    '⏰  Deadline Passed',
        onboarding_completed: '🎉  Onboarding Completed',
        forced_by_admin:    '⚡  Reset by Admin',
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
                Onboarding Timeline — {userName}
            </DialogTitle>
            <DialogContent>
                {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
                {!loading && data && (
                    <>
                        {/* Summary chips */}
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                            <Chip size="small" label={`Policy: ${data.log?.accepted ? '✓' : '✗'}`}
                                sx={{ background: data.log?.accepted ? '#dcfce7' : '#fee2e2', fontWeight: 600 }} />
                            <Chip size="small" label={`Tour: ${data.user?.onboarding?.tourCompleted ? '✓' : '✗'}`}
                                sx={{ background: data.user?.onboarding?.tourCompleted ? '#dcfce7' : '#fee2e2', fontWeight: 600 }} />
                            <Chip size="small" label={`Profile: ${data.profileCompleted ? '✓' : '✗'}`}
                                sx={{ background: data.profileCompleted ? '#dcfce7' : '#fee2e2', fontWeight: 600 }} />
                            {data.log?.readingDurationSeconds > 0 && (
                                <Chip size="small" label={`Read: ${Math.round(data.log.readingDurationSeconds / 60)}m`}
                                    sx={{ background: '#dbeafe', fontWeight: 600 }} />
                            )}
                        </Box>

                        {/* Timeline list */}
                        <Box sx={{ position: 'relative', pl: 3 }}>
                            {/* Vertical line */}
                            <Box sx={{
                                position: 'absolute', left: 11, top: 8, bottom: 8,
                                width: 2, background: '#e2e8f0'
                            }} />
                            {data.timeline?.map((t, i) => (
                                <Box key={i} sx={{ display: 'flex', gap: 2, mb: 2, position: 'relative' }}>
                                    {/* Dot */}
                                    <Box sx={{
                                        width: 10, height: 10, borderRadius: '50%',
                                        background: '#6366f1', border: '2px solid #fff',
                                        boxShadow: '0 0 0 2px #6366f1',
                                        flexShrink: 0, mt: '4px',
                                        position: 'absolute', left: -16,
                                    }} />
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                                            {eventLabels[t.event] || t.event}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                                            {t.timestamp ? new Date(t.timestamp).toLocaleString('en-IN') : '—'}
                                        </Typography>
                                        {t.notes && (
                                            <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', mt: 0.2 }}>
                                                {t.notes}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            ))}
                            {(!data.timeline || data.timeline.length === 0) && (
                                <Typography variant="body2" color="text.secondary">No timeline events yet.</Typography>
                            )}
                        </Box>

                        {/* Device info */}
                        {data.log?.browser && (
                            <>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="caption" sx={{ color: '#64748b' }}>
                                    Accepted from: {data.log.ipAddress} · {data.log.browser} · {data.log.deviceType}
                                </Typography>
                            </>
                        )}
                    </>
                )}
                {!loading && !data && <Typography variant="body2" color="text.secondary">No onboarding data found.</Typography>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

// ── Policy onboarding settings panel ─────────────────────────────────────────
const OnboardingPolicySettings = ({ policies, onRefresh }) => {
    const [saving, setSaving] = useState(false);
    const [wordCount, setWordCount] = useState('');
    const [snack, setSnack] = useState('');

    const mandatoryPolicy = policies.find(p => p.isMandatoryOnboarding && p.status === 'Active');

    const handleSet = async (policyId) => {
        setSaving(true);
        try {
            await api.post(`/onboarding/admin/policy/${policyId}/set-mandatory`, {
                wordCount: wordCount ? parseInt(wordCount, 10) : null,
                onboardingExpiryDays: 7,
            });
            setSnack('Mandatory onboarding policy updated.');
            onRefresh();
        } catch (e) {
            setSnack(e.response?.data?.error || 'Failed to update.');
        } finally {
            setSaving(false);
        }
    };

    const handleUnset = async (policyId) => {
        setSaving(true);
        try {
            await api.post(`/onboarding/admin/policy/${policyId}/unset-mandatory`);
            setSnack('Policy unset as mandatory onboarding.');
            onRefresh();
        } catch (e) {
            setSnack(e.response?.data?.error || 'Failed to update.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, color: '#1e293b' }}>
                Onboarding Policy Configuration
            </Typography>

            {snack && <Alert severity="info" sx={{ mb: 1.5 }} onClose={() => setSnack('')}>{snack}</Alert>}

            {mandatoryPolicy ? (
                <Box sx={{
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: 2, p: 2, mb: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap'
                }}>
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#14532d' }}>
                            ✓ Active Mandatory Policy
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#166534' }}>
                            {mandatoryPolicy.name} · v{mandatoryPolicy.version}
                        </Typography>
                        {mandatoryPolicy.wordCount && (
                            <Typography variant="caption" sx={{ color: '#4ade80' }}>
                                Word count: {mandatoryPolicy.wordCount} · Min read: ~{Math.ceil(mandatoryPolicy.wordCount / 200)} min
                            </Typography>
                        )}
                    </Box>
                    <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => handleUnset(mandatoryPolicy._id)}
                        disabled={saving}
                    >
                        Unset as Mandatory
                    </Button>
                </Box>
            ) : (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    No mandatory onboarding policy is set. New employees will skip the policy step.
                </Alert>
            )}

            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#374151' }}>
                Existing Policies — Set one as Mandatory Onboarding
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    label="Word count (optional — for reading time)"
                    type="number"
                    value={wordCount}
                    onChange={e => setWordCount(e.target.value)}
                    sx={{ width: 280 }}
                    inputProps={{ min: 0 }}
                />
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                    Min read time = word count ÷ 200 WPM
                </Typography>
            </Box>

            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                    <TableHead sx={{ background: '#f8fafc' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Policy Name</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Version</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Mandatory</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Uploaded</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {policies.filter(p => p.status === 'Active').map(p => (
                            <TableRow key={p._id} hover>
                                <TableCell sx={{ fontWeight: 500 }}>{p.name}</TableCell>
                                <TableCell>v{p.version}</TableCell>
                                <TableCell><Chip size="small" label={p.status} sx={{ background: '#dcfce7', color: '#14532d', fontWeight: 600, fontSize: '0.7rem' }} /></TableCell>
                                <TableCell><BoolChip val={!!p.isMandatoryOnboarding} /></TableCell>
                                <TableCell sx={{ color: '#64748b', fontSize: '0.75rem' }}>
                                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-IN') : '—'}
                                </TableCell>
                                <TableCell>
                                    {p.isMandatoryOnboarding ? (
                                        <Button size="small" color="error" variant="outlined" onClick={() => handleUnset(p._id)} disabled={saving}>
                                            Unset
                                        </Button>
                                    ) : (
                                        <Button size="small" variant="contained" onClick={() => handleSet(p._id)} disabled={saving}
                                            sx={{ background: '#6366f1', '&:hover': { background: '#4f46e5' } }}>
                                            Set Mandatory
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {policies.filter(p => p.status === 'Active').length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ color: '#94a3b8', py: 3 }}>
                                    No active policies found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

// ── Main ComplianceDashboard component ────────────────────────────────────────
const ComplianceDashboard = ({ policies, onRefreshPolicies }) => {
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ status: '', department: '' });
    const [timelineDialog, setTimelineDialog] = useState({ open: false, userId: null, userName: '' });
    const [exporting, setExporting] = useState(false);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 25 });
            if (filters.status) params.set('status', filters.status);
            if (filters.department) params.set('department', filters.department);
            const { data } = await api.get(`/onboarding/admin/compliance?${params}`);
            setLogs(data.logs || []);
            setTotal(data.total || 0);
        } catch (e) {
            console.error('[ComplianceDashboard] loadLogs error:', e.message);
        } finally {
            setLoading(false);
        }
    }, [page, filters]);

    useEffect(() => { loadLogs(); }, [loadLogs]);

    const handleExport = async (format) => {
        setExporting(true);
        try {
            const params = new URLSearchParams({ format });
            if (filters.status) params.set('status', filters.status);
            if (filters.department) params.set('department', filters.department);

            const { data, headers } = await api.get(
                `/onboarding/admin/compliance/export?${params}`,
                { responseType: format === 'csv' ? 'blob' : 'json' }
            );

            if (format === 'csv') {
                const url = window.URL.createObjectURL(new Blob([data]));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'compliance_report.csv';
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'compliance_report.json';
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.error('[ComplianceDashboard] export error:', e.message);
        } finally {
            setExporting(false);
        }
    };

    const totalPages = Math.ceil(total / 25);

    // Compute summary stats
    const stats = {
        total: total,
        completed: logs.filter(l => (l.displayStatus || l.status) === 'completed').length,
        incomplete: logs.filter(l => (l.displayStatus || l.status) === 'incomplete').length,
        pending: logs.filter(l => ['pending', 'in_progress'].includes(l.displayStatus || l.status)).length,
        overdue: logs.filter(l => (l.displayStatus || l.status) === 'overdue').length,
    };

    return (
        <Box>
            {/* Policy Settings */}
            <OnboardingPolicySettings policies={policies} onRefresh={onRefreshPolicies} />

            <Divider sx={{ my: 3 }} />

            {/* Compliance table header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e293b' }}>
                        Employee Compliance Records
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                        {total} total · {stats.completed} completed · {stats.incomplete} incomplete · {stats.pending} in progress · {stats.overdue} overdue
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleExport('csv')}
                        disabled={exporting}
                        sx={{ textTransform: 'none' }}
                    >
                        Export CSV
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleExport('json')}
                        disabled={exporting}
                        sx={{ textTransform: 'none' }}
                    >
                        Export JSON
                    </Button>
                    <IconButton size="small" onClick={loadLogs} disabled={loading}>
                        <RefreshIcon fontSize="small" />
                    </IconButton>
                </Box>
            </Box>

            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Status</InputLabel>
                    <Select
                        value={filters.status}
                        label="Status"
                        onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}
                    >
                        <MenuItem value="">All</MenuItem>
                        <MenuItem value="completed">Completed</MenuItem>
                        <MenuItem value="incomplete">Incomplete</MenuItem>
                        <MenuItem value="in_progress">In Progress</MenuItem>
                        <MenuItem value="pending">Pending</MenuItem>
                        <MenuItem value="overdue">Overdue</MenuItem>
                        <MenuItem value="expired">Expired</MenuItem>
                    </Select>
                </FormControl>
                <TextField
                    size="small"
                    label="Department"
                    value={filters.department}
                    onChange={e => { setFilters(f => ({ ...f, department: e.target.value })); setPage(1); }}
                    sx={{ minWidth: 160 }}
                />
            </Box>

            {/* Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="small">
                    <TableHead sx={{ background: '#f8fafc' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Employee</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Policy Version</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Accepted</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tour Done</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Profile Done</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Reading Time</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>IP Address</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Browser</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Deadline</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Timeline</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                                    <CircularProgress size={24} />
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && logs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={12} align="center" sx={{ color: '#94a3b8', py: 4 }}>
                                    No compliance records found.
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && logs.map(log => {
                            const user = log.userId || {};
                            const displayStatus = log.displayStatus || log.status;
                            const tourDone = log.timeline?.some(t => t.event === 'tour_completed')
                                || user.onboarding?.tourCompleted;
                            const profileDone = displayStatus === 'completed';
                            const isOverdue = log.profileDeadline && displayStatus !== 'completed'
                                && new Date() > new Date(log.profileDeadline);

                            return (
                                <TableRow key={log._id} hover>
                                    <TableCell>
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                {log.userName}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                                                {log.employeeCode}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ color: '#475569', fontSize: '0.8rem' }}>
                                        {log.department || '—'}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem' }}>
                                        {log.policyName} v{log.policyVersion}
                                    </TableCell>
                                    <TableCell><BoolChip val={log.accepted} /></TableCell>
                                    <TableCell><BoolChip val={tourDone} /></TableCell>
                                    <TableCell><BoolChip val={profileDone} /></TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem', color: '#475569' }}>
                                        {log.readingDurationSeconds
                                            ? `${Math.round(log.readingDurationSeconds / 60)}m ${log.readingDurationSeconds % 60}s`
                                            : '—'}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.75rem', color: '#475569', fontFamily: 'monospace' }}>
                                        {log.ipAddress || '—'}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem', color: '#475569' }}>
                                        {log.browser || '—'}
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.8rem' }}>
                                        {log.profileDeadline ? (
                                            <Typography
                                                variant="caption"
                                                sx={{ color: isOverdue ? '#ef4444' : '#475569', fontWeight: isOverdue ? 700 : 400 }}
                                            >
                                                {new Date(log.profileDeadline).toLocaleDateString('en-IN')}
                                                {isOverdue && ' ⚠'}
                                            </Typography>
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell><StatusChip status={displayStatus} /></TableCell>
                                    <TableCell>
                                        <Tooltip title="View Timeline">
                                            <IconButton
                                                size="small"
                                                onClick={() => setTimelineDialog({
                                                    open: true,
                                                    userId: typeof log.userId === 'object' ? log.userId._id : log.userId,
                                                    userName: log.userName
                                                })}
                                                sx={{ color: '#6366f1' }}
                                            >
                                                <TimelineIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Pagination */}
            {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
                    <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</Button>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Page {page} of {totalPages}
                    </Typography>
                    <Button size="small" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Button>
                </Box>
            )}

            {/* Timeline Dialog */}
            <TimelineDialog
                open={timelineDialog.open}
                onClose={() => setTimelineDialog({ open: false, userId: null, userName: '' })}
                userId={timelineDialog.userId}
                userName={timelineDialog.userName}
            />
        </Box>
    );
};

export default ComplianceDashboard;
