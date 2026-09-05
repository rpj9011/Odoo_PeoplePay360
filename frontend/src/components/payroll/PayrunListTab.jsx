// frontend/src/components/payroll/PayrunListTab.jsx
// Payrun list rendered inside the "Payruns" tab — matches app design system.

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Button, Chip, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TablePagination, Paper,
    Typography, IconButton, Stack, Tooltip,
} from '@mui/material';
import { OpenInNew, Refresh } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axios';

// ── Design tokens (matches ContractsPage / TimeOffTypesListPage) ──────────────
const TEXT   = '#1A1A1A';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';

// ── Status chip styles ────────────────────────────────────────────────────────
const STATUS_SX = {
    Draft:     { bgcolor: '#F9FAFB', color: MUTED,     border: `1px solid ${BORDER}` },
    Computed:  { bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' },
    Validated: { bgcolor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' },
    Paid:      { bgcolor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
    Cancelled: { bgcolor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
};

const StatusChip = ({ status }) => (
    <Chip
        label={status}
        size="small"
        sx={{ fontWeight: 600, fontSize: '0.72rem', ...(STATUS_SX[status] || {}) }}
    />
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(n) {
    if (n == null) return '—';
    return `₹${Number(n).toLocaleString('en-IN')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────
const PayrunListTab = ({ refreshTrigger }) => {
    const navigate = useNavigate();
    const [rows,    setRows]    = useState([]);
    const [total,   setTotal]   = useState(0);
    const [page,    setPage]    = useState(0);
    const [rowsPerPage]         = useState(10);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    const load = useCallback(() => {
        setLoading(true);
        setError('');
        axios
            .get('/payroll/payruns', { params: { page: page + 1, limit: rowsPerPage } })
            .then(r => { setRows(r.data?.data || []); setTotal(r.data?.totalCount || 0); })
            .catch(err => setError(err.response?.data?.error || 'Failed to load payruns.'))
            .finally(() => setLoading(false));
    }, [page, rowsPerPage]);

    useEffect(() => { load(); }, [load, refreshTrigger]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={28} />
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ borderRadius: '8px' }}
                action={<Button size="small" onClick={load} startIcon={<Refresh />}>Retry</Button>}>
                {error}
            </Alert>
        );
    }

    if (rows.length === 0) {
        return (
            <Box sx={{ py: 8, textAlign: 'center', color: MUTED }}>
                <Typography variant="body1" fontWeight={500}>No payruns yet</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Click <strong>New Payrun</strong> above to create your first payroll run.
                </Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                {['Name', 'Structure', 'Period', 'Employees', 'Payslips', 'Status', 'Created', ''].map(h => (
                                    <TableCell key={h} sx={{ fontWeight: 700, color: TEXT, fontSize: '0.8rem', py: 1.5 }}>
                                        {h}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map(run => (
                                <TableRow key={run._id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={600} color={TEXT}>
                                            {run.name}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" color={TEXT}>
                                            {run.salaryStructure?.name || '—'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.82rem', color: TEXT, whiteSpace: 'nowrap' }}>
                                        {fmtDate(run.periodStart)} → {fmtDate(run.periodEnd)}
                                    </TableCell>
                                    <TableCell align="center" sx={{ color: TEXT, fontSize: '0.82rem' }}>
                                        {run.employees?.length ?? 0}
                                    </TableCell>
                                    <TableCell align="center" sx={{ color: TEXT, fontSize: '0.82rem' }}>
                                        {run.payslipCount ?? 0}
                                    </TableCell>
                                    <TableCell>
                                        <StatusChip status={run.status} />
                                    </TableCell>
                                    <TableCell sx={{ color: MUTED, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                                        {fmtDate(run.createdAt)}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Tooltip title="Open payrun">
                                            <IconButton
                                                size="small"
                                                onClick={() => navigate(`/payroll/payruns/${run._id}`)}
                                            >
                                                <OpenInNew fontSize="small" sx={{ color: MUTED }} />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    component="div"
                    count={total}
                    page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    rowsPerPageOptions={[10]}
                />
            </Paper>
        </Box>
    );
};

export default PayrunListTab;
