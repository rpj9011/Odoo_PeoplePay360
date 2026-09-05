// frontend/src/components/ContractForm.jsx
// Create / edit dialog for Contract documents.
// Used by ContractsPage.jsx.
// Fields mirror backend/models/Contract.js exactly.
// The model's pre-save hook enforces overlap validation server-side;
// the form surfaces that error as an inline Alert.

import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, MenuItem, Stack, Box, Typography,
    IconButton, Alert, CircularProgress, Autocomplete, Grid,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import api from '../api/axios';

// ── Style tokens (match AllocationsListPage / adminEmployeeTheme) ─────────────
const RED    = '#E53935';
const TEXT   = '#1A1A1A';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';

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
    minWidth: 120,
    '&:hover': {
        background: `linear-gradient(135deg, #C62828 0%, #B71C1C 100%)`,
        boxShadow: 'none',
    },
};

const STATUS_OPTIONS = ['Draft', 'Running', 'Expired', 'Cancelled'];

const EMPTY = {
    employee:        '',
    startDate:       '',
    endDate:         '',
    status:          'Draft',
    department:      '',
    jobPosition:     '',
    wagePerMonth:    '',
    workingSchedule: '',
    salaryStructure: '',
    notes:           '',
};

const ContractForm = ({
    open,
    onClose,
    onSaved,
    editing,          // existing Contract doc (or null for create)
    preselectedEmployee, // {_id, fullName, employeeCode} — set when opened from employee profile
}) => {
    const [form, setForm]       = useState(EMPTY);
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');

    // Reference data for dropdowns
    const [employees,       setEmployees]       = useState([]);
    const [shifts,          setShifts]          = useState([]);
    const [structures,      setStructures]      = useState([]);
    const [refLoading,      setRefLoading]      = useState(false);

    // Autocomplete employee selection state
    const [selectedEmployee, setSelectedEmployee] = useState(null);

    // ── Load reference data once on open ────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        let active = true;
        setRefLoading(true);
        Promise.all([
            api.get('/admin/employees?all=true&slim=true'),
            api.get('/admin/shifts'),
            api.get('/salary-structures'),
        ])
            .then(([empsRes, shiftsRes, structsRes]) => {
                if (!active) return;
                const emps = Array.isArray(empsRes.data)
                    ? empsRes.data
                    : (empsRes.data?.employees || []);
                setEmployees(emps.sort((a, b) => a.fullName.localeCompare(b.fullName)));

                const sh = Array.isArray(shiftsRes.data)
                    ? shiftsRes.data
                    : (shiftsRes.data?.shifts || []);
                setShifts(sh);

                const st = Array.isArray(structsRes.data)
                    ? structsRes.data
                    : (structsRes.data?.structures || []);
                setStructures(st.filter(s => s.isActive !== false));
            })
            .catch(() => { /* non-fatal — dropdowns fall back to empty */ })
            .finally(() => { if (active) setRefLoading(false); });
        return () => { active = false; };
    }, [open]);

    // ── Populate form when editing or pre-selecting an employee ─────────────
    useEffect(() => {
        if (!open) return;
        setError('');

        if (editing) {
            setForm({
                employee:        editing.employee?._id || editing.employee || '',
                startDate:       editing.startDate ? editing.startDate.slice(0, 10) : '',
                endDate:         editing.endDate   ? editing.endDate.slice(0, 10)   : '',
                status:          editing.status          || 'Draft',
                department:      editing.department      || '',
                jobPosition:     editing.jobPosition     || '',
                wagePerMonth:    editing.wagePerMonth    ?? '',
                workingSchedule: editing.workingSchedule?._id || editing.workingSchedule || '',
                salaryStructure: editing.salaryStructure?._id || editing.salaryStructure || '',
                notes:           editing.notes           || '',
            });
        } else {
            setForm({
                ...EMPTY,
                employee:   preselectedEmployee?._id || '',
                department: preselectedEmployee?.department || '',
            });
        }
    }, [open, editing, preselectedEmployee]);

    // Resolve selected employee object for Autocomplete value once employees load
    useEffect(() => {
        if (!employees.length) return;
        const eid = editing
            ? (editing.employee?._id || editing.employee || '')
            : (preselectedEmployee?._id || '');
        if (!eid) { setSelectedEmployee(null); return; }
        const match = employees.find(e => e._id === eid);
        setSelectedEmployee(match || null);
    }, [employees, editing, preselectedEmployee, open]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleEmployeeChange = (_, newVal) => {
        setSelectedEmployee(newVal || null);
        setForm(prev => ({
            ...prev,
            employee:   newVal?._id    || '',
            department: newVal?.department || prev.department,
        }));
    };

    const handleSave = async () => {
        setError('');

        if (!form.employee) {
            setError('Employee is required.');
            return;
        }
        if (!form.startDate) {
            setError('Start date is required.');
            return;
        }
        if (form.wagePerMonth === '' || isNaN(Number(form.wagePerMonth)) || Number(form.wagePerMonth) < 0) {
            setError('Wage per month must be a non-negative number.');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                employee:        form.employee,
                startDate:       form.startDate,
                endDate:         form.endDate         || null,
                status:          form.status,
                department:      form.department      || '',
                jobPosition:     form.jobPosition     || '',
                wagePerMonth:    Number(form.wagePerMonth),
                workingSchedule: form.workingSchedule || null,
                salaryStructure: form.salaryStructure || null,
                notes:           form.notes           || '',
            };

            if (editing) {
                await api.put(`/admin/contracts/${editing._id}`, payload);
            } else {
                await api.post('/admin/contracts', payload);
            }
            onSaved();
        } catch (err) {
            // Surface the model's overlap-validation error (or any other 400)
            setError(err.response?.data?.error || 'Failed to save contract. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const isPreselected = !!preselectedEmployee && !editing;

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{ sx: { borderRadius: '16px', borderTop: `3px solid ${RED}` } }}
        >
            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700} color={TEXT}>
                    {editing ? 'Edit Contract' : 'New Contract'}
                </Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: MUTED }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {error && (
                    <Alert severity="error" sx={{ borderRadius: '8px' }}>
                        {error}
                    </Alert>
                )}

                {/* Employee */}
                <Autocomplete
                    options={employees}
                    loading={refLoading}
                    value={selectedEmployee}
                    onChange={handleEmployeeChange}
                    disabled={isPreselected}
                    getOptionLabel={(opt) =>
                        opt.fullName
                            ? `${opt.fullName}${opt.employeeCode ? ` (${opt.employeeCode})` : ''}`
                            : ''
                    }
                    isOptionEqualToValue={(opt, val) => opt._id === val?._id}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Employee"
                            required
                            sx={textFieldSx}
                            helperText={isPreselected ? 'Pre-selected from employee profile.' : undefined}
                        />
                    )}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />

                {/* Dates */}
                <Grid container spacing={2}>
                    <Grid item xs={6}>
                        <TextField
                            label="Start Date"
                            name="startDate"
                            type="date"
                            value={form.startDate}
                            onChange={handleChange}
                            fullWidth
                            required
                            InputLabelProps={{ shrink: true }}
                            sx={textFieldSx}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            label="End Date"
                            name="endDate"
                            type="date"
                            value={form.endDate}
                            onChange={handleChange}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            sx={textFieldSx}
                            helperText="Leave blank for open-ended (currently Running)."
                        />
                    </Grid>
                </Grid>

                {/* Status */}
                <TextField
                    label="Status"
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    select
                    fullWidth
                    sx={textFieldSx}
                >
                    {STATUS_OPTIONS.map(s => (
                        <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                </TextField>

                {/* Dept + Position */}
                <Grid container spacing={2}>
                    <Grid item xs={6}>
                        <TextField
                            label="Department"
                            name="department"
                            value={form.department}
                            onChange={handleChange}
                            fullWidth
                            sx={textFieldSx}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            label="Job Position"
                            name="jobPosition"
                            value={form.jobPosition}
                            onChange={handleChange}
                            fullWidth
                            sx={textFieldSx}
                        />
                    </Grid>
                </Grid>

                {/* Wage */}
                <TextField
                    label="Wage / Month (₹)"
                    name="wagePerMonth"
                    value={form.wagePerMonth}
                    onChange={handleChange}
                    type="number"
                    inputProps={{ min: 0, step: 100 }}
                    fullWidth
                    required
                    sx={textFieldSx}
                />

                {/* Working Schedule */}
                <TextField
                    label="Working Schedule"
                    name="workingSchedule"
                    value={form.workingSchedule}
                    onChange={handleChange}
                    select
                    fullWidth
                    sx={textFieldSx}
                    SelectProps={{ displayEmpty: true }}
                >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {shifts.map(s => (
                        <MenuItem key={s._id} value={s._id}>
                            {s.shiftName}
                            {s.totalWeeklyHours != null ? ` — ${s.totalWeeklyHours}h/week` : ''}
                        </MenuItem>
                    ))}
                </TextField>

                {/* Salary Structure */}
                <TextField
                    label="Salary Structure"
                    name="salaryStructure"
                    value={form.salaryStructure}
                    onChange={handleChange}
                    select
                    fullWidth
                    sx={textFieldSx}
                    SelectProps={{ displayEmpty: true }}
                >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {structures.map(s => (
                        <MenuItem key={s._id} value={s._id}>
                            {s.name}{s.code ? ` (${s.code})` : ''}
                        </MenuItem>
                    ))}
                </TextField>

                {/* Notes */}
                <TextField
                    label="Notes"
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={2}
                    sx={textFieldSx}
                />
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2, gap: 1, borderTop: `1px solid ${BORDER}` }}>
                <Button
                    onClick={onClose}
                    variant="outlined"
                    sx={{ textTransform: 'none', borderColor: BORDER, color: MUTED, borderRadius: '8px' }}
                >
                    Cancel
                </Button>
                <Button onClick={handleSave} variant="contained" disabled={saving} sx={primaryBtnSx}>
                    {saving
                        ? <CircularProgress size={18} color="inherit" />
                        : editing ? 'Save Changes' : 'Create Contract'
                    }
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ContractForm;
