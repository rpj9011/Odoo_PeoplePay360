// frontend/src/pages/LeaveRequestDetailPage.jsx
// Full-page leave request detail: Section A — request detail (mirrors EnhancedLeaveRequestModal visuals)
//                                  Section B — employee leave balance (via useEmployeeLeaveBalance hook)

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Avatar, Chip, Divider, Button, IconButton,
    Tooltip, Stack, Collapse, CircularProgress, Alert, Paper, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    LinearProgress
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    CheckCircle as CheckIcon,
    Cancel as CancelIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Schedule as ScheduleIcon,
    Label as LabelIcon,
    Event as EventIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    AttachFile as AttachFileIcon,
    PictureAsPdf as PdfIcon,
    Image as ImageIcon,
    OpenInNew as OpenInNewIcon,
    Visibility as VisibilityIcon,
    Warning as WarningIcon,
    AccountBalance as BalanceIcon,
    Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../api/axios';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import useEmployeeLeaveBalance from '../hooks/useEmployeeLeaveBalance';
import AdminLeaveForm from '../components/AdminLeaveForm';
import { SkeletonBox } from '../components/SkeletonLoaders';

// ─── colour palette (matches EnhancedLeaveRequestModal) ──────────────────────
const primary = {
    main: '#2C3E50',
    dark: '#1a252f',
    light: '#34495e',
    tint: '#f5f6f7',
    subtle: 'rgba(44, 62, 80, 0.08)',
    subtleStrong: 'rgba(44, 62, 80, 0.12)',
    border: 'rgba(44, 62, 80, 0.18)',
    borderStrong: 'rgba(44, 62, 80, 0.28)',
    gradient: 'linear-gradient(135deg, #34495e 0%, #2C3E50 55%, #1a252f 100%)',
};

// ─── tiny helpers ─────────────────────────────────────────────────────────────
const fmtLong = (d) => new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
});
const fmtShort = (d) => new Date(d).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
});
const fmtCompact = (dates) => {
    if (!dates?.length) return 'N/A';
    const sorted = [...dates].map(s => new Date(s)).filter(d => !isNaN(d)).sort((a, b) => a - b);
    if (!sorted.length) return 'N/A';
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return sorted.length === 1 ? fmt(sorted[0]) : `${fmt(sorted[0])} → ${fmt(sorted[sorted.length - 1])}`;
};

const statusPill = (status) => {
    const map = { Approved: '#4caf50', Rejected: '#f44336', Pending: '#ff9800' };
    return { bg: map[status] ?? '#757575', color: 'white' };
};
const statusChipColor = (s) => ({ Approved: 'success', Rejected: 'error', Pending: 'warning' }[s] ?? 'default');
const statusIcon = (s) => s === 'Approved' ? <CheckIcon /> : s === 'Rejected' ? <CancelIcon /> : <ScheduleIcon />;

const progressColor = (used, total) => {
    if (!total) return 'success';
    const pct = (used / total) * 100;
    return pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'success';
};

// ─── Leave balance table row ──────────────────────────────────────────────────
const BalanceRow = ({ label, allocated, taken, remaining }) => (
    <TableRow>
        <TableCell sx={{ fontWeight: 600, color: primary.main }}>{label}</TableCell>
        <TableCell align="center">{allocated}</TableCell>
        <TableCell align="center">{taken}</TableCell>
        <TableCell align="center">
            <Chip
                label={remaining}
                size="small"
                color={remaining <= 0 ? 'error' : remaining <= 2 ? 'warning' : 'success'}
                sx={{ fontWeight: 700, minWidth: 40 }}
            />
        </TableCell>
    </TableRow>
);

// ─── Main page ────────────────────────────────────────────────────────────────
const LeaveRequestDetailPage = () => {
    const { requestId } = useParams();
    const navigate = useNavigate();

    // ── request state ──
    const [request, setRequest] = useState(null);
    const [requestLoading, setRequestLoading] = useState(true);
    const [requestError, setRequestError] = useState(null);

    // ── UI state ──
    const [timelineExpanded, setTimelineExpanded] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [loadingCert, setLoadingCert] = useState(false);
    const [snackMsg, setSnackMsg] = useState(null); // { text, severity }
    const [editOpen, setEditOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    // ── fetch the request ──
    const fetchRequest = useCallback(async () => {
        setRequestLoading(true);
        setRequestError(null);
        try {
            const res = await api.get(`/admin/leaves/${requestId}`);
            setRequest(res.data);
        } catch (err) {
            setRequestError(err.response?.data?.error || 'Failed to load leave request.');
        } finally {
            setRequestLoading(false);
        }
    }, [requestId]);

    useEffect(() => { fetchRequest(); }, [fetchRequest]);

    // ── leave balance hook ──
    const currentYear = new Date().getFullYear();
    const employeeId = request?.employee?._id ?? null;
    const employeeData = request?.employee ?? null;

    const {
        loading: balanceLoading,
        error: balanceError,
        data: balanceData,
        refetch: refetchBalance,
    } = useEmployeeLeaveBalance(employeeId, currentYear, employeeData);

    // ── helpers derived from balanceData ──
    const entitlements = balanceData?.currentYearEntitlements ?? { sick: 0, casual: 0, paid: 0 };
    const currentBalances = balanceData?.currentBalances ?? {};

    // "taken" = entitlement – remaining balance (backend is source of truth)
    const taken = {
        sick: Math.max(0, entitlements.sick - (currentBalances.sick ?? entitlements.sick)),
        casual: Math.max(0, entitlements.casual - (currentBalances.casual ?? entitlements.casual)),
        paid: Math.max(0, entitlements.paid - (currentBalances.paid ?? entitlements.paid)),
    };

    // LOP days this year from current-year requests
    const lopTaken = (balanceData?.leaveRequests ?? [])
        .filter(r => r.status === 'Approved' && r.requestType === 'Loss of Pay')
        .reduce((sum, r) => sum + r.leaveDates.length * (r.leaveType?.startsWith('Half Day') ? 0.5 : 1), 0);

    // ── action handlers (mirrors AdminLeavesPage handlers) ──
    const handleStatusChange = async (id, status, rejectionNotes = '') => {
        setActionLoading(true);
        try {
            const payload = {
                status,
                overrideReason: `Admin ${status.toLowerCase()} from leave request detail page`,
            };
            if (status === 'Rejected' && rejectionNotes) payload.rejectionNotes = rejectionNotes;
            await api.patch(`/admin/leaves/${id}/status`, payload);
            setSnackMsg({ text: `Leave request ${status.toLowerCase()} successfully.`, severity: 'success' });
            fetchRequest();
            refetchBalance();
        } catch (err) {
            setSnackMsg({ text: err.response?.data?.error || 'Action failed.', severity: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    const handleApprove = () => handleStatusChange(request._id, 'Approved');
    const handleReject = () => handleStatusChange(request._id, 'Rejected', '');

    const handleDelete = async () => {
        setActionLoading(true);
        try {
            await api.delete(`/admin/leaves/${request._id}`);
            setSnackMsg({ text: 'Request deleted.', severity: 'success' });
            setTimeout(() => navigate('/admin/leaves'), 800);
        } catch (err) {
            setSnackMsg({ text: err.response?.data?.error || 'Delete failed.', severity: 'error' });
        } finally {
            setActionLoading(false);
            setDeleteConfirmOpen(false);
        }
    };

    const handleEditSave = async (formData) => {
        try {
            await api.put(`/admin/leaves/${request._id}`, formData);
            setSnackMsg({ text: 'Request updated.', severity: 'success' });
            setEditOpen(false);
            fetchRequest();
            refetchBalance();
        } catch (err) {
            setSnackMsg({ text: err.response?.data?.error || 'Update failed.', severity: 'error' });
        }
    };

    // ── medical certificate viewer (mirrors modal logic) ──
    const handleViewCertificate = async (certUrl) => {
        if (!certUrl) return;
        setLoadingCert(true);
        try {
            const urlParts = certUrl.split('/');
            const filename = urlParts[urlParts.length - 1];
            let fileUrl = certUrl;
            if (import.meta.env.DEV) {
                const backendUrl = api.defaults.baseURL?.replace('/api', '') || 'http://localhost:3011';
                fileUrl = `${backendUrl}/medical-certificates/${filename}`;
            }
            const token = sessionStorage.getItem('ams_token') || sessionStorage.getItem('token') ||
                localStorage.getItem('ams_token') || localStorage.getItem('token');
            const response = await fetch(fileUrl, {
                method: 'GET',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                credentials: 'include',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const win = window.open(blobUrl, '_blank', 'noopener,noreferrer');
            if (!win) {
                const link = document.createElement('a');
                link.href = blobUrl; link.download = filename;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
            }
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        } catch (err) {
            console.error('Error viewing certificate:', err);
            alert('Failed to open medical certificate.');
        } finally {
            setLoadingCert(false);
        }
    };

    // ── loading / error states ──
    if (requestLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress sx={{ color: primary.main }} />
            </Box>
        );
    }

    if (requestError || !request) {
        return (
            <Box sx={{ p: 4 }}>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2, color: primary.main }}>
                    Back to Leave Requests
                </Button>
                <Alert severity="error">{requestError || 'Request not found.'}</Alert>
            </Box>
        );
    }

    const dayCount = request.leaveDates?.length ?? 0;

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <Box sx={{ width: '100%', px: { xs: 2, sm: 3 }, py: 3 }}>

            {/* ── transient snack ── */}
            {snackMsg && (
                <Alert
                    severity={snackMsg.severity}
                    onClose={() => setSnackMsg(null)}
                    sx={{ mb: 2 }}
                >
                    {snackMsg.text}
                </Alert>
            )}

            {/* ── Back button ── */}
            <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(-1)}
                sx={{
                    mb: 3,
                    color: primary.main,
                    fontWeight: 600,
                    textTransform: 'none',
                    '&:hover': { bgcolor: primary.subtle },
                }}
            >
                Back to Leave Requests
            </Button>

            <Grid container spacing={3} alignItems="flex-start">

                {/* ════════════════════════════════════════════════════════
                    SECTION A — This Request
                ════════════════════════════════════════════════════════ */}
                <Grid item xs={12} sm={7} lg={8}>
                    <Paper
                        elevation={0}
                        sx={{
                            borderRadius: 2,
                            border: `1px solid ${primary.border}`,
                            overflow: 'hidden',
                        }}
                    >
                        {/* ── Header: avatar / name / status ── */}
                        <Box
                            sx={{
                                p: 3,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: `1px solid ${primary.border}`,
                                background: primary.tint,
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Avatar
                                    sx={{
                                        width: 52, height: 52,
                                        bgcolor: primary.main,
                                        fontSize: '1.3rem', fontWeight: 700,
                                    }}
                                >
                                    {request.employee?.fullName?.charAt(0) ?? 'E'}
                                </Avatar>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: primary.main, lineHeight: 1.2 }}>
                                        {request.employee?.fullName ?? 'Unknown Employee'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                                        ID: {request.employee?.employeeCode ?? 'N/A'}
                                    </Typography>
                                    {request.employee?.department && (
                                        <Typography variant="body2" color="text.secondary">
                                            {request.employee.department}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                            <Chip
                                label={request.status}
                                sx={{
                                    bgcolor: statusPill(request.status).bg,
                                    color: statusPill(request.status).color,
                                    fontWeight: 700,
                                    height: 30,
                                    fontSize: '0.8rem',
                                }}
                                size="small"
                            />
                        </Box>

                        <Box sx={{ p: 3 }}>

                            {/* ── 1. Date-range highlight card ── */}
                            <Box
                                sx={{
                                    mb: 3, p: 3,
                                    bgcolor: '#e3f2fd',
                                    borderRadius: 2,
                                    border: '1px solid #90caf9',
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#1565c0' }}>
                                        {fmtCompact(request.leaveDates)}
                                    </Typography>
                                    <Chip
                                        label={`${dayCount} Day${dayCount !== 1 ? 's' : ''}`}
                                        sx={{ bgcolor: '#1565c0', color: 'white', fontWeight: 700, height: 30 }}
                                    />
                                </Box>
                                <Typography variant="body1" sx={{ fontWeight: 600, color: '#424242' }}>
                                    {request.leaveType}
                                </Typography>
                                {request.requestType === 'Compensatory' && request.alternateDate && (
                                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #90caf9' }}>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1565c0', mb: 0.5 }}>
                                            Alternate Work Date
                                        </Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 500, color: '#424242' }}>
                                            {fmtShort(request.alternateDate)}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>

                            {/* ── 2. Key metadata row ── */}
                            <Box
                                sx={{
                                    mb: 3, p: 2,
                                    bgcolor: '#fafafa',
                                    borderRadius: 2,
                                    border: `1px solid ${primary.border}`,
                                    display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center',
                                }}
                            >
                                {[
                                    { icon: <ScheduleIcon sx={{ color: primary.main, fontSize: 20 }} />, label: 'Submitted On', value: fmtShort(request.createdAt) },
                                    { icon: <LabelIcon sx={{ color: primary.main, fontSize: 20 }} />, label: 'Request Type', value: formatLeaveRequestType(request.requestType) },
                                    { icon: <EventIcon sx={{ color: primary.main, fontSize: 20 }} />, label: 'Leave Type', value: request.leaveType },
                                ].map(({ icon, label, value }) => (
                                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 auto', minWidth: 180 }}>
                                        {icon}
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: primary.main }}>{value}</Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>

                            {/* ── 3. Status & Timeline — collapsible ── */}
                            <Box sx={{ mb: 3 }}>
                                <Box
                                    onClick={() => setTimelineExpanded(v => !v)}
                                    sx={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        p: 1.5, cursor: 'pointer', borderRadius: 1,
                                        '&:hover': { bgcolor: primary.subtle },
                                    }}
                                >
                                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: primary.main }}>
                                        Status &amp; Timeline
                                    </Typography>
                                    <IconButton size="small">
                                        {timelineExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    </IconButton>
                                </Box>
                                <Collapse in={timelineExpanded}>
                                    <Box sx={{ p: 2, bgcolor: '#fafafa', borderRadius: 1, border: `1px solid ${primary.border}`, mt: 1 }}>
                                        <Stack spacing={2}>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>Current Status</Typography>
                                                <Chip
                                                    icon={statusIcon(request.status)}
                                                    label={request.status}
                                                    color={statusChipColor(request.status)}
                                                    size="medium"
                                                    sx={{ fontWeight: 600, height: 32, '& .MuiChip-icon': { color: 'inherit' } }}
                                                />
                                            </Box>
                                            <Box>
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>Submitted</Typography>
                                                <Typography variant="body1" sx={{ fontWeight: 500, color: '#424242' }}>{fmtLong(request.createdAt)}</Typography>
                                            </Box>
                                            {request.approvedAt && (
                                                <Box>
                                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
                                                        {request.status === 'Approved' ? 'Approved' : 'Rejected'} On
                                                    </Typography>
                                                    <Typography variant="body1" sx={{ fontWeight: 500, color: '#424242' }}>{fmtLong(request.approvedAt)}</Typography>
                                                </Box>
                                            )}
                                        </Stack>
                                    </Box>
                                </Collapse>
                            </Box>

                            {/* ── 4. Reason ── */}
                            <Box
                                sx={{
                                    mb: 3, p: 2.5,
                                    border: `1px solid ${primary.border}`,
                                    borderRadius: 2, bgcolor: '#ffffff',
                                }}
                            >
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: primary.main, mb: 2 }}>
                                    Reason for Leave
                                </Typography>
                                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', color: '#424242', lineHeight: 1.7, minHeight: 50 }}>
                                    {request.reason || '—'}
                                </Typography>
                            </Box>

                            {/* ── 5. Medical certificate (Sick only) ── */}
                            {request.requestType === 'Sick' && request.medicalCertificate && (
                                <Box
                                    sx={{
                                        mb: 3, p: 2.5,
                                        border: `1px solid ${primary.border}`,
                                        borderRadius: 2, bgcolor: '#ffffff',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                                        <AttachFileIcon sx={{ color: primary.main, fontSize: 20 }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: primary.main }}>
                                            Medical Certificate
                                        </Typography>
                                    </Box>
                                    <Box
                                        sx={{
                                            p: 2, bgcolor: '#fafafa', borderRadius: 1, border: `1px solid ${primary.border}`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                                            {request.medicalCertificate.toLowerCase().endsWith('.pdf')
                                                ? <PdfIcon sx={{ color: '#d32f2f', fontSize: 36 }} />
                                                : <ImageIcon sx={{ color: primary.main, fontSize: 36 }} />}
                                            <Box>
                                                <Typography variant="body1" sx={{ fontWeight: 600, color: '#424242', mb: 0.5 }}>Medical Certificate</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {request.medicalCertificate.split('/').pop() || 'Certificate file'}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Stack direction="row" spacing={1}>
                                            <Button
                                                variant="outlined" size="small"
                                                startIcon={loadingCert ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <VisibilityIcon />}
                                                onClick={() => handleViewCertificate(request.medicalCertificate)}
                                                disabled={loadingCert}
                                                sx={{ borderColor: primary.borderStrong, color: primary.main, fontWeight: 600, '&:hover': { borderColor: primary.main, bgcolor: primary.subtle } }}
                                            >
                                                View
                                            </Button>
                                            <Button
                                                variant="contained" size="small"
                                                startIcon={loadingCert ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <OpenInNewIcon />}
                                                onClick={() => handleViewCertificate(request.medicalCertificate)}
                                                disabled={loadingCert}
                                                sx={{ bgcolor: primary.main, '&:hover': { bgcolor: primary.dark }, fontWeight: 600 }}
                                            >
                                                Open
                                            </Button>
                                        </Stack>
                                    </Box>
                                </Box>
                            )}

                            {/* ── 6. Rejection notes ── */}
                            {request.rejectionNotes && (
                                <Box sx={{ mb: 3, p: 2.5, border: '2px solid #f44336', borderRadius: 2, bgcolor: '#ffebee' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                                        <WarningIcon sx={{ color: '#f44336', fontSize: 20 }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#f44336' }}>Rejection Reason</Typography>
                                    </Box>
                                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', fontWeight: 500, color: '#424242' }}>
                                        {request.rejectionNotes}
                                    </Typography>
                                </Box>
                            )}

                            {/* ── 7. Action bar ── */}
                            <Divider sx={{ mb: 2.5 }} />
                            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                                {/* secondary */}
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <Tooltip title="Edit Request">
                                        <IconButton
                                            onClick={() => setEditOpen(true)}
                                            size="small"
                                            sx={{
                                                bgcolor: primary.subtle, color: primary.dark,
                                                border: `1px solid ${primary.border}`,
                                                '&:hover': { bgcolor: primary.subtleStrong, borderColor: primary.main },
                                            }}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete Request">
                                        <IconButton
                                            onClick={() => setDeleteConfirmOpen(true)}
                                            size="small"
                                            sx={{
                                                bgcolor: primary.subtle, color: primary.dark,
                                                border: `1px solid ${primary.border}`,
                                                '&:hover': { bgcolor: '#ffebee', borderColor: '#f44336', color: '#f44336' },
                                            }}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                                {/* primary: approve / reject */}
                                {request.status === 'Pending' && (
                                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                                        <Button
                                            onClick={handleReject}
                                            variant="outlined"
                                            startIcon={actionLoading ? <CircularProgress size={16} /> : <CancelIcon />}
                                            disabled={actionLoading}
                                            sx={{
                                                borderColor: '#f44336', color: '#f44336', fontWeight: 600, px: 3,
                                                '&:hover': { borderColor: '#d32f2f', bgcolor: '#ffebee', borderWidth: 2 },
                                            }}
                                        >
                                            Reject
                                        </Button>
                                        <Button
                                            onClick={handleApprove}
                                            variant="contained"
                                            startIcon={actionLoading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <CheckIcon />}
                                            disabled={actionLoading}
                                            sx={{
                                                bgcolor: '#4caf50', color: 'white', fontWeight: 700, px: 3,
                                                '&:hover': { bgcolor: '#388e3c' },
                                            }}
                                        >
                                            Approve
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    </Paper>
                </Grid>

                {/* ════════════════════════════════════════════════════════
                    SECTION B — Leave Balance
                ════════════════════════════════════════════════════════ */}
                <Grid item xs={12} sm={5} lg={4}>
                    <Paper
                        elevation={0}
                        sx={{
                            borderRadius: 2,
                            border: `1px solid ${primary.border}`,
                            overflow: 'hidden',
                            position: { sm: 'sticky' },
                            top: { sm: 80 },
                        }}
                    >
                        {/* header */}
                        <Box
                            sx={{
                                p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                borderBottom: `1px solid ${primary.border}`,
                                background: primary.tint,
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <BalanceIcon sx={{ color: primary.main, fontSize: 22 }} />
                                <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: primary.main, lineHeight: 1.2 }}>
                                        Leave Balance
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {currentYear} · {request.employee?.fullName?.split(' ')[0] ?? 'Employee'}
                                    </Typography>
                                </Box>
                            </Box>
                            <Tooltip title="Refresh balance">
                                <IconButton size="small" onClick={refetchBalance} disabled={balanceLoading}>
                                    <RefreshIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Box>

                        <Box sx={{ p: 2.5 }}>
                            {balanceLoading ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {[...Array(4)].map((_, i) => (
                                        <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                            <Box sx={{ flex: 2, height: 12, bgcolor: '#f0f0f0', borderRadius: 1 }} />
                                            <Box sx={{ flex: 1, height: 12, bgcolor: '#f0f0f0', borderRadius: 1 }} />
                                            <Box sx={{ flex: 1, height: 12, bgcolor: '#f0f0f0', borderRadius: 1 }} />
                                            <Box sx={{ flex: 1, height: 12, bgcolor: '#f0f0f0', borderRadius: 1 }} />
                                        </Box>
                                    ))}
                                    <LinearProgress sx={{ mt: 1 }} />
                                </Box>
                            ) : balanceError ? (
                                <Alert severity="warning" sx={{ fontSize: '0.8rem' }}>
                                    {balanceError}
                                </Alert>
                            ) : !balanceData ? (
                                <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                                    Balance data unavailable.
                                </Alert>
                            ) : (
                                <>
                                    <TableContainer>
                                        <Table size="small" aria-label="leave balance">
                                            <TableHead>
                                                <TableRow sx={{ '& th': { fontWeight: 700, color: primary.main, fontSize: '0.75rem', py: 1 } }}>
                                                    <TableCell>Type</TableCell>
                                                    <TableCell align="center">Allocated</TableCell>
                                                    <TableCell align="center">Taken</TableCell>
                                                    <TableCell align="center">Remaining</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                <BalanceRow
                                                    label="Sick"
                                                    allocated={entitlements.sick}
                                                    taken={taken.sick}
                                                    remaining={currentBalances.sick ?? entitlements.sick}
                                                />
                                                <BalanceRow
                                                    label="Casual"
                                                    allocated={entitlements.casual}
                                                    taken={taken.casual}
                                                    remaining={currentBalances.casual ?? entitlements.casual}
                                                />
                                                <BalanceRow
                                                    label="Planned / Paid"
                                                    allocated={entitlements.paid}
                                                    taken={taken.paid}
                                                    remaining={currentBalances.paid ?? entitlements.paid}
                                                />
                                                <BalanceRow
                                                    label="Loss of Pay"
                                                    allocated="—"
                                                    taken={lopTaken}
                                                    remaining="—"
                                                />
                                            </TableBody>
                                        </Table>
                                    </TableContainer>

                                    {/* Mini progress bars */}
                                    <Box sx={{ mt: 2.5 }}>
                                        {[
                                            { label: 'Sick', used: taken.sick, total: entitlements.sick },
                                            { label: 'Casual', used: taken.casual, total: entitlements.casual },
                                            { label: 'Planned', used: taken.paid, total: entitlements.paid },
                                        ].map(({ label, used, total }) => (
                                            <Box key={label} sx={{ mb: 1.5 }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 600, color: primary.main }}>{label}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {used} / {total} days
                                                    </Typography>
                                                </Box>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={total > 0 ? Math.min(100, (used / total) * 100) : 0}
                                                    color={progressColor(used, total)}
                                                    sx={{ borderRadius: 1, height: 6 }}
                                                />
                                            </Box>
                                        ))}
                                    </Box>

                                    {/* Context note */}
                                    <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fff8e1', borderRadius: 1, border: '1px solid #ffe082' }}>
                                        <Typography variant="caption" sx={{ color: '#5d4037', fontWeight: 500, lineHeight: 1.5 }}>
                                            Balances reflect approved leaves so far in {currentYear}. Approving this request will deduct{' '}
                                            <strong>{dayCount} day{dayCount !== 1 ? 's' : ''}</strong> from{' '}
                                            <strong>{formatLeaveRequestType(request.requestType)}</strong>.
                                        </Typography>
                                    </Box>
                                </>
                            )}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* ── Delete confirmation ── */}
            {deleteConfirmOpen && (
                <Box
                    sx={{
                        position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,0.45)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1300,
                    }}
                    onClick={() => setDeleteConfirmOpen(false)}
                >
                    <Paper
                        onClick={e => e.stopPropagation()}
                        sx={{ p: 3, borderRadius: 2, maxWidth: 400, width: '90%' }}
                    >
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Delete Leave Request?</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            This action cannot be undone. The request for{' '}
                            <strong>{request.employee?.fullName}</strong> will be permanently deleted.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
                            <Button variant="outlined" onClick={() => setDeleteConfirmOpen(false)} sx={{ borderColor: primary.border, color: primary.main }}>
                                Cancel
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleDelete}
                                disabled={actionLoading}
                                sx={{ bgcolor: '#f44336', '&:hover': { bgcolor: '#d32f2f' }, fontWeight: 700 }}
                            >
                                {actionLoading ? <CircularProgress size={18} sx={{ color: 'white' }} /> : 'Delete'}
                            </Button>
                        </Box>
                    </Paper>
                </Box>
            )}

            {/* ── Edit form (reuse AdminLeaveForm) ── */}
            {editOpen && (
                <AdminLeaveForm
                    open={editOpen}
                    onClose={() => setEditOpen(false)}
                    onSave={handleEditSave}
                    request={request}
                />
            )}
        </Box>
    );
};

export default LeaveRequestDetailPage;
