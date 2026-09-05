import React, { useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    Button,
    Typography,
    Box,
    Chip,
    Grid,
    IconButton,
    Stack,
    Divider,
    alpha,
} from '@mui/material';
import {
    CalendarToday,
    Close,
    Event,
    Schedule,
    Description,
    SupportAgent,
    EditOutlined,
    CheckCircleOutline,
    HourglassEmpty,
    CancelOutlined,
    Replay,
} from '@mui/icons-material';
import { formatLeaveRequestType } from '../utils/saturdayUtils';

const formatPrettyDate = (dateString, isTentative = false) => {
    if (!dateString || isTentative) return 'Tentative (date not decided)';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return 'Tentative (date not decided)';
    return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

const STATUS_CONFIG = {
    Pending: {
        label: 'Pending approval',
        subtitle: 'Your manager or HR will review this request soon.',
        color: '#D97706',
        bg: '#FFFBEB',
        border: '#FCD34D',
        icon: HourglassEmpty,
    },
    Approved: {
        label: 'Approved',
        subtitle: 'This leave request has been approved.',
        color: '#059669',
        bg: '#ECFDF5',
        border: '#6EE7B7',
        icon: CheckCircleOutline,
    },
    Rejected: {
        label: 'Rejected',
        subtitle: 'See rejection notes below for more information.',
        color: '#DC2626',
        bg: '#FEF2F2',
        border: '#FECACA',
        icon: CancelOutlined,
    },
    Returned: {
        label: 'Needs your correction',
        subtitle: 'Update your request using the note from HR below.',
        color: '#EA580C',
        bg: '#FFF7ED',
        border: '#FDBA74',
        icon: Replay,
    },
};

const InfoTile = ({ label, value, icon: Icon }) => (
    <Box
        sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: '#F9FAFB',
            border: '1px solid #E5E7EB',
            height: '100%',
        }}
    >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            {Icon && <Icon sx={{ fontSize: 16, color: '#9CA3AF' }} />}
            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 500, letterSpacing: 0.2 }}>
                {label}
            </Typography>
        </Stack>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', lineHeight: 1.4 }}>
            {value}
        </Typography>
    </Box>
);

const EmployeeLeaveDetailsModal = ({ open, request, onClose, onEditResubmit }) => {
    const statusKey = request?.status || 'Pending';
    const status = STATUS_CONFIG[statusKey] || STATUS_CONFIG.Pending;
    const StatusIcon = status.icon;

    const leaveDateChips = useMemo(() => {
        if (!request?.leaveDates?.length) return [];
        if (request.requestType === 'Compensatory' && request.alternateDate) {
            return [
                { label: formatPrettyDate(request.leaveDates[0]), sub: 'Leave date' },
                { label: formatPrettyDate(request.alternateDate), sub: 'Worked on' },
            ];
        }
        return request.leaveDates.map((date) => ({
            label: formatPrettyDate(date),
            sub: null,
        }));
    }, [request]);

    if (!request) {
        return (
            <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
                <DialogContent />
            </Dialog>
        );
    }

    const dayCount = request.leaveDates?.length || 0;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            PaperProps={{
                sx: {
                    borderRadius: 3,
                    overflow: 'hidden',
                    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.12)',
                    maxHeight: { xs: '92vh', sm: '88vh' },
                },
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    px: 3,
                    py: 2.5,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: '#fff',
                }}
            >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box
                        sx={{
                            width: 44,
                            height: 44,
                            borderRadius: 2,
                            bgcolor: alpha('#3B82F6', 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <CalendarToday sx={{ color: '#2563EB', fontSize: 22 }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>
                            Leave request
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.25 }}>
                            Submitted {formatPrettyDate(request.createdAt)}
                        </Typography>
                    </Box>
                </Stack>
                <IconButton
                    onClick={onClose}
                    size="small"
                    aria-label="Close"
                    sx={{
                        color: '#6B7280',
                        bgcolor: '#F3F4F6',
                        '&:hover': { bgcolor: '#E5E7EB', color: '#111827' },
                    }}
                >
                    <Close fontSize="small" />
                </IconButton>
            </Box>

            <DialogContent sx={{ p: 0, bgcolor: '#F9FAFB' }}>
                <Box sx={{ p: 3 }}>
                    {/* Status banner */}
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 1.5,
                            p: 2,
                            mb: 2.5,
                            borderRadius: 2,
                            bgcolor: status.bg,
                            border: '1px solid',
                            borderColor: status.border,
                        }}
                    >
                        <StatusIcon sx={{ color: status.color, fontSize: 22, mt: 0.25, flexShrink: 0 }} />
                        <Box>
                            <Typography sx={{ fontWeight: 700, color: status.color, fontSize: '0.95rem' }}>
                                {status.label}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#4B5563', mt: 0.25, lineHeight: 1.5 }}>
                                {status.subtitle}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Summary tiles */}
                    <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
                        <Grid item xs={6}>
                            <InfoTile
                                label="Request type"
                                value={formatLeaveRequestType(request.requestType)}
                                icon={Event}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <InfoTile label="Day type" value={request.leaveType || '—'} icon={Schedule} />
                        </Grid>
                        <Grid item xs={6}>
                            <InfoTile
                                label="Total days"
                                value={`${dayCount} day${dayCount !== 1 ? 's' : ''}`}
                                icon={CalendarToday}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <InfoTile
                                label="Status"
                                value={statusKey}
                                icon={StatusIcon}
                            />
                        </Grid>
                    </Grid>

                    {/* Leave dates */}
                    <Box
                        sx={{
                            p: 2,
                            mb: 2.5,
                            borderRadius: 2,
                            bgcolor: '#fff',
                            border: '1px solid #E5E7EB',
                        }}
                    >
                        <Typography
                            variant="caption"
                            sx={{ color: '#6B7280', fontWeight: 600, display: 'block', mb: 1.25 }}
                        >
                            Leave dates
                        </Typography>
                        <Stack direction="row" flexWrap="wrap" gap={1.5}>
                            {leaveDateChips.map((item, idx) => (
                                <Box key={`${item.label}-${idx}`}>
                                    {item.sub && (
                                        <Typography variant="caption" sx={{ color: '#6B7280', display: 'block', mb: 0.25 }}>
                                            {item.sub}
                                        </Typography>
                                    )}
                                    <Chip
                                        label={item.label}
                                        sx={{
                                            bgcolor: '#EFF6FF',
                                            color: '#1E40AF',
                                            border: '1px solid #BFDBFE',
                                            fontWeight: 600,
                                        }}
                                    />
                                </Box>
                            ))}
                        </Stack>
                    </Box>

                    {/* Reason */}
                    <Box
                        sx={{
                            p: 2,
                            mb: 2.5,
                            borderRadius: 2,
                            bgcolor: '#fff',
                            border: '1px solid #E5E7EB',
                        }}
                    >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <Description sx={{ fontSize: 18, color: '#9CA3AF' }} />
                            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600 }}>
                                Reason for leave
                            </Typography>
                        </Stack>
                        <Typography
                            variant="body2"
                            sx={{
                                color: '#374151',
                                lineHeight: 1.65,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                            }}
                        >
                            {request.reason?.trim() || 'No reason provided.'}
                        </Typography>
                    </Box>

                    {/* HR correction note — single place only */}
                    {statusKey === 'Returned' && request.hrCorrectionNotes && (
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: '#FFFBEB',
                                border: '1px solid #FDE68A',
                            }}
                        >
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <SupportAgent sx={{ fontSize: 20, color: '#D97706' }} />
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#B45309' }}>
                                    Note from HR
                                </Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ color: '#78350F', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                                {request.hrCorrectionNotes}
                            </Typography>
                        </Box>
                    )}

                    {/* Rejection notes */}
                    {request.rejectionNotes && (
                        <Box
                            sx={{
                                p: 2,
                                mt: 2.5,
                                borderRadius: 2,
                                bgcolor: '#FEF2F2',
                                border: '1px solid #FECACA',
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#B91C1C', mb: 1 }}>
                                Rejection notes
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#7F1D1D', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                                {request.rejectionNotes}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </DialogContent>

            <Divider />

            {/* Footer */}
            <Box
                sx={{
                    px: 3,
                    py: 2,
                    display: 'flex',
                    flexDirection: { xs: 'column-reverse', sm: 'row' },
                    justifyContent: 'flex-end',
                    gap: 1.5,
                    bgcolor: '#fff',
                }}
            >
                <Button
                    onClick={onClose}
                    variant={statusKey === 'Returned' ? 'outlined' : 'contained'}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 2,
                        px: 3,
                        ...(statusKey !== 'Returned' && {
                            bgcolor: '#111827',
                            '&:hover': { bgcolor: '#374151' },
                        }),
                    }}
                >
                    Close
                </Button>
                {statusKey === 'Returned' && (
                    <Button
                        variant="contained"
                        startIcon={<EditOutlined />}
                        onClick={() => onEditResubmit?.(request)}
                        sx={{
                            textTransform: 'none',
                            fontWeight: 600,
                            borderRadius: 2,
                            px: 3,
                            bgcolor: '#2563EB',
                            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                            '&:hover': { bgcolor: '#1D4ED8' },
                        }}
                    >
                        Edit & resubmit
                    </Button>
                )}
            </Box>
        </Dialog>
    );
};

export default EmployeeLeaveDetailsModal;
