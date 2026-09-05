/**
 * Admin-only Early Checkout Request (ECR) approval modal.
 * UI: status-first header, processed-state banner, grouped metadata, emphasized reason, state-based footer.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Alert,
    Fade,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import api from '../api/axios';
import { formatISTDate } from '../utils/istTime';
import { SkeletonBox } from './SkeletonLoaders';

const formatRemaining = (minutes) => {
    if (minutes == null || typeof minutes !== 'number' || minutes < 0) return '—';
    const totalSeconds = Math.floor(minutes * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0) parts.push(`${m}m`);
    if (s > 0 || (h === 0 && m === 0)) parts.push(`${s}s`);
    
    return parts.length > 0 ? parts.join(' ') : '0s';
};

const formatCompletedTime = (seconds) => {
    if (seconds == null || typeof seconds !== 'number' || seconds < 0) return '—';
    const totalSeconds = Math.floor(seconds);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || h > 0) parts.push(`${m}m`);
    if (s > 0 || (h === 0 && m === 0)) parts.push(`${s}s`);
    
    return parts.length > 0 ? parts.join(' ') : '0s';
};

const STATUS_CONFIG = {
    Pending: {
        color: '#ed6c02',
        bg: 'rgba(237, 108, 2, 0.12)',
        icon: ScheduleIcon,
        label: 'Pending',
    },
    Approved: {
        color: '#2e7d32',
        bg: 'rgba(46, 125, 50, 0.12)',
        icon: CheckCircleOutlineIcon,
        label: 'Approved',
    },
    Rejected: {
        color: '#d32f2f',
        bg: 'rgba(211, 47, 47, 0.12)',
        icon: CancelOutlinedIcon,
        label: 'Rejected',
    },
};

const EarlyCheckoutApprovalModal = ({ open, requestId, onClose, onSuccess }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState('');
    const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
    const clickDebounceRef = useRef(null);

    const fetchDetails = useCallback(async (id) => {
        if (!id) return;
        setLoading(true);
        setError('');
        try {
            const res = await api.get(`/admin/early-checkout-requests/${id}`);
            setData(res.data);
        } catch (err) {
            setError(err?.response?.data?.error || 'Failed to load request.');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open && requestId) {
            fetchDetails(requestId);
        } else {
            setData(null);
            setError('');
            setRejectConfirmOpen(false);
        }
    }, [open, requestId, fetchDetails]);

    const handleClose = useCallback(() => {
        if (actionLoading) return;
        setRejectConfirmOpen(false);
        onClose();
    }, [actionLoading, onClose]);

    const handleApprove = useCallback(async () => {
        if (!requestId || data?.status !== 'Pending') return;
        if (clickDebounceRef.current) return;
        clickDebounceRef.current = true;
        setActionLoading(true);
        setError('');
        try {
            await api.post(`/admin/early-checkout-requests/${requestId}/approve`);
            if (onSuccess) onSuccess('Early checkout approved.');
            handleClose();
        } catch (err) {
            setError(err?.response?.data?.error || 'Approval failed.');
        } finally {
            setActionLoading(false);
            setTimeout(() => { clickDebounceRef.current = false; }, 300);
        }
    }, [requestId, data?.status, onSuccess, handleClose]);

    const handleRejectConfirm = useCallback(() => {
        setRejectConfirmOpen(true);
    }, []);

    const handleReject = useCallback(async () => {
        if (!requestId || data?.status !== 'Pending') return;
        if (clickDebounceRef.current) return;
        clickDebounceRef.current = true;
        setActionLoading(true);
        setError('');
        try {
            await api.post(`/admin/early-checkout-requests/${requestId}/reject`);
            setRejectConfirmOpen(false);
            if (onSuccess) onSuccess('Early checkout rejected.');
            handleClose();
        } catch (err) {
            setError(err?.response?.data?.error || 'Rejection failed.');
        } finally {
            setActionLoading(false);
            setTimeout(() => { clickDebounceRef.current = false; }, 300);
        }
    }, [requestId, data?.status, onSuccess, handleClose]);

    const isPending = data?.status === 'Pending';
    const statusKey = data?.status || 'Pending';
    const statusStyle = STATUS_CONFIG[statusKey] || STATUS_CONFIG.Pending;
    const StatusIcon = statusStyle.icon;

    if (!open) return null;

    return (
        <>
            <Dialog
                open={open}
                onClose={handleClose}
                maxWidth="sm"
                fullWidth
                TransitionComponent={Fade}
                TransitionProps={{ timeout: 180 }}
                PaperProps={{
                    sx: {
                        borderRadius: 2,
                        overflow: 'hidden',
                    },
                }}
                aria-labelledby="ecr-modal-title"
                aria-describedby="ecr-modal-description"
            >
                {/* STEP 1: Status-first header */}
                <DialogTitle
                    id="ecr-modal-title"
                    component="div"
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 2,
                        flexWrap: 'wrap',
                        pb: 1.5,
                    }}
                >
                    <Typography variant="h6" component="span" sx={{ fontWeight: 600 }}>
                        Early Checkout Request
                    </Typography>
                    {data && (
                        <Box
                            component="span"
                            sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.75,
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 2,
                                bgcolor: statusStyle.bg,
                                color: statusStyle.color,
                                fontWeight: 700,
                                fontSize: '0.875rem',
                            }}
                            aria-live="polite"
                        >
                            <StatusIcon sx={{ fontSize: 20 }} />
                            {statusStyle.label}
                        </Box>
                    )}
                </DialogTitle>

                <DialogContent id="ecr-modal-description" sx={{ pt: 0, pb: 2 }}>
                    {/* STEP 2: Processed state banner */}
                    {data && !isPending && (
                        <Alert
                            severity={data.status === 'Approved' ? 'success' : 'error'}
                            icon={data.status === 'Approved' ? <CheckCircleOutlineIcon /> : <CancelOutlinedIcon />}
                            sx={{
                                mb: 2,
                                bgcolor: data.status === 'Approved' ? 'rgba(46, 125, 50, 0.08)' : 'rgba(211, 47, 47, 0.08)',
                                '& .MuiAlert-message': { fontWeight: 500 },
                            }}
                            role="status"
                        >
                            {data.status === 'Approved'
                                ? 'This early checkout request was approved.'
                                : 'This early checkout request was rejected.'}
                        </Alert>
                    )}

                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    {loading && (
                        <Box sx={{ py: 2 }}>
                            <SkeletonBox width="100%" height={24} sx={{ mb: 1 }} />
                            <SkeletonBox width="60%" height={20} sx={{ mb: 1 }} />
                            <SkeletonBox width="100%" height={60} borderRadius={1} />
                        </Box>
                    )}

                    {!loading && data && (
                        <>
                            {/* STEP 3: Information grouping (card style) */}
                            <Box
                                component="section"
                                aria-label="Request details"
                                sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: 'grey.50',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    mb: 2,
                                }}
                            >
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                                        gap: 2,
                                    }}
                                >
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>
                                            Employee
                                        </Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 700 }}>
                                            {data.employee_name || '—'}
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>
                                            Date
                                        </Typography>
                                        <Typography variant="body1" sx={{ mb: 1 }}>
                                            {data.date ? formatISTDate(data.date) : '—'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>
                                            Completed Time
                                        </Typography>
                                        <Typography variant="body1">
                                            {formatCompletedTime(data.completed_time_seconds)}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ gridColumn: { xs: 1, sm: '1 / -1' } }}>
                                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.25 }}>
                                            Remaining Work Time
                                        </Typography>
                                        <Typography variant="body1">
                                            {formatRemaining(data.remaining_time)}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>

                            {/* STEP 4: Employee reason emphasis */}
                            <Typography variant="caption" color="text.secondary" component="label" display="block" sx={{ mb: 0.75, fontWeight: 500 }}>
                                Employee Reason
                            </Typography>
                            <Box
                                component="blockquote"
                                sx={{
                                    m: 0,
                                    p: 2,
                                    bgcolor: 'background.paper',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderLeft: '4px solid',
                                    borderLeftColor: 'primary.main',
                                    borderRadius: 1,
                                    minHeight: 72,
                                    maxHeight: 200,
                                    overflowY: 'auto',
                                }}
                            >
                                <Typography variant="body2" component="span" sx={{ whiteSpace: 'pre-wrap', display: 'block' }}>
                                    {data.reason || '—'}
                                </Typography>
                            </Box>
                        </>
                    )}
                </DialogContent>

                {/* STEP 5: Footer by state */}
                <DialogActions
                    sx={{
                        px: 2,
                        py: 1.5,
                        borderTop: 1,
                        borderColor: 'divider',
                        bgcolor: 'grey.50',
                        justifyContent: isPending ? 'flex-end' : 'center',
                        minHeight: isPending ? 56 : 52,
                    }}
                >
                    {isPending ? (
                        <>
                            <Button
                                variant="outlined"
                                color="error"
                                onClick={handleRejectConfirm}
                                disabled={actionLoading}
                                aria-label="Reject request"
                            >
                                Reject
                            </Button>
                            <Button
                                variant="contained"
                                color="success"
                                onClick={handleApprove}
                                disabled={actionLoading}
                                aria-label="Approve request"
                            >
                                {actionLoading ? 'Processing…' : 'Approve'}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={handleClose} variant="text" color="primary" aria-label="Close">
                            Close
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            {/* Reject confirmation */}
            <Dialog
                open={rejectConfirmOpen}
                onClose={() => !actionLoading && setRejectConfirmOpen(false)}
                maxWidth="xs"
                fullWidth
                TransitionComponent={Fade}
                TransitionProps={{ timeout: 150 }}
            >
                <DialogTitle>Reject request?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        Reject this early checkout request? The employee will remain clocked in.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejectConfirmOpen(false)} disabled={actionLoading}>
                        Cancel
                    </Button>
                    <Button variant="contained" color="error" onClick={handleReject} disabled={actionLoading}>
                        {actionLoading ? 'Rejecting…' : 'Reject'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default EarlyCheckoutApprovalModal;
