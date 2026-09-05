// frontend/src/components/payroll/SalaryRuleForm.jsx
// Add/Edit dialog for a single SalaryRule — app design system styled.

import React, { useState, useEffect } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions,
    DialogContent, DialogTitle, Divider, FormControl, FormControlLabel,
    FormHelperText, Grid, IconButton, InputAdornment, InputLabel,
    MenuItem, Select, Switch, TextField, Typography,
} from '@mui/material';
import { CheckCircleOutline, Close, Save } from '@mui/icons-material';
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

const CATEGORIES          = ['Basic', 'Allowance', 'Gross', 'Deduction', 'Net'];
const APPLIES_TO          = ['Earning', 'Deduction'];
const COMPUTATION_METHODS = ['FixedAmount', 'PercentageOfWage', 'PercentageOfCategory', 'Formula'];
const BASE_CATEGORIES     = ['Basic', 'Gross'];

const EMPTY = {
    name: '', code: '', category: 'Basic', sequence: 10,
    computationMethod: 'FixedAmount', fixedAmount: '',
    percentage: '', percentageBaseCategory: 'Basic',
    formula: '', appliesTo: 'Earning', isActive: true,
};

const SalaryRuleForm = ({ open, onClose, onSaved, initialData }) => {
    const [form,          setForm]          = useState(EMPTY);
    const [errors,        setErrors]        = useState({});
    const [saving,        setSaving]        = useState(false);
    const [apiError,      setApiError]      = useState('');
    const [formulaStatus, setFormulaStatus] = useState(null); // null | 'checking' | 'valid' | 'invalid'
    const [formulaMsg,    setFormulaMsg]    = useState('');

    useEffect(() => {
        if (open) {
            setForm(initialData ? { ...EMPTY, ...initialData } : EMPTY);
            setErrors({}); setApiError(''); setFormulaStatus(null); setFormulaMsg('');
        }
    }, [open, initialData]);

    const set = field => e =>
        setForm(p => ({ ...p, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const checkFormula = async () => {
        if (form.computationMethod !== 'Formula' || !form.formula.trim()) return;
        setFormulaStatus('checking');
        try {
            const r = await axios.post('/api/salary-rules/validate-formula', { formula: form.formula });
            if (r.data?.valid) { setFormulaStatus('valid');   setFormulaMsg('Formula syntax is valid.'); }
            else               { setFormulaStatus('invalid'); setFormulaMsg(r.data?.error || 'Invalid formula.'); }
        } catch { setFormulaStatus('invalid'); setFormulaMsg('Could not validate formula.'); }
    };

    const validate = () => {
        const e = {};
        if (!form.name.trim())  e.name = 'Name is required.';
        if (!form.code.trim())  e.code = 'Code is required.';
        if (!form.category)     e.category = 'Category is required.';
        if (!form.appliesTo)    e.appliesTo = 'Applies To is required.';
        if (!form.computationMethod) e.computationMethod = 'Method is required.';
        if (form.computationMethod === 'FixedAmount' && (form.fixedAmount === '' || isNaN(Number(form.fixedAmount))))
            e.fixedAmount = 'A valid fixed amount is required.';
        if (['PercentageOfWage', 'PercentageOfCategory'].includes(form.computationMethod) &&
            (form.percentage === '' || isNaN(Number(form.percentage))))
            e.percentage = 'A valid percentage is required.';
        if (form.computationMethod === 'PercentageOfCategory' && !form.percentageBaseCategory)
            e.percentageBaseCategory = 'Base category is required.';
        if (form.computationMethod === 'Formula') {
            if (!form.formula.trim()) e.formula = 'Formula expression is required.';
            if (formulaStatus === 'invalid') e.formula = formulaMsg || 'Formula is invalid.';
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true); setApiError('');
        try {
            const payload = {
                name: form.name.trim(), code: form.code.trim().toUpperCase(),
                category: form.category, sequence: Number(form.sequence) || 10,
                computationMethod: form.computationMethod, appliesTo: form.appliesTo, isActive: form.isActive,
                ...(form.computationMethod === 'FixedAmount'          && { fixedAmount: Number(form.fixedAmount) }),
                ...(form.computationMethod === 'PercentageOfWage'     && { percentage: Number(form.percentage) }),
                ...(form.computationMethod === 'PercentageOfCategory' && { percentage: Number(form.percentage), percentageBaseCategory: form.percentageBaseCategory }),
                ...(form.computationMethod === 'Formula'              && { formula: form.formula.trim() }),
            };
            const r = initialData?._id
                ? await axios.put(`/api/salary-rules/${initialData._id}`, payload)
                : await axios.post('/api/salary-rules', payload);
            onSaved(r.data?.data || payload);
        } catch (err) {
            setApiError(err.response?.data?.error || 'Save failed. Please try again.');
        } finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={!saving ? onClose : undefined} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '16px', borderTop: `3px solid ${RED}` } }}>

            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700} color={TEXT}>{initialData ? 'Edit Salary Rule' : 'New Salary Rule'}</Typography>
                <IconButton onClick={onClose} size="small" disabled={saving} sx={{ color: MUTED }}><Close /></IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {apiError && <Alert severity="error" sx={{ borderRadius: '8px' }}>{apiError}</Alert>}

                <Grid container spacing={2}>
                    <Grid item xs={12} sm={8}>
                        <TextField label="Name *" fullWidth value={form.name} onChange={set('name')}
                            error={!!errors.name} helperText={errors.name} size="small" sx={textFieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField label="Code *" fullWidth value={form.code} onChange={set('code')}
                            error={!!errors.code} helperText={errors.code} size="small" sx={textFieldSx}
                            inputProps={{ style: { textTransform: 'uppercase' } }} />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth size="small" error={!!errors.category} sx={textFieldSx}>
                            <InputLabel>Category *</InputLabel>
                            <Select label="Category *" value={form.category} onChange={set('category')}>
                                {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                            </Select>
                            {errors.category && <FormHelperText>{errors.category}</FormHelperText>}
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth size="small" error={!!errors.appliesTo} sx={textFieldSx}>
                            <InputLabel>Applies To *</InputLabel>
                            <Select label="Applies To *" value={form.appliesTo} onChange={set('appliesTo')}>
                                {APPLIES_TO.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                            </Select>
                            {errors.appliesTo && <FormHelperText>{errors.appliesTo}</FormHelperText>}
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField label="Sequence" fullWidth value={form.sequence} onChange={set('sequence')}
                            type="number" size="small" sx={textFieldSx} helperText="Lower = computed first" />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth size="small" error={!!errors.computationMethod} sx={textFieldSx}>
                            <InputLabel>Computation Method *</InputLabel>
                            <Select label="Computation Method *" value={form.computationMethod}
                                onChange={e => { setForm(p => ({ ...p, computationMethod: e.target.value })); setFormulaStatus(null); }}>
                                {COMPUTATION_METHODS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                            </Select>
                            {errors.computationMethod && <FormHelperText>{errors.computationMethod}</FormHelperText>}
                        </FormControl>
                    </Grid>

                    <Grid item xs={12}><Divider /></Grid>

                    {/* Method-conditional inputs */}
                    {form.computationMethod === 'FixedAmount' && (
                        <Grid item xs={12}>
                            <TextField label="Fixed Amount *" fullWidth value={form.fixedAmount} onChange={set('fixedAmount')}
                                type="number" size="small" error={!!errors.fixedAmount} helperText={errors.fixedAmount} sx={textFieldSx}
                                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                        </Grid>
                    )}

                    {(form.computationMethod === 'PercentageOfWage' || form.computationMethod === 'PercentageOfCategory') && (
                        <Grid item xs={12} sm={form.computationMethod === 'PercentageOfCategory' ? 6 : 12}>
                            <TextField label="Percentage *" fullWidth value={form.percentage} onChange={set('percentage')}
                                type="number" size="small" error={!!errors.percentage} helperText={errors.percentage} sx={textFieldSx}
                                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
                        </Grid>
                    )}

                    {form.computationMethod === 'PercentageOfCategory' && (
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth size="small" error={!!errors.percentageBaseCategory} sx={textFieldSx}>
                                <InputLabel>Base Category *</InputLabel>
                                <Select label="Base Category *" value={form.percentageBaseCategory} onChange={set('percentageBaseCategory')}>
                                    {BASE_CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                                </Select>
                                {errors.percentageBaseCategory && <FormHelperText>{errors.percentageBaseCategory}</FormHelperText>}
                            </FormControl>
                        </Grid>
                    )}

                    {form.computationMethod === 'Formula' && (
                        <Grid item xs={12}>
                            <TextField label="Formula Expression *" fullWidth value={form.formula} onChange={set('formula')}
                                onBlur={checkFormula} size="small" multiline rows={2} sx={textFieldSx}
                                error={!!errors.formula || formulaStatus === 'invalid'}
                                helperText={errors.formula || (formulaStatus === 'invalid' ? formulaMsg : undefined)}
                                placeholder="e.g. BASIC * 0.12  or  GROSS * 0.05" />
                            {formulaStatus === 'checking' && (
                                <Typography variant="caption" color={MUTED} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                    <CircularProgress size={10} /> Validating…
                                </Typography>
                            )}
                            {formulaStatus === 'valid' && (
                                <Typography variant="caption" color="#166534" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                    <CheckCircleOutline sx={{ fontSize: 14 }} /> {formulaMsg}
                                </Typography>
                            )}
                            <Typography variant="caption" color={MUTED} sx={{ mt: 0.5, display: 'block' }}>
                                Variables: BASIC, ALLOWANCE, GROSS, DEDUCTION, NET, WAGE
                            </Typography>
                        </Grid>
                    )}

                    <Grid item xs={12}>
                        <FormControlLabel
                            control={<Switch checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: RED }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: RED } }} />}
                            label={<Typography variant="body2" color={TEXT}>Active</Typography>}
                        />
                    </Grid>
                </Grid>
            </DialogContent>

            <Divider />
            <DialogActions sx={{ px: 3, py: 2, gap: 1, borderTop: `1px solid ${BORDER}`, justifyContent: 'space-between' }}>
                <Button onClick={onClose} disabled={saving} variant="outlined"
                    sx={{ textTransform: 'none', borderRadius: '8px', borderColor: BORDER, color: MUTED }}
                    startIcon={<Close />}>
                    Cancel
                </Button>
                <Button variant="contained" onClick={handleSave} disabled={saving} sx={primaryBtnSx}
                    startIcon={saving ? <CircularProgress size={15} color="inherit" /> : <Save />}>
                    {saving ? 'Saving…' : 'Save Rule'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SalaryRuleForm;
