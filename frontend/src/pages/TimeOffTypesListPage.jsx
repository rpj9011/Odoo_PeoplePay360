// frontend/src/pages/TimeOffTypesListPage.jsx
// Admin/HRManager: list, create, and edit Time Off Type configuration records.
// Reuses the same MUI table/dialog/chip conventions as AdminLeavesPage.jsx.

import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, MenuItem,
    Snackbar, Alert, Stack, Switch, FormControlLabel, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import PageHeroHeader from '../components/PageHeroHeader';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

// ── Style tokens (mirrors AdminEmployeeProfileDialog / adminEmployeeTheme) ────
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

// ── Default form state ────────────────────────────────────────────────────────
const EMPTY_FORM = {
    name: '',
    unit: 'Days',
    requiresAllocation: true,
    approvalRequired: true,
    includeInPayroll: true,
    legacyRequestTypeMapping: '',
    description: '',
    isActive: true,
};

// Maps each existing LeaveRequest.requestType enum value — shown as helper options
const LEGACY_MAPPING_OPTIONS = [
    'Planned', 'Sick', 'Casual', 'Loss of Pay',
    'Compensatory', 'Backdated Leave', 'Comp-Off', 'YEAR_END',
];

// ── StatusChip helper ─────────────────────────────────────────────────────────
const ActiveChip = ({ active }) => (
    <Chip
        label={active ? 'Active' : 'Inactive'}
        size="small"
        sx={{
            fontWeight: 600,
            fontSize: '0.72rem',
            bgcolor: active ? '#f0fdf4' : '#fef2f2',
            color: active ? '#166534' : '#991b1b',
            border: `1px solid ${active ? '#bbf7d0' : '#fecaca'}`,
        }}
    />
);

// ── Form Dialog ───────────────────────────────────────────────────────────────
const TypeFormDialog = ({ open, onClose, onSaved, editing }) => {
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setForm(editing
                ? {
                    name: editing.name || '',
                    unit: editing.unit || 'Days',
                    requiresAllocation: editing.requiresAllocation !== false,
                    approvalRequired: editing.approvalRequired !== false,
                    includeInPayroll: editing.includeInPayroll !== false,
                    legacyRequestTypeMapping: editing.legacyRequestTypeMapping || '',
                    description: editing.description || '',
                    isActive: editing.isActive !== false,
                }
                : EMPTY_FORM
            );
            setError('');
        }
    }, [open, editing]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSave = async () => {
        if (!form.name.trim()) { setError('Name is required.'); return; }
        setSaving(true);
        setError('');
        try {
            if (editing) {
                await api.put(`/time-off-types/${editing._id}`, form);
            } else {
                await api.post('/time-off-types', form);
            }
            onSaved();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
            PaperProps={{ sx: { borderRadius: '16px', borderTop: `3px solid ${RED}` } }}>
            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700} color={TEXT}>
                    {editing ? 'Edit Time Off Type' : 'New Time Off Type'}
                </Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: MUTED }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {error && <Alert severity="error" sx={{ borderRadius: '8px' }}>{error}</Alert>}

                <TextField label="Name" name="name" value={form.name}
                    onChange={handleChange} fullWidth sx={textFieldSx}
                    placeholder='e.g. "Paid Time Off"' required />

                <TextField label="Unit" name="unit" value={form.unit}
                    onChange={handleChange} select fullWidth sx={textFieldSx}>
                    <MenuItem value="Days">Days</MenuItem>
                    <MenuItem value="Hours">Hours</MenuItem>
                </TextField>

                <TextField
                    label="Legacy Request Type Mapping"
                    name="legacyRequestTypeMapping"
                    value={form.legacyRequestTypeMapping}
                    onChange={handleChange}
                    select fullWidth sx={textFieldSx}
                    helperText="Links this type to the existing LeaveRequest.requestType enum value."
                    SelectProps={{ displayEmpty: true }}
                >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {LEGACY_MAPPING_OPTIONS.map(opt => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                </TextField>

                <TextField label="Description" name="description" value={form.description}
                    onChange={handleChange} fullWidth multiline rows={2} sx={textFieldSx} />

                <Stack direction="row" spacing={2} flexWrap="wrap">
                    <FormControlLabel
                        control={<Switch checked={form.requiresAllocation} name="requiresAllocation"
                            onChange={handleChange} color="error" />}
                        label={<Typography variant="body2" color={TEXT}>Requires Allocation</Typography>}
                    />
                    <FormControlLabel
                        control={<Switch checked={form.approvalRequired} name="approvalRequired"
                            onChange={handleChange} color="error" />}
                        label={<Typography variant="body2" color={TEXT}>Approval Required</Typography>}
                    />
                    <FormControlLabel
                        control={<Switch checked={form.includeInPayroll} name="includeInPayroll"
                            onChange={handleChange} color="error" />}
                        label={<Typography variant="body2" color={TEXT}>Include in Payroll</Typography>}
                    />
                    <FormControlLabel
                        control={<Switch checked={form.isActive} name="isActive"
                            onChange={handleChange} color="error" />}
                        label={<Typography variant="body2" color={TEXT}>Active</Typography>}
                    />
                </Stack>
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

// ── Delete Confirm Dialog ─────────────────────────────────────────────────────
const DeleteDialog = ({ open, item, onClose, onDeleted }) => {
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { if (open) setError(''); }, [open]);

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await api.delete(`/time-off-types/${item._id}`);
            onDeleted();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to delete.');
            setDeleting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: '12px' } }}>
            <DialogTitle>Delete Time Off Type</DialogTitle>
            <DialogContent>
                {error
                    ? <Alert severity="error" sx={{ borderRadius: '8px' }}>{error}</Alert>
                    : <Typography>Are you sure you want to delete <strong>{item?.name}</strong>? This cannot be undone.</Typography>
                }
            </DialogContent>
            <DialogActions sx={{ px: 2, pb: 2, gap: 1 }}>
                <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
                {!error && (
                    <Button onClick={handleDelete} variant="contained" color="error"
                        disabled={deleting} sx={{ textTransform: 'none', fontWeight: 600 }}>
                        {deleting ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const TimeOffTypesListPage = () => {
    const { user } = useAuth();
    const [types, setTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [formDialog, setFormDialog] = useState({ open: false, editing: null });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null });

    const canAdmin = user?.role === 'Admin';
    const canEdit = ['Admin', 'HRManager'].includes(user?.role);

    const fetchTypes = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/time-off-types');
            setTypes(Array.isArray(data) ? data : []);
        } catch (err) {
            setSnackbar({ open: true, message: 'Failed to load time-off types.', severity: 'error' });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTypes(); }, [fetchTypes]);

    const handleSaved = () => {
        setFormDialog({ open: false, editing: null });
        setSnackbar({ open: true, message: 'Time-off type saved successfully.', severity: 'success' });
        fetchTypes();
    };

    const handleDeleted = () => {
        setDeleteDialog({ open: false, item: null });
        setSnackbar({ open: true, message: 'Time-off type deleted.', severity: 'success' });
        fetchTypes();
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: SURFACE }}>
            <PageHeroHeader
                eyebrow="Configuration"
                title="Time Off Types"
                description="Define and manage the types of time off available to employees."
                actionArea={
                    canEdit && (
                        <Button variant="contained" startIcon={<AddIcon />} sx={primaryBtnSx}
                            onClick={() => setFormDialog({ open: true, editing: null })}>
                            New Type
                        </Button>
                    )
                }
            />

            <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
                <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                    {['Name', 'Unit', 'Legacy Mapping', 'Requires Allocation', 'Approval Required', 'In Payroll', 'Status', 'Actions'].map(h => (
                                        <TableCell key={h} sx={{ fontWeight: 700, color: TEXT, fontSize: '0.8rem', py: 1.5 }}>
                                            {h}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                                            <CircularProgress size={24} sx={{ color: RED }} />
                                        </TableCell>
                                    </TableRow>
                                ) : types.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 5, color: MUTED }}>
                                            No time-off types yet. Create one to get started.
                                        </TableCell>
                                    </TableRow>
                                ) : types.map(type => (
                                    <TableRow key={type._id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                        <TableCell sx={{ fontWeight: 600, color: TEXT }}>{type.name}</TableCell>
                                        <TableCell>
                                            <Chip label={type.unit} size="small"
                                                sx={{ fontWeight: 600, fontSize: '0.72rem', bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }} />
                                        </TableCell>
                                        <TableCell sx={{ color: MUTED, fontSize: '0.8rem' }}>
                                            {type.legacyRequestTypeMapping || <em style={{ color: '#CBD5E1' }}>—</em>}
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={type.requiresAllocation ? 'Yes' : 'No'} size="small"
                                                sx={{ fontWeight: 600, fontSize: '0.72rem',
                                                    bgcolor: type.requiresAllocation ? '#FFF7ED' : '#F9FAFB',
                                                    color: type.requiresAllocation ? '#C2410C' : MUTED,
                                                    border: `1px solid ${type.requiresAllocation ? '#FED7AA' : BORDER}` }} />
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={type.approvalRequired ? 'Yes' : 'No'} size="small"
                                                sx={{ fontWeight: 600, fontSize: '0.72rem', bgcolor: '#F9FAFB', color: MUTED, border: `1px solid ${BORDER}` }} />
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={type.includeInPayroll ? 'Yes' : 'No'} size="small"
                                                sx={{ fontWeight: 600, fontSize: '0.72rem', bgcolor: '#F9FAFB', color: MUTED, border: `1px solid ${BORDER}` }} />
                                        </TableCell>
                                        <TableCell><ActiveChip active={type.isActive} /></TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5}>
                                                {canEdit && (
                                                    <Tooltip title="Edit">
                                                        <IconButton size="small"
                                                            onClick={() => setFormDialog({ open: true, editing: type })}>
                                                            <EditOutlinedIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {canAdmin && (
                                                    <Tooltip title="Delete">
                                                        <IconButton size="small" color="error"
                                                            onClick={() => setDeleteDialog({ open: true, item: type })}>
                                                            <DeleteOutlineIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </Box>

            <TypeFormDialog
                open={formDialog.open}
                editing={formDialog.editing}
                onClose={() => setFormDialog({ open: false, editing: null })}
                onSaved={handleSaved}
            />

            <DeleteDialog
                open={deleteDialog.open}
                item={deleteDialog.item}
                onClose={() => setDeleteDialog({ open: false, item: null })}
                onDeleted={handleDeleted}
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

export default TimeOffTypesListPage;
