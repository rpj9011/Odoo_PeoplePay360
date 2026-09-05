// frontend/src/components/payroll/PayrunWizard.jsx
// Two-step Payrun creation wizard — styled to match app design system.

import React, { useState, useEffect, useCallback } from 'react';
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress,
    Dialog, DialogActions, DialogContent, DialogTitle, Divider,
    FormControl, FormControlLabel, FormHelperText, Grid, IconButton,
    InputLabel, MenuItem, Paper, Select, Step, StepLabel, Stepper,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Tooltip, Typography,
} from '@mui/material';
import { ArrowBack, ArrowForward, CheckCircleOutline, Close, Group, PlayArrow } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axios';

// ── Design tokens ─────────────────────────────────────────────────────────────
const RED    = '#E53935';
const TEXT   = '#1A1A1A';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';

const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, #C62828 100%)`,
    textTransform: 'none', fontWeight: 600, borderRadius: '8px', boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, #C62828 0%, #B71C1C 100%)', boxShadow: 'none' },
    '&:disabled': { opacity: 0.6 },
};

const textFieldSx = {
    '& .MuiOutlinedInput-root': {
        borderRadius: '8px', backgroundColor: '#fff',
        '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: RED },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: RED },
};

const STEPS = ['Structure & Period', 'Select Employees'];

function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCurrency(n) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
}

const PayrunWizard = ({ open, onClose }) => {
    const navigate = useNavigate();

    const [step, setStep]                   = useState(0);
    const [structures, setStructures]        = useState([]);
    const [structuresLoading, setStructuresLoading] = useState(false);
    const [step1, setStep1]                  = useState({ salaryStructure: '', periodStart: '', periodEnd: '' });
    const [step1Errors, setStep1Errors]      = useState({});
    const [employees, setEmployees]          = useState([]);
    const [empLoading, setEmpLoading]        = useState(false);
    const [empError, setEmpError]            = useState('');
    const [selected, setSelected]            = useState({});
    const [submitting, setSubmitting]        = useState(false);
    const [submitError, setSubmitError]      = useState('');

    useEffect(() => {
        if (!open) return;
        setStep(0);
        setStep1({ salaryStructure: '', periodStart: '', periodEnd: '' });
        setStep1Errors({});
        setEmployees([]);
        setSelected({});
        setSubmitError('');
        setStructuresLoading(true);
        axios.get('/api/salary-structures?isActive=true')
            .then(r => setStructures(r.data?.data || r.data || []))
            .catch(() => setStructures([]))
            .finally(() => setStructuresLoading(false));
    }, [open]);

    const validateStep1 = () => {
        const e = {};
        if (!step1.salaryStructure) e.salaryStructure = 'Please select a salary structure.';
        if (!step1.periodStart)     e.periodStart = 'Period start date is required.';
        if (!step1.periodEnd)       e.periodEnd   = 'Period end date is required.';
        if (step1.periodStart && step1.periodEnd && step1.periodEnd < step1.periodStart)
            e.periodEnd = 'End date must be after start date.';
        setStep1Errors(e);
        return Object.keys(e).length === 0;
    };

    const handleContinue = useCallback(async () => {
        if (!validateStep1()) return;
        setStep(1);
        setEmpError('');
        setEmpLoading(true);
        try {
            const r = await axios.get('/payroll/employees/eligible', {
                params: { structure: step1.salaryStructure, periodStart: step1.periodStart, periodEnd: step1.periodEnd },
            });
            const list = r.data?.data || [];
            setEmployees(list);
            const all = {};
            list.forEach(e => { all[e.employeeId] = true; });
            setSelected(all);
        } catch (err) {
            setEmpError(err.response?.data?.error || 'Failed to load eligible employees.');
        } finally {
            setEmpLoading(false);
        }
    }, [step1]);

    const toggleEmployee = id => setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    const allSelected  = employees.length > 0 && employees.every(e => selected[e.employeeId]);
    const someSelected = employees.some(e => selected[e.employeeId]);
    const toggleAll    = () => {
        if (allSelected) { setSelected({}); }
        else { const all = {}; employees.forEach(e => { all[e.employeeId] = true; }); setSelected(all); }
    };
    const selectedIds = employees.filter(e => selected[e.employeeId]).map(e => e.employeeId);

    const handleCreatePayrun = async () => {
        if (selectedIds.length === 0) { setSubmitError('Please select at least one employee.'); return; }
        setSubmitError('');
        setSubmitting(true);
        try {
            const r = await axios.post('/payroll/payruns', {
                salaryStructure: step1.salaryStructure,
                periodStart:     step1.periodStart,
                periodEnd:       step1.periodEnd,
                employeeIds:     selectedIds,
            });
            onClose();
            navigate(`/payroll/payruns/${r.data?.data?._id}`);
        } catch (err) {
            setSubmitError(err.response?.data?.error || 'Failed to create payrun. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={!submitting ? onClose : undefined} maxWidth="md" fullWidth
            PaperProps={{ sx: { borderRadius: '16px', borderTop: `3px solid ${RED}` } }}>

            {/* Title */}
            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700} color={TEXT} fontSize="1.1rem">New Payrun</Typography>
                <IconButton onClick={onClose} size="small" disabled={submitting} sx={{ color: MUTED }}>
                    <Close />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2 }}>
                {/* Stepper */}
                <Stepper activeStep={step} sx={{ mb: 3 }}>
                    {STEPS.map(label => (
                        <Step key={label}>
                            <StepLabel
                                StepIconProps={{
                                    sx: {
                                        '&.Mui-active':    { color: RED },
                                        '&.Mui-completed': { color: RED },
                                    },
                                }}
                            >
                                {label}
                            </StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {/* ── STEP 1 ── */}
                {step === 0 && (
                    <Grid container spacing={2.5}>
                        <Grid item xs={12}>
                            <FormControl fullWidth error={!!step1Errors.salaryStructure} sx={textFieldSx}>
                                <InputLabel>Salary Structure *</InputLabel>
                                <Select label="Salary Structure *" value={step1.salaryStructure}
                                    onChange={e => setStep1(p => ({ ...p, salaryStructure: e.target.value }))}
                                    disabled={structuresLoading}
                                    sx={{ borderRadius: '8px', bgcolor: '#fff' }}>
                                    {structuresLoading && <MenuItem disabled><CircularProgress size={14} sx={{ mr: 1 }} /> Loading…</MenuItem>}
                                    {structures.map(s => (
                                        <MenuItem key={s._id} value={s._id}>
                                            {s.name}
                                            <Chip label={s.code} size="small" sx={{ ml: 1, fontSize: '0.68rem' }} />
                                        </MenuItem>
                                    ))}
                                    {!structuresLoading && structures.length === 0 && <MenuItem disabled>No active structures found</MenuItem>}
                                </Select>
                                {step1Errors.salaryStructure && <FormHelperText>{step1Errors.salaryStructure}</FormHelperText>}
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField label="Period Start *" type="date" fullWidth InputLabelProps={{ shrink: true }}
                                value={step1.periodStart}
                                onChange={e => setStep1(p => ({ ...p, periodStart: e.target.value }))}
                                error={!!step1Errors.periodStart} helperText={step1Errors.periodStart}
                                sx={textFieldSx} />
                        </Grid>

                        <Grid item xs={12} sm={6}>
                            <TextField label="Period End *" type="date" fullWidth InputLabelProps={{ shrink: true }}
                                value={step1.periodEnd}
                                inputProps={{ min: step1.periodStart || undefined }}
                                onChange={e => setStep1(p => ({ ...p, periodEnd: e.target.value }))}
                                error={!!step1Errors.periodEnd} helperText={step1Errors.periodEnd}
                                sx={textFieldSx} />
                        </Grid>

                        {step1.periodStart && step1.periodEnd && !step1Errors.periodEnd && (
                            <Grid item xs={12}>
                                <Alert severity="info" icon={<CheckCircleOutline />} sx={{ borderRadius: '8px' }}>
                                    Period: <strong>{fmtDate(step1.periodStart)}</strong> → <strong>{fmtDate(step1.periodEnd)}</strong>
                                </Alert>
                            </Grid>
                        )}
                    </Grid>
                )}

                {/* ── STEP 2 ── */}
                {step === 1 && (
                    <Box>
                        {empLoading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box>}
                        {empError   && <Alert severity="error" sx={{ borderRadius: '8px', mb: 2 }}>{empError}</Alert>}
                        {!empLoading && !empError && employees.length === 0 && (
                            <Alert severity="warning" sx={{ borderRadius: '8px' }}>
                                No employees have an active Running contract for the selected period and salary structure.
                            </Alert>
                        )}

                        {!empLoading && employees.length > 0 && (
                            <>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                    <Typography variant="body2" fontWeight={600} color={TEXT}>
                                        <Group sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                                        {employees.length} eligible employee{employees.length !== 1 ? 's' : ''}
                                    </Typography>
                                    <FormControlLabel
                                        control={
                                            <Checkbox checked={allSelected} indeterminate={someSelected && !allSelected}
                                                onChange={toggleAll} size="small"
                                                sx={{ '&.Mui-checked': { color: RED }, '&.MuiCheckbox-indeterminate': { color: RED } }} />
                                        }
                                        label={<Typography variant="body2">{allSelected ? 'Deselect all' : 'Select all'}</Typography>}
                                    />
                                </Box>

                                <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                                <TableCell padding="checkbox" />
                                                {['Employee', 'Department', 'Contract', 'Monthly Wage'].map(h => (
                                                    <TableCell key={h} sx={{ fontWeight: 700, color: TEXT, fontSize: '0.78rem', py: 1.25 }}>{h}</TableCell>
                                                ))}
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {employees.map(emp => (
                                                <TableRow key={emp.employeeId} hover
                                                    onClick={() => toggleEmployee(emp.employeeId)}
                                                    selected={!!selected[emp.employeeId]}
                                                    sx={{ cursor: 'pointer', '&.Mui-selected': { bgcolor: '#FFF5F5' }, '&:last-child td': { borderBottom: 0 } }}>
                                                    <TableCell padding="checkbox">
                                                        <Checkbox size="small" checked={!!selected[emp.employeeId]}
                                                            onChange={() => toggleEmployee(emp.employeeId)}
                                                            onClick={e => e.stopPropagation()}
                                                            sx={{ '&.Mui-checked': { color: RED } }} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={600} color={TEXT}>{emp.fullName}</Typography>
                                                        <Typography variant="caption" color={MUTED}>{emp.employeeCode || emp.email}</Typography>
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.82rem', color: TEXT }}>{emp.department || '—'}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', color: MUTED, fontFamily: 'monospace' }}>{emp.contractNumber || '—'}</TableCell>
                                                    <TableCell sx={{ fontWeight: 600, fontSize: '0.82rem', color: TEXT }}>{fmtCurrency(emp.wagePerMonth)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </Paper>

                                <Typography variant="caption" color={MUTED} sx={{ mt: 1, display: 'block' }}>
                                    {selectedIds.length} of {employees.length} selected
                                    {selectedIds.length > 0 && (
                                        <> · Total wages: <strong>
                                            {fmtCurrency(employees.filter(e => selected[e.employeeId]).reduce((s, e) => s + (e.wagePerMonth || 0), 0))}
                                        </strong></>
                                    )}
                                </Typography>
                            </>
                        )}

                        {submitError && <Alert severity="error" sx={{ mt: 2, borderRadius: '8px' }}>{submitError}</Alert>}
                    </Box>
                )}
            </DialogContent>

            <Divider />

            <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between', gap: 1, borderTop: `1px solid ${BORDER}` }}>
                <Button
                    onClick={step === 0 ? onClose : () => setStep(0)}
                    disabled={submitting}
                    startIcon={<ArrowBack />}
                    variant="outlined"
                    sx={{ textTransform: 'none', borderColor: BORDER, color: MUTED, borderRadius: '8px' }}
                >
                    {step === 0 ? 'Cancel' : 'Back'}
                </Button>

                {step === 0 ? (
                    <Button variant="contained" endIcon={<ArrowForward />} onClick={handleContinue} sx={primaryBtnSx}>
                        Continue
                    </Button>
                ) : (
                    <Button variant="contained" endIcon={submitting ? <CircularProgress size={15} color="inherit" /> : <PlayArrow />}
                        onClick={handleCreatePayrun} disabled={submitting || selectedIds.length === 0} sx={primaryBtnSx}>
                        {submitting ? 'Creating…' : 'Create Payrun'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default PayrunWizard;
