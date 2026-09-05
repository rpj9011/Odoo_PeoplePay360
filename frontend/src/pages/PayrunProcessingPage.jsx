// frontend/src/pages/PayrunProcessingPage.jsx
// Route: /payroll/payruns/:id — Payrun lifecycle processing screen.
// Styled to match app design system (PageHeroHeader, red accents, semantic chips).

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Alert, Box, Button, Chip, CircularProgress, Collapse,
    Divider, IconButton, LinearProgress, Paper, Stack, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow,
    Tooltip, Typography,
} from '@mui/material';
import {
    ArrowBack, Calculate, CheckCircle, Email, ExpandLess, ExpandMore,
    LockOutlined, PictureAsPdf, Refresh, Send, WarningAmber,
} from '@mui/icons-material';
import axios from '../api/axios';
import PageHeroHeader from '../components/PageHeroHeader';
import PaymentsIcon from '@mui/icons-material/Payments';
import { Breadcrumbs, Link } from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

// ── Design tokens ─────────────────────────────────────────────────────────────
const RED    = '#E53935';
const TEXT   = '#1A1A1A';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';
const SURFACE = '#F8F9FB';

const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, #C62828 100%)`,
    textTransform: 'none', fontWeight: 600, borderRadius: '8px', boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, #C62828 0%, #B71C1C 100%)', boxShadow: 'none' },
    '&:disabled': { opacity: 0.55 },
};

const outlinedBtnSx = {
    textTransform: 'none', borderRadius: '8px', fontWeight: 500,
    borderColor: BORDER, color: MUTED,
};

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_ORDER = ['Draft', 'Computed', 'Validated', 'Paid'];

const STATUS_SX = {
    Draft:     { bgcolor: '#F9FAFB', color: MUTED,     border: `1px solid ${BORDER}` },
    Computed:  { bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' },
    Validated: { bgcolor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' },
    Paid:      { bgcolor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
    Cancelled: { bgcolor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
};

const StatusChip = ({ status, sx = {} }) => (
    <Chip label={status} size="small"
        sx={{ fontWeight: 700, fontSize: '0.72rem', ...(STATUS_SX[status] || {}), ...sx }} />
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = d => !d ? '—' : new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtCurrency = n => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

const progressValue = { Draft: 0, Computed: 33, Validated: 66, Paid: 100 };

// ── Component ─────────────────────────────────────────────────────────────────
const PayrunProcessingPage = () => {
    const { id }   = useParams();
    const navigate = useNavigate();

    const [payrun,    setPayrun]    = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState('');

    const [computing,   setComputing]   = useState(false);
    const [validating,  setValidating]  = useState(false);
    const [markingPaid, setMarkingPaid] = useState(false);
    const [sending,     setSending]     = useState(false);

    const [actionMsg,   setActionMsg]   = useState(null);
    const [sendResults, setSendResults] = useState(null);
    const [warningsOpen, setWarningsOpen] = useState(true);

    const loadPayrun = useCallback(() => {
        setLoading(true); setError('');
        axios.get(`/api/payroll/payruns/${id}`)
            .then(r => setPayrun(r.data?.data || null))
            .catch(err => setError(err.response?.data?.error || 'Failed to load payrun.'))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { loadPayrun(); }, [loadPayrun]);

    const clearMsg = () => { setActionMsg(null); setSendResults(null); };

    const doAction = async (fn, setInFlight, msg) => {
        clearMsg(); setInFlight(true);
        try {
            const r = await fn();
            setActionMsg({ severity: 'success', text: r.data.message || msg });
            loadPayrun();
        } catch (err) {
            const data = err.response?.data;
            setActionMsg({ severity: 'error', text: data?.error || `${msg} failed.` });
            if (msg === 'Validate') setWarningsOpen(true);
        } finally { setInFlight(false); }
    };

    const doCompute   = () => doAction(() => axios.post(`/api/payroll/payruns/${id}/compute`),   setComputing,   'Compute');
    const doValidate  = () => doAction(() => axios.post(`/api/payroll/payruns/${id}/validate`),  setValidating,  'Validate');
    const doMarkPaid  = () => doAction(() => axios.post(`/api/payroll/payruns/${id}/mark-paid`), setMarkingPaid, 'Mark Paid');

    const doSendPayslips = async () => {
        clearMsg(); setSending(true);
        try {
            const r = await axios.post(`/api/payroll/payruns/${id}/send-payslips`);
            setSendResults(r.data?.results || []);
            setActionMsg({ severity: r.data?.results?.every(x => x.success) ? 'success' : 'warning', text: r.data?.message || 'Payslips sent.' });
            loadPayrun();
        } catch (err) {
            setActionMsg({ severity: 'error', text: err.response?.data?.error || 'Failed to send payslips.' });
        } finally { setSending(false); }
    };

    const printPayslip = async (payslipId) => {
        try {
            const r = await axios.get(`/api/payroll/payslips/${payslipId}/pdf`, { responseType: 'blob' });
            const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
            window.open(url, '_blank');
        } catch { setActionMsg({ severity: 'error', text: 'Failed to generate PDF.' }); }
    };

    // ── Derived ───────────────────────────────────────────────────────────────
    const status  = payrun?.status || 'Draft';
    const isPaid  = status === 'Paid';
    const pct     = progressValue[status] ?? 0;

    const allWarnings = (payrun?.payslips || []).flatMap(ps =>
        (ps.warnings || []).map(w => ({
            ...w, employeeName: ps.employee?.fullName || String(ps.employee), payslipId: ps._id,
        }))
    );
    const hasBlocking = allWarnings.some(w => w.blocking);

    const totals = {
        gross:      (payrun?.payslips || []).reduce((s, p) => s + (p.grossTotal || 0), 0),
        deductions: (payrun?.payslips || []).reduce((s, p) => s + (p.deductionsTotal || 0), 0),
        net:        (payrun?.payslips || []).reduce((s, p) => s + (p.netTotal || 0), 0),
    };

    // ── Loading / error states ────────────────────────────────────────────────
    if (loading) return (
        <Box sx={{ bgcolor: SURFACE, px: { xs: 2, md: 4 }, pt: 3, display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
        </Box>
    );

    if (error) return (
        <Box sx={{ bgcolor: SURFACE, px: { xs: 2, md: 4 }, pt: 3 }}>
            <Alert severity="error" sx={{ borderRadius: '8px' }}
                action={<Button size="small" onClick={loadPayrun} startIcon={<Refresh />}>Retry</Button>}>
                {error}
            </Alert>
        </Box>
    );

    if (!payrun) return null;

    return (
        <Box sx={{ bgcolor: SURFACE }}>
            {/* ── Breadcrumb ── */}
            <Box sx={{ px: { xs: 2, md: 4 }, pt: 2, pb: 0 }}>
                <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}
                    sx={{ '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap', alignItems: 'center' } }}>
                    <Link component="button" variant="body2" underline="hover"
                        onClick={() => navigate('/payroll')}
                        sx={{ color: MUTED, display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', fontSize: '0.82rem' }}>
                        <ArrowBack sx={{ fontSize: 14 }} /> Payroll
                    </Link>
                    <Typography variant="body2" color={TEXT} fontWeight={500} sx={{ fontSize: '0.82rem' }}>
                        {payrun?.name || 'Payrun'}
                    </Typography>
                </Breadcrumbs>
            </Box>

            {/* ── Hero header ── */}
            <PageHeroHeader
                eyebrow="Payroll"
                title={payrun.name}
                description={`${payrun.salaryStructure?.name} · ${fmtDate(payrun.periodStart)} → ${fmtDate(payrun.periodEnd)}`}
                icon={<PaymentsIcon />}
            />

            <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>

                {/* ── Status progress bar ── */}
                <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, p: 2.5, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <StatusChip status={status} sx={{ px: 1 }} />
                            {isPaid && (
                                <Typography variant="caption" color={MUTED}>
                                    <LockOutlined sx={{ fontSize: 11, mr: 0.4, verticalAlign: 'middle' }} />
                                    Paid {fmtDate(payrun.paidAt)} · {payrun.paidBy?.fullName || '—'}
                                </Typography>
                            )}
                        </Box>
                        <Typography variant="caption" color={MUTED}>
                            Created by {payrun.createdBy?.fullName || '—'} · {fmtDate(payrun.createdAt)}
                        </Typography>
                    </Box>

                    <LinearProgress variant="determinate" value={pct}
                        sx={{
                            height: 6, borderRadius: 3, bgcolor: '#E5E7EB',
                            '& .MuiLinearProgress-bar': { bgcolor: pct === 100 ? '#22c55e' : RED, borderRadius: 3 },
                        }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                        {STATUS_ORDER.map(s => (
                            <Typography key={s} variant="caption"
                                sx={{
                                    color: STATUS_ORDER.indexOf(s) <= STATUS_ORDER.indexOf(status) ? TEXT : MUTED,
                                    fontWeight: s === status ? 700 : 400,
                                    fontSize: '0.7rem',
                                }}>
                                {s}
                            </Typography>
                        ))}
                    </Box>
                </Paper>

                {/* ── Action feedback ── */}
                {actionMsg && (
                    <Alert severity={actionMsg.severity} onClose={() => setActionMsg(null)}
                        sx={{ borderRadius: '8px', mb: 2 }}>
                        {actionMsg.text}
                    </Alert>
                )}

                {/* ── Action buttons ── */}
                <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, p: 2, mb: 3 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start" flexWrap="wrap">
                        {/* Compute */}
                        <Tooltip title={isPaid ? 'Payrun is locked (Paid)' : ''}>
                            <span>
                                <Button variant={status === 'Draft' ? 'contained' : 'outlined'}
                                    startIcon={computing ? <CircularProgress size={15} color="inherit" /> : <Calculate />}
                                    onClick={doCompute}
                                    disabled={computing || isPaid || (status !== 'Draft' && status !== 'Computed')}
                                    sx={status === 'Draft' ? primaryBtnSx : { ...outlinedBtnSx, color: '#1D4ED8', borderColor: '#BFDBFE' }}>
                                    {computing ? 'Computing…' : status === 'Computed' ? 'Recompute' : 'Compute'}
                                </Button>
                            </span>
                        </Tooltip>

                        {/* Validate */}
                        <Tooltip title={status !== 'Computed' ? `Requires 'Computed' status` : ''}>
                            <span>
                                <Button variant={status === 'Computed' ? 'contained' : 'outlined'}
                                    startIcon={validating ? <CircularProgress size={15} color="inherit" /> : <CheckCircle />}
                                    onClick={doValidate} disabled={validating || status !== 'Computed'}
                                    sx={status === 'Computed' ? primaryBtnSx : outlinedBtnSx}>
                                    {validating ? 'Validating…' : 'Validate'}
                                </Button>
                            </span>
                        </Tooltip>

                        {/* Mark Paid */}
                        <Tooltip title={status !== 'Validated' ? `Requires 'Validated' status` : ''}>
                            <span>
                                <Button variant={status === 'Validated' ? 'contained' : 'outlined'}
                                    startIcon={markingPaid ? <CircularProgress size={15} color="inherit" /> : <LockOutlined />}
                                    onClick={doMarkPaid} disabled={markingPaid || status !== 'Validated'}
                                    sx={status === 'Validated' ? primaryBtnSx : outlinedBtnSx}>
                                    {markingPaid ? 'Marking…' : 'Mark Paid'}
                                </Button>
                            </span>
                        </Tooltip>

                        {/* Send Payslips */}
                        <Tooltip title={status !== 'Paid' ? 'Available after marking Paid' : ''}>
                            <span>
                                <Button variant={status === 'Paid' ? 'contained' : 'outlined'}
                                    startIcon={sending ? <CircularProgress size={15} color="inherit" /> : <Send />}
                                    onClick={doSendPayslips} disabled={sending || status !== 'Paid'}
                                    sx={status === 'Paid' ? primaryBtnSx : outlinedBtnSx}>
                                    {sending ? 'Sending…' : payrun.payslipsSentAt ? 'Resend Payslips' : 'Send Payslips'}
                                </Button>
                            </span>
                        </Tooltip>

                        <IconButton onClick={loadPayrun} size="small" sx={{ ml: 'auto', color: MUTED }}>
                            <Refresh fontSize="small" />
                        </IconButton>
                    </Stack>

                    {payrun.payslipsSentAt && (
                        <Typography variant="caption" color={MUTED} sx={{ mt: 1.5, display: 'block' }}>
                            <Email sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} />
                            Payslips last sent {fmtDate(payrun.payslipsSentAt)}
                        </Typography>
                    )}
                </Paper>

                {/* ── Warnings panel ── */}
                {allWarnings.length > 0 && (
                    <Paper sx={{ borderRadius: '12px', border: `1px solid ${hasBlocking ? '#FECACA' : '#FED7AA'}`, mb: 3, overflow: 'hidden' }}>
                        <Box
                            onClick={() => setWarningsOpen(o => !o)}
                            sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                px: 2.5, py: 1.5, cursor: 'pointer',
                                bgcolor: hasBlocking ? '#FFF5F5' : '#FFFBF5',
                            }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <WarningAmber sx={{ fontSize: 18, color: hasBlocking ? RED : '#C2410C' }} />
                                <Typography variant="body2" fontWeight={700} color={TEXT}>
                                    {allWarnings.length} Warning{allWarnings.length !== 1 ? 's' : ''}
                                </Typography>
                                {hasBlocking && (
                                    <Chip label="BLOCKING" size="small"
                                        sx={{ fontSize: '0.65rem', height: 18, bgcolor: '#FEE2E2', color: '#991b1b', border: '1px solid #FECACA', fontWeight: 700 }} />
                                )}
                            </Box>
                            {warningsOpen ? <ExpandLess sx={{ color: MUTED }} /> : <ExpandMore sx={{ color: MUTED }} />}
                        </Box>
                        <Collapse in={warningsOpen}>
                            <Divider />
                            <Box sx={{ p: 2 }}>
                                {allWarnings.map((w, i) => (
                                    <Alert key={i} severity={w.blocking ? 'error' : 'warning'}
                                        sx={{ mb: 0.75, py: 0.5, borderRadius: '8px', fontSize: '0.82rem' }}>
                                        <strong>{w.employeeName}:</strong> {w.message}
                                    </Alert>
                                ))}
                            </Box>
                        </Collapse>
                    </Paper>
                )}

                {/* ── Send results panel ── */}
                {sendResults && sendResults.length > 0 && (
                    <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, mb: 3, p: 2.5 }}>
                        <Typography variant="body2" fontWeight={700} color={TEXT} sx={{ mb: 1.5 }}>Email Send Results</Typography>
                        {sendResults.map((r, i) => (
                            <Alert key={i} severity={r.success ? 'success' : 'error'}
                                sx={{ mb: 0.75, py: 0.25, borderRadius: '8px', fontSize: '0.82rem' }}>
                                <strong>{r.employeeName || r.employeeId}:</strong>{' '}
                                {r.success ? `Sent to ${r.email}` : r.error}
                            </Alert>
                        ))}
                    </Paper>
                )}

                {/* ── Payslip table ── */}
                <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <Box sx={{ px: 2.5, py: 1.75, bgcolor: '#F9FAFB', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={700} color={TEXT}>Payslips</Typography>
                        <Chip label={payrun.payslips?.length || 0} size="small"
                            sx={{ fontSize: '0.7rem', bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }} />
                    </Box>

                    {(!payrun.payslips || payrun.payslips.length === 0) ? (
                        <Box sx={{ p: 5, textAlign: 'center', color: MUTED }}>
                            <Typography variant="body2">No payslips yet. Click <strong>Compute</strong> to generate them.</Typography>
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                        {['Employee', 'Dept', 'Days', 'Basic', 'Gross', 'Deductions', 'Net Pay', 'Status', ''].map(h => (
                                            <TableCell key={h} sx={{ fontWeight: 700, color: TEXT, fontSize: '0.78rem', py: 1.25 }}>{h}</TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {payrun.payslips.map(ps => {
                                        const hasWarn  = (ps.warnings || []).length > 0;
                                        const hasBlock = (ps.warnings || []).some(w => w.blocking);
                                        return (
                                            <TableRow key={ps._id} hover
                                                sx={{
                                                    '&:last-child td': { borderBottom: 0 },
                                                    ...(hasBlock && { bgcolor: '#FFF5F5' }),
                                                    ...(!hasBlock && hasWarn && { bgcolor: '#FFFBF5' }),
                                                }}>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight={600} color={TEXT}>{ps.employee?.fullName || '—'}</Typography>
                                                    <Typography variant="caption" color={MUTED}>{ps.employee?.employeeCode || ps.employee?.email || ''}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem', color: TEXT }}>{ps.employee?.department || '—'}</TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem', color: TEXT }}>{ps.workedDays ?? '—'}</TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem', color: TEXT }}>{fmtCurrency(ps.basicTotal)}</TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem', color: TEXT }}>{fmtCurrency(ps.grossTotal)}</TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem', color: '#991b1b' }}>{fmtCurrency(ps.deductionsTotal)}</TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534' }}>{fmtCurrency(ps.netTotal)}</TableCell>
                                                <TableCell>
                                                    <Stack direction="row" alignItems="center" spacing={0.5}>
                                                        <StatusChip status={ps.status} />
                                                        {hasWarn && (
                                                            <Tooltip title={`${(ps.warnings || []).length} warning(s)`}>
                                                                <WarningAmber sx={{ fontSize: 14, color: hasBlock ? RED : '#C2410C' }} />
                                                            </Tooltip>
                                                        )}
                                                        {ps.emailedAt && (
                                                            <Tooltip title={`Emailed ${fmtDate(ps.emailedAt)}`}>
                                                                <Email sx={{ fontSize: 14, color: '#166534' }} />
                                                            </Tooltip>
                                                        )}
                                                    </Stack>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Tooltip title="Print payslip PDF">
                                                        <span>
                                                            <IconButton size="small" onClick={() => printPayslip(ps._id)} disabled={ps.status === 'Draft'}>
                                                                <PictureAsPdf fontSize="small" sx={{ color: ps.status === 'Draft' ? MUTED : RED }} />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* Summary totals */}
                    {payrun.payslips?.length > 0 && (
                        <>
                            <Divider />
                            <Box sx={{ px: 2.5, py: 1.5, display: 'flex', gap: 4, justifyContent: 'flex-end', bgcolor: '#F9FAFB' }}>
                                {[['Gross', totals.gross], ['Deductions', totals.deductions], ['Net Pay', totals.net]].map(([label, val]) => (
                                    <Box key={label} sx={{ textAlign: 'right' }}>
                                        <Typography variant="caption" color={MUTED} display="block">{label}</Typography>
                                        <Typography variant="body2" fontWeight={700} color={label === 'Net Pay' ? '#166534' : TEXT}>
                                            {fmtCurrency(val)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </>
                    )}
                </Paper>
            </Box>
        </Box>
    );
};

export default PayrunProcessingPage;
