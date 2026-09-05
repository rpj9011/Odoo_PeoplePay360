// frontend/src/pages/AllocationsListPage.jsx
// Admin/HRManager: list, create, confirm and refuse Allocation records.
// Supports ?employee=<id> URL param (used by the employee profile smart button).
// Reuses AdminLeavesPage's MUI Table/Dialog/Chip conventions.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
    Snackbar, Alert, Stack, CircularProgress, TablePagination,
    Avatar, OutlinedInput, InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import PageHeroHeader from '../components/PageHeroHeader';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

// ── Style tokens ──────────────────────────────────────────────────────────────
const RED = '#E53935';
const TEXT = '#1A1A1A';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const SURFACE = '#F8F9FB';

const textFieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px',
        backgroundColor: '#fff',
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: RED },
};

const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, #C62828 100%)`,
    textTransform: 'none',
    fontWeight: 600,
    borderRadius: '8px',
    boxShadow: 'none',
    px: 3,
    '&:hover': { background: `linear-gradient(135deg, #C62828 0%, #B71C1C 100%)`, boxShadow: 'none' },
};

// ── Status chip ───────────────────────────────────────────────────────────────
const STATUS_STYLE = {
    Draft:     { bgcolor: '#F9FAFB', color: MUTED,      border: `1px solid ${BORDER}` },
    Confirmed: { bgcolor: '#f0fdf4', color: '#166534',  border: '1px solid #bbf7d0' },
    Refused:   { bgcolor: '#fef2f2', color: '#991b1b',  border: '1px solid #fecaca' },
};
const StatusChip = ({ status }) => (
    <Chip label={status} size="small"
        sx={{ fontWeight: 600, fontSize: '0.72rem', ...STATUS_STYLE[status] }} />
);

// ── Allocation Form Dialog ────────────────────────────────────────────────────
const AllocationFormDialog = ({ open, onClose, onSaved, editing, employees, timeOffTypes }) => {
    const EMPTY = { employee: '', timeOffType: '', allocatedAmount: '', validFrom: '', validTo: '', notes: '' };
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(editing ? {
                employee: editing.employee?._id || '',
                timeOffType: editing.timeOffType?._id || '',
                allocatedAmount: editing.allocatedAmount ?? '',
                validFrom: editing.validFrom ? editing.validFrom.slice(0, 10) : '',
                validTo: editing.validTo ? editing.validTo.slice(0, 10) : '',
                notes: editing.notes || '',
            } : EMPTY);
            setError('');
        }
    }, [open, editing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (!form.employee) { setError('Employee is required.'); return; }
        if (!form.timeOffType) { setError('Time Off Type is required.'); return; }
        if (form.allocatedAmount === '' || isNaN(Number(form.allocatedAmount)) || Number(form.allocatedAmount) < 0) {
            setError('Allocated amount must be a non-negative number.'); return;
        }
        setSaving(true);
        setError('');
        try {
            const payload = {
                employee: form.employee,
                timeOffType: form.timeOffType,
                allocatedAmount: Number(form.allocatedAmount),
                validFrom: form.validFrom || null,
                validTo: form.validTo || null,
                notes: form.notes,
            };
            if (editing) {
                await api.put(`/allocations/${editing._id}`, payload);
            } else {
                await api.post('/allocations', payload);
            }
            onSaved();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save allocation.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
            PaperProps={{ sx: { borderRadius: '16px', borderTop: `3px solid ${RED}` } }}>
            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700} color={TEXT}>
                    {editing ? 'Edit Allocation' : 'New Allocation'}
                </Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: MUTED }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {error && <Alert severity="error" sx={{ borderRadius: '8px' }}>{error}</Alert>}

                <TextField label="Employee" name="employee" value={form.employee}
                    onChange={handleChange} select fullWidth sx={textFieldSx} required>
                    {employees.map(emp => (
                        <MenuItem key={emp._id} value={emp._id}>
                            {emp.fullName}{emp.employeeCode ? ` (${emp.employeeCode})` : ''}
                        </MenuItem>
                    ))}
                </TextField>

                <TextField label="Time Off Type" name="timeOffType" value={form.timeOffType}
                    onChange={handleChange} select fullWidth sx={textFieldSx} required>
                    {timeOffTypes.map(t => (
                        <MenuItem key={t._id} value={t._id}>{t.name}</MenuItem>
                    ))}
                </TextField>

                <TextField label="Allocated Amount" name="allocatedAmount"
                    value={form.allocatedAmount} onChange={handleChange}
                    type="number" inputProps={{ min: 0, step: 0.5 }} fullWidth sx={textFieldSx}
                    helperText="Days or hours depending on the type's unit." required />

                <Stack direction="row" spacing={2}>
                    <TextField label="Valid From" name="validFrom" value={form.validFrom}
                        onChange={handleChange} type="date" fullWidth sx={textFieldSx}
                        InputLabelProps={{ shrink: true }} />
                    <TextField label="Valid To" name="validTo" value={form.validTo}
                        onChange={handleChange} type="date" fullWidth sx={textFieldSx}
                        InputLabelProps={{ shrink: true }} />
                </Stack>

                <TextField label="Notes" name="notes" value={form.notes}
                    onChange={handleChange} fullWidth multiline rows={2} sx={textFieldSx} />
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, gap: 1, borderTop: `1px solid ${BORDER}` }}>
                <Button onClick={onClose} variant="outlined"
                    sx={{ textTransform: 'none', borderColor: BORDER, color: MUTED }}>
                    Cancel
                </Button>
                <Button onClick={handleSave} variant="contained" disabled={saving} sx={primaryBtnSx}>
                    {saving ? <CircularProgress size={18} color="inherit" /> : (editing ? 'Save Changes' : 'Create')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// ── Confirm / Refuse inline action dialogs ────────────────────────────────────
const ActionDialog = ({ open, action, allocation, onClose, onDone }) => {
    const [notes, setNotes] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { if (open) { setNotes(''); setError(''); } }, [open]);

    const isRefuse = action === 'refuse';

    const handleSubmit = async () => {
        setProcessing(true);
        setError('');
        try {
            await api.post(`/allocations/${allocation._id}/${action}`, { notes });
            onDone(`Allocation ${isRefuse ? 'refused' : 'confirmed'} successfully.`);
        } catch (err) {
            setError(err.response?.data?.error || `Failed to ${action} allocation.`);
            setProcessing(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: '12px' } }}>
            <DialogTitle sx={{ fontWeight: 700, color: TEXT }}>
                {isRefuse ? 'Refuse Allocation' : 'Confirm Allocation'}
            </DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{error}</Alert>}
                <Typography variant="body2" sx={{ color: MUTED, mb: 2 }}>
                    {isRefuse
                        ? `This will refuse the allocation for ${allocation?.employee?.fullName}.`
                        : `This will confirm and grant ${allocation?.allocatedAmount} ${allocation?.timeOffType?.unit ?? 'days'} of "${allocation?.timeOffType?.name}" to ${allocation?.employee?.fullName}.`
                    }
                </Typography>
                {isRefuse && (
                    <TextField label="Reason (optional)" value={notes} onChange={e => setNotes(e.target.value)}
                        fullWidth multiline rows={2} sx={textFieldSx} />
                )}
            </DialogContent>
            <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
                <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={processing}
                    color={isRefuse ? 'error' : 'success'}
                    sx={{ textTransform: 'none', fontWeight: 600 }}>
                    {processing
                        ? <CircularProgress size={16} color="inherit" />
                        : isRefuse ? 'Refuse' : 'Confirm'
                    }
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const AllocationsListPage = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    const [allocations, setAllocations] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [loading, setLoading] = useState(true);

    // Reference data for the form dropdowns
    const [employees, setEmployees] = useState([]);
    const [timeOffTypes, setTimeOffTypes] = useState([]);

    // Filters
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Dialogs
    const [formDialog, setFormDialog] = useState({ open: false, editing: null });
    const [actionDialog, setActionDialog] = useState({ open: false, action: '', allocation: null });
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const canEdit = ['Admin', 'HRManager', 'HRPayrollUser', 'HRPayrollManager'].includes(user?.role);
    const canActOnDraft = ['Admin', 'HRManager'].includes(user?.role);

    // Pre-filter from URL param ?employee=<id> (set by employee profile smart button)
    const employeeIdParam = searchParams.get('employee');

    const fetchAllocations = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', page + 1);
            params.set('limit', rowsPerPage);
            if (employeeIdParam) params.set('employee', employeeIdParam);
            if (statusFilter) params.set('status', statusFilter);
            const { data } = await api.get(`/allocations?${params.toString()}`);
            setAllocations(Array.isArray(data.allocations) ? data.allocations : []);
            setTotalCount(data.totalCount ?? 0);
        } catch {
            setSnackbar({ open: true, message: 'Failed to load allocations.', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, employeeIdParam, statusFilter]);

    const fetchRefData = useCallback(async () => {
        try {
            const [empsRes, typesRes] = await Promise.all([
                api.get('/admin/employees?all=true&slim=true'),
                api.get('/time-off-types?activeOnly=true'),
            ]);
            const emps = Array.isArray(empsRes.data) ? empsRes.data : (empsRes.data?.employees || []);
            setEmployees(emps.sort((a, b) => a.fullName.localeCompare(b.fullName)));
            setTimeOffTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
        } catch {
            // non-fatal: forms will just have empty dropdowns
        }
    }, []);

    useEffect(() => { fetchAllocations(); }, [fetchAllocations]);
    useEffect(() => { fetchRefData(); }, [fetchRefData]);

    // Client-side name search (complements server-side employee filter)
    const visibleAllocations = useMemo(() => {
        if (!searchQuery.trim()) return allocations;
        const q = searchQuery.trim().toLowerCase();
        return allocations.filter(a =>
            a.employee?.fullName?.toLowerCase().includes(q) ||
            a.employee?.employeeCode?.toLowerCase().includes(q) ||
            a.timeOffType?.name?.toLowerCase().includes(q)
        );
    }, [allocations, searchQuery]);

    const handleSaved = () => {
        setFormDialog({ open: false, editing: null });
        setSnackbar({ open: true, message: 'Allocation saved.', severity: 'success' });
        fetchAllocations();
    };

    const handleActionDone = (msg) => {
        setActionDialog({ open: false, action: '', allocation: null });
        setSnackbar({ open: true, message: msg, severity: 'success' });
        fetchAllocations();
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: SURFACE }}>
            <PageHeroHeader
                eyebrow="Time Off"
                title="Allocations"
                description="Create and manage employee time-off allocations. Confirm a Draft to grant the entitlement."
                actionArea={
                    canEdit && (
                        <Button variant="contained" startIcon={<AddIcon />} sx={primaryBtnSx}
                            onClick={() => setFormDialog({ open: true, editing: null })}>
                            New Allocation
                        </Button>
                    )
                }
            />

            {/* ── Filters ── */}
            <Box sx={{ px: { xs: 2, md: 4 }, pt: 2, pb: 1 }}>
                <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
                    <OutlinedInput
                        size="small"
                        placeholder="Search employee or type…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        startAdornment={<InputAdornment position="start"><SearchIcon sx={{ color: MUTED, fontSize: '1.1rem' }} /></InputAdornment>}
                        endAdornment={searchQuery && (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setSearchQuery('')}>
                                    <ClearIcon sx={{ fontSize: '0.9rem' }} />
                                </IconButton>
                            </InputAdornment>
                        )}
                        sx={{ bgcolor: '#fff', borderRadius: '8px', minWidth: 260,
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED, borderWidth: 2 } }}
                    />
                    <TextField select size="small" value={statusFilter}
                        onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
                        sx={{ bgcolor: '#fff', borderRadius: '8px', minWidth: 150, ...textFieldSx }}
                        SelectProps={{ displayEmpty: true }}>
                        <MenuItem value=""><em>All Statuses</em></MenuItem>
                        <MenuItem value="Draft">Draft</MenuItem>
                        <MenuItem value="Confirmed">Confirmed</MenuItem>
                        <MenuItem value="Refused">Refused</MenuItem>
                    </TextField>
                </Stack>
            </Box>

            {/* ── Table ── */}
            <Box sx={{ px: { xs: 2, md: 4 }, py: 1 }}>
                <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                    {['Employee', 'Time Off Type', 'Allocated', 'Taken', 'Remaining', 'Valid From', 'Valid To', 'Status', 'Actions'].map(h => (
                                        <TableCell key={h} sx={{ fontWeight: 700, color: TEXT, fontSize: '0.8rem', py: 1.5 }}>
                                            {h}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                                            <CircularProgress size={24} sx={{ color: RED }} />
                                        </TableCell>
                                    </TableRow>
                                ) : visibleAllocations.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center" sx={{ py: 5, color: MUTED }}>
                                            No allocations found.
                                        </TableCell>
                                    </TableRow>
                                ) : visibleAllocations.map(alloc => {
                                    const remaining = Math.max(0, (alloc.allocatedAmount ?? 0) - (alloc.takenAmount ?? 0));
                                    const unit = alloc.timeOffType?.unit ?? 'Days';
                                    return (
                                        <TableRow key={alloc._id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                            {/* Employee */}
                                            <TableCell>
                                                <Stack direction="row" alignItems="center" spacing={1}>
                                                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.7rem', fontWeight: 700,
                                                        bgcolor: '#FDECEC', color: RED }}>
                                                        {getInitials(alloc.employee?.fullName)}
                                                    </Avatar>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={600} color={TEXT} noWrap>
                                                            {alloc.employee?.fullName ?? '—'}
                                                        </Typography>
                                                        <Typography variant="caption" color={MUTED}>
                                                            {alloc.employee?.employeeCode ?? ''}
                                                        </Typography>
                                                    </Box>
                                                </Stack>
                                            </TableCell>

                                            {/* Time Off Type */}
                                            <TableCell>
                                                <Chip label={alloc.timeOffType?.name ?? '—'} size="small"
                                                    sx={{ fontWeight: 600, fontSize: '0.72rem', bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }} />
                                            </TableCell>

                                            {/* Allocated / Taken / Remaining */}
                                            <TableCell sx={{ fontWeight: 600, color: TEXT }}>
                                                {alloc.allocatedAmount} <Typography component="span" variant="caption" color={MUTED}>{unit}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ color: MUTED }}>
                                                {alloc.takenAmount ?? 0} <Typography component="span" variant="caption" color={MUTED}>{unit}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography fontWeight={600}
                                                    sx={{ color: remaining > 0 ? '#166534' : '#991b1b' }}>
                                                    {remaining} <Typography component="span" variant="caption" color={MUTED}>{unit}</Typography>
                                                </Typography>
                                            </TableCell>

                                            {/* Validity */}
                                            <TableCell sx={{ color: MUTED, fontSize: '0.8rem' }}>{formatDate(alloc.validFrom)}</TableCell>
                                            <TableCell sx={{ color: MUTED, fontSize: '0.8rem' }}>{formatDate(alloc.validTo)}</TableCell>

                                            {/* Status */}
                                            <TableCell><StatusChip status={alloc.status} /></TableCell>

                                            {/* Actions */}
                                            <TableCell>
                                                <Stack direction="row" spacing={0.5}>
                                                    {canEdit && alloc.status === 'Draft' && (
                                                        <Tooltip title="Edit">
                                                            <IconButton size="small"
                                                                onClick={() => setFormDialog({ open: true, editing: alloc })}>
                                                                <EditOutlinedIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {canActOnDraft && alloc.status === 'Draft' && (
                                                        <>
                                                            <Tooltip title="Confirm (grant entitlement)">
                                                                <IconButton size="small" color="success"
                                                                    onClick={() => setActionDialog({ open: true, action: 'confirm', allocation: alloc })}>
                                                                    <CheckCircleOutlineIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Refuse">
                                                                <IconButton size="small" color="error"
                                                                    onClick={() => setActionDialog({ open: true, action: 'refuse', allocation: alloc })}>
                                                                    <HighlightOffIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    <TablePagination
                        rowsPerPageOptions={[10, 15, 25, 50]}
                        component="div"
                        count={totalCount}
                        rowsPerPage={rowsPerPage}
                        page={page}
                        onPageChange={(_, p) => setPage(p)}
                        onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                    />
                </Paper>
            </Box>

            {/* ── Dialogs ── */}
            <AllocationFormDialog
                open={formDialog.open}
                editing={formDialog.editing}
                onClose={() => setFormDialog({ open: false, editing: null })}
                onSaved={handleSaved}
                employees={employees}
                timeOffTypes={timeOffTypes}
            />

            <ActionDialog
                open={actionDialog.open}
                action={actionDialog.action}
                allocation={actionDialog.allocation}
                onClose={() => setActionDialog({ open: false, action: '', allocation: null })}
                onDone={handleActionDone}
            />

            <Snackbar open={snackbar.open} autoHideDuration={4000}
                onClose={() => setSnackbar(p => ({ ...p, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert onClose={() => setSnackbar(p => ({ ...p, open: false }))}
                    severity={snackbar.severity} variant="filled"
                    sx={{ width: '100%', borderRadius: '12px' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default AllocationsListPage;
