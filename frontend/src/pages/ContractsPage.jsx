// frontend/src/pages/ContractsPage.jsx
// Paginated list of Contract documents.
// Spec requirements satisfied:
//   ✓ Columns: Employee, Contract #, Start, End, Wage/Month, Status, Dept, Job Position, Actions
//   ✓ Running contracts are visually highlighted (bold + green left border on row)
//   ✓ Supports ?employee=<id> URL param (from employee profile smart button)
//   ✓ ?status= filter
//   ✓ Server-side pagination matching EmployeesPage pattern

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, Snackbar, Alert, Stack,
    TablePagination, TextField, MenuItem, InputAdornment, OutlinedInput,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import PageHeroHeader from '../components/PageHeroHeader';
import ContractForm from '../components/ContractForm';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

// ── Style tokens ──────────────────────────────────────────────────────────────
const RED    = '#E53935';
const TEXT   = '#1A1A1A';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';
const SURFACE = '#F8F9FB';

const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, #C62828 100%)`,
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '8px',
    boxShadow: 'none',
    '&:hover': { background: `linear-gradient(135deg, #C62828 0%, #B71C1C 100%)`, boxShadow: 'none' },
};

// ── Status chip ───────────────────────────────────────────────────────────────
const STATUS_STYLE = {
    Draft:     { bgcolor: '#F9FAFB', color: MUTED,     border: `1px solid ${BORDER}` },
    Running:   { bgcolor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' },
    Expired:   { bgcolor: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' },
    Cancelled: { bgcolor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' },
};

const StatusChip = ({ status }) => (
    <Chip
        label={status}
        size="small"
        sx={{ fontWeight: 600, fontSize: '0.72rem', ...(STATUS_STYLE[status] || {}) }}
    />
);

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtDate = (d) => {
    if (!d) return <em style={{ color: MUTED }}>Open</em>;
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtWage = (n) =>
    n != null
        ? `₹${Number(n).toLocaleString('en-IN')}`
        : '—';

// ── Main Page ─────────────────────────────────────────────────────────────────
const ContractsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [contracts,   setContracts]   = useState([]);
    const [totalCount,  setTotalCount]  = useState(0);
    const [page,        setPage]        = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [loading,     setLoading]     = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('');

    // Dialogs
    const [formDialog,   setFormDialog]   = useState({ open: false, editing: null });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, contract: null, deleting: false });
    const [snackbar,     setSnackbar]     = useState({ open: false, message: '', severity: 'success' });

    // Pre-filter from URL param ?employee=<id> (set by employee profile smart button)
    const employeeIdParam = searchParams.get('employee');

    // Pre-selected employee object for the form (resolved lazily)
    const [preselectedEmployee, setPreselectedEmployee] = useState(null);

    const canEdit = ['Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'].includes(user?.role);

    // ── Resolve pre-selected employee name for display ───────────────────────
    useEffect(() => {
        if (!employeeIdParam) { setPreselectedEmployee(null); return; }
        api.get(`/admin/employees/${employeeIdParam}`)
            .then(({ data }) => setPreselectedEmployee(data))
            .catch(() => setPreselectedEmployee(null));
    }, [employeeIdParam]);

    // ── Fetch ────────────────────────────────────────────────────────────────
    const fetchContracts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page',  page + 1);
            params.set('limit', rowsPerPage);
            if (employeeIdParam) params.set('employee', employeeIdParam);
            if (statusFilter)    params.set('status',   statusFilter);

            const { data } = await api.get(`/admin/contracts?${params.toString()}`);
            setContracts(Array.isArray(data.contracts) ? data.contracts : []);
            setTotalCount(data.totalCount ?? 0);
        } catch {
            setSnackbar({ open: true, message: 'Failed to load contracts.', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, employeeIdParam, statusFilter]);

    useEffect(() => { fetchContracts(); }, [fetchContracts]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleSaved = () => {
        setFormDialog({ open: false, editing: null });
        setSnackbar({ open: true, message: 'Contract saved successfully.', severity: 'success' });
        fetchContracts();
    };

    const confirmDelete = async () => {
        const c = deleteDialog.contract;
        if (!c) return;
        setDeleteDialog(d => ({ ...d, deleting: true }));
        try {
            await api.delete(`/admin/contracts/${c._id}`);
            setSnackbar({ open: true, message: 'Contract deleted.', severity: 'success' });
            setDeleteDialog({ open: false, contract: null, deleting: false });
            fetchContracts();
        } catch (err) {
            setSnackbar({
                open: true,
                message: err.response?.data?.error || 'Failed to delete contract.',
                severity: 'error',
            });
            setDeleteDialog(d => ({ ...d, deleting: false }));
        }
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: SURFACE }}>
            <PageHeroHeader
                eyebrow="HR Management"
                title={
                    preselectedEmployee
                        ? `Contracts — ${preselectedEmployee.fullName}`
                        : 'Contracts'
                }
                description={
                    preselectedEmployee
                        ? `Showing contracts for ${preselectedEmployee.fullName} (${preselectedEmployee.employeeCode || ''}).`
                        : 'Create and manage employee contracts.'
                }
                actionArea={
                    canEdit && (
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            sx={primaryBtnSx}
                            onClick={() => setFormDialog({ open: true, editing: null })}
                        >
                            New Contract
                        </Button>
                    )
                }
            />

            <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
                {/* ── Filters ── */}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                    <TextField
                        select
                        label="Status"
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                        size="small"
                        sx={{ minWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: '8px', bgcolor: '#fff' } }}
                    >
                        <MenuItem value=""><em>All statuses</em></MenuItem>
                        {['Draft', 'Running', 'Expired', 'Cancelled'].map(s => (
                            <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                    </TextField>

                    {/* Clear pre-filter button */}
                    {employeeIdParam && (
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={() => navigate('/contracts')}
                            sx={{ textTransform: 'none', borderRadius: '8px', alignSelf: 'center' }}
                        >
                            Clear employee filter
                        </Button>
                    )}
                </Stack>

                {/* ── Table ── */}
                <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                    {[
                                        'Contract #', 'Employee', 'Department',
                                        'Job Position', 'Start Date', 'End Date',
                                        'Wage / Month', 'Status', 'Actions',
                                    ].map(h => (
                                        <TableCell
                                            key={h}
                                            sx={{ fontWeight: 700, color: TEXT, fontSize: '0.8rem', py: 1.5 }}
                                        >
                                            {h}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>

                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 4, color: MUTED }}>
                                            Loading…
                                        </TableCell>
                                    </TableRow>
                                ) : contracts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 4, color: MUTED }}>
                                            No contracts found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    contracts.map(c => {
                                        const isRunning = c.status === 'Running';
                                        return (
                                            <TableRow
                                                key={c._id}
                                                hover
                                                sx={{
                                                    // Spec: visually highlight Running contracts
                                                    ...(isRunning && {
                                                        borderLeft: '3px solid #22c55e',
                                                        '& td:first-of-type': { fontWeight: 700 },
                                                        bgcolor: '#fafffe',
                                                    }),
                                                }}
                                            >
                                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: MUTED }}>
                                                    {c.contractNumber || '—'}
                                                </TableCell>
                                                <TableCell>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={isRunning ? 700 : 400} color={TEXT}>
                                                            {c.employee?.fullName || '—'}
                                                        </Typography>
                                                        {c.employee?.employeeCode && (
                                                            <Typography variant="caption" color={MUTED}>
                                                                {c.employee.employeeCode}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                                <TableCell sx={{ color: TEXT, fontSize: '0.82rem' }}>
                                                    {c.department || '—'}
                                                </TableCell>
                                                <TableCell sx={{ color: TEXT, fontSize: '0.82rem' }}>
                                                    {c.jobPosition || '—'}
                                                </TableCell>
                                                <TableCell sx={{ color: TEXT, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                                    {fmtDate(c.startDate)}
                                                </TableCell>
                                                <TableCell sx={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                                    {fmtDate(c.endDate)}
                                                </TableCell>
                                                <TableCell sx={{ color: TEXT, fontWeight: isRunning ? 600 : 400, fontSize: '0.82rem' }}>
                                                    {fmtWage(c.wagePerMonth)}
                                                </TableCell>
                                                <TableCell>
                                                    <StatusChip status={c.status} />
                                                </TableCell>
                                                <TableCell>
                                                    {canEdit && (
                                                        <Stack direction="row" spacing={0.5}>
                                                            <Tooltip title="Edit contract">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => setFormDialog({ open: true, editing: c })}
                                                                >
                                                                    <EditOutlinedIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Delete contract">
                                                                <IconButton
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={() => setDeleteDialog({ open: true, contract: c, deleting: false })}
                                                                >
                                                                    <DeleteOutlineIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Stack>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <TablePagination
                        rowsPerPageOptions={[10, 15, 25, 50]}
                        component="div"
                        count={totalCount}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={(_, newPage) => setPage(newPage)}
                        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                    />
                </Paper>
            </Box>

            {/* ── Contract Form dialog ── */}
            <ContractForm
                open={formDialog.open}
                onClose={() => setFormDialog({ open: false, editing: null })}
                onSaved={handleSaved}
                editing={formDialog.editing}
                preselectedEmployee={!formDialog.editing ? preselectedEmployee : null}
            />

            {/* ── Delete confirmation ── */}
            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, contract: null, deleting: false })}
                maxWidth="xs"
                fullWidth
                PaperProps={{ sx: { borderRadius: '12px' } }}
            >
                <DialogTitle>Delete Contract</DialogTitle>
                <DialogContent>
                    <Typography>
                        Delete contract{' '}
                        <strong>{deleteDialog.contract?.contractNumber}</strong> for{' '}
                        <strong>{deleteDialog.contract?.employee?.fullName}</strong>?
                        This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
                    <Button
                        onClick={() => setDeleteDialog({ open: false, contract: null, deleting: false })}
                        sx={{ textTransform: 'none' }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={confirmDelete}
                        variant="contained"
                        color="error"
                        disabled={deleteDialog.deleting}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                        {deleteDialog.deleting ? 'Deleting…' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── Snackbar ── */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    severity={snackbar.severity}
                    variant="filled"
                    onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                    sx={{ borderRadius: '8px' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ContractsPage;
