// frontend/src/components/payroll/SalaryStructureForm.jsx
// Add/Edit dialog for a SalaryStructure — app design system styled.

import React, { useState, useEffect, useCallback } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
    DialogContent, DialogTitle, Divider, FormControlLabel, FormControl,
    Grid, IconButton, InputLabel, MenuItem, Paper, Select, Switch,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, Close, Delete, Save } from '@mui/icons-material';
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

const CATEGORY_SX = {
    Basic:     { bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' },
    Allowance: { bgcolor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' },
    Gross:     { bgcolor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' },
    Deduction: { bgcolor: '#FEF2F2', color: '#991b1b', border: '1px solid #FECACA' },
    Net:       { bgcolor: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' },
};

const EMPTY = { name: '', code: '', description: '', isActive: true, salaryRules: [] };

const SalaryStructureForm = ({ open, onClose, onSaved, initialData }) => {
    const [form,         setForm]         = useState(EMPTY);
    const [errors,       setErrors]       = useState({});
    const [saving,       setSaving]       = useState(false);
    const [apiError,     setApiError]     = useState('');
    const [allRules,     setAllRules]     = useState([]);
    const [rulesLoading, setRulesLoading] = useState(false);
    const [selectedRule, setSelectedRule] = useState('');

    const loadRules = useCallback(() => {
        setRulesLoading(true);
        axios.get('/api/salary-rules?isActive=true')
            .then(r => setAllRules(r.data?.data || []))
            .finally(() => setRulesLoading(false));
    }, []);

    useEffect(() => {
        if (!open) return;
        loadRules();
        if (initialData) {
            setForm({
                name:        initialData.name        || '',
                code:        initialData.code        || '',
                description: initialData.description || '',
                isActive:    initialData.isActive    !== false,
                salaryRules: (initialData.salaryRules || []).map(sr => ({
                    ruleId:   sr.rule?._id || sr.rule,
                    ruleName: sr.rule?.name || '',
                    ruleCode: sr.rule?.code || '',
                    category: sr.rule?.category || '',
                    sequence: sr.sequence ?? 10,
                })),
            });
        } else {
            setForm(EMPTY);
        }
        setErrors({}); setApiError(''); setSelectedRule('');
    }, [open, initialData, loadRules]);

    const set = field => e =>
        setForm(p => ({ ...p, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    const addRule = () => {
        if (!selectedRule) return;
        const rule = allRules.find(r => r._id === selectedRule);
        if (!rule || form.salaryRules.some(r => r.ruleId === selectedRule)) return;
        const maxSeq = form.salaryRules.reduce((m, r) => Math.max(m, r.sequence), 0);
        setForm(p => ({
            ...p,
            salaryRules: [...p.salaryRules, {
                ruleId: rule._id, ruleName: rule.name,
                ruleCode: rule.code, category: rule.category,
                sequence: maxSeq + 10,
            }],
        }));
        setSelectedRule('');
    };

    const removeRule = ruleId =>
        setForm(p => ({ ...p, salaryRules: p.salaryRules.filter(r => r.ruleId !== ruleId) }));

    const updateSeq = (ruleId, val) =>
        setForm(p => ({
            ...p,
            salaryRules: p.salaryRules.map(r => r.ruleId === ruleId ? { ...r, sequence: Number(val) || 0 } : r),
        }));

    const moveRule = (index, dir) => {
        const arr = [...form.salaryRules];
        const target = index + dir;
        if (target < 0 || target >= arr.length) return;
        [arr[index], arr[target]] = [arr[target], arr[index]];
        const reseq = arr.map((r, i) => ({ ...r, sequence: (i + 1) * 10 }));
        setForm(p => ({ ...p, salaryRules: reseq }));
    };

    const sortedRules = [...form.salaryRules].sort((a, b) => a.sequence - b.sequence);

    const validate = () => {
        const e = {};
        if (!form.name.trim()) e.name = 'Name is required.';
        if (!form.code.trim()) e.code = 'Code is required.';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true); setApiError('');
        try {
            const payload = {
                name:        form.name.trim(),
                code:        form.code.trim().toUpperCase(),
                description: form.description.trim(),
                isActive:    form.isActive,
                salaryRules: sortedRules.map((r, i) => ({
                    rule:     r.ruleId,
                    sequence: r.sequence || (i + 1) * 10,
                })),
            };
            const r = initialData?._id
                ? await axios.put(`/api/salary-structures/${initialData._id}`, payload)
                : await axios.post('/api/salary-structures', payload);
            onSaved(r.data?.data || payload);
        } catch (err) {
            setApiError(err.response?.data?.error || 'Save failed. Please try again.');
        } finally { setSaving(false); }
    };

    const availableRules = allRules.filter(r => !form.salaryRules.some(sr => sr.ruleId === r._id));

    return (
        <Dialog open={open} onClose={!saving ? onClose : undefined} maxWidth="md" fullWidth
            PaperProps={{ sx: { borderRadius: '16px', borderTop: `3px solid ${RED}` } }}>

            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700} color={TEXT}>
                    {initialData ? 'Edit Salary Structure' : 'New Salary Structure'}
                </Typography>
                <IconButton onClick={onClose} size="small" disabled={saving} sx={{ color: MUTED }}>
                    <Close />
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{ pt: 2 }}>
                {apiError && <Alert severity="error" sx={{ borderRadius: '8px', mb: 2 }}>{apiError}</Alert>}

                {/* Basic fields */}
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={8}>
                        <TextField label="Name *" fullWidth value={form.name} onChange={set('name')}
                            error={!!errors.name} helperText={errors.name} size="small" sx={textFieldSx} />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField label="Code *" fullWidth value={form.code} onChange={set('code')}
                            error={!!errors.code} helperText={errors.code} size="small" sx={textFieldSx}
                            inputProps={{ style: { textTransform: 'uppercase' } }} />
                    </Grid>
                    <Grid item xs={12}>
                        <TextField label="Description" fullWidth value={form.description}
                            onChange={set('description')} size="small" multiline rows={2} sx={textFieldSx} />
                    </Grid>
                    <Grid item xs={12}>
                        <FormControlLabel
                            control={
                                <Switch checked={form.isActive}
                                    onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))}
                                    sx={{
                                        '& .MuiSwitch-switchBase.Mui-checked': { color: RED },
                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: RED },
                                    }} />
                            }
                            label={<Typography variant="body2" color={TEXT}>Active</Typography>}
                        />
                    </Grid>
                </Grid>

                <Divider sx={{ mb: 2 }} />

                <Typography variant="body2" fontWeight={700} color={TEXT} sx={{ mb: 1.5 }}>
                    Salary Rules
                    <Typography component="span" variant="caption" color={MUTED} sx={{ ml: 1 }}>
                        (ordered — lower sequence = computed first)
                    </Typography>
                </Typography>

                {/* Add rule row */}
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                    <FormControl size="small" sx={{ flex: 1, ...textFieldSx }}>
                        <InputLabel>Add a rule…</InputLabel>
                        <Select label="Add a rule…" value={selectedRule}
                            onChange={e => setSelectedRule(e.target.value)}
                            disabled={rulesLoading || availableRules.length === 0}
                            sx={{ borderRadius: '8px', bgcolor: '#fff' }}>
                            {rulesLoading && <MenuItem disabled>Loading…</MenuItem>}
                            {!rulesLoading && availableRules.length === 0 && (
                                <MenuItem disabled>All rules already added</MenuItem>
                            )}
                            {availableRules.map(r => (
                                <MenuItem key={r._id} value={r._id}>
                                    {r.name}
                                    <Chip label={r.code} size="small" sx={{ ml: 1, fontSize: '0.65rem' }} />
                                    <Chip label={r.category} size="small"
                                        sx={{ ml: 0.5, fontSize: '0.65rem', ...(CATEGORY_SX[r.category] || {}) }} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button variant="contained" startIcon={<Add />} onClick={addRule}
                        disabled={!selectedRule} sx={{ ...primaryBtnSx, whiteSpace: 'nowrap' }}>
                        Add
                    </Button>
                </Box>

                {/* Rules table */}
                {sortedRules.length === 0 ? (
                    <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', borderRadius: '10px', borderColor: BORDER }}>
                        <Typography variant="body2" color={MUTED}>
                            No rules added yet. Select a rule above and click Add.
                        </Typography>
                    </Paper>
                ) : (
                    <Paper sx={{ borderRadius: '10px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                        {['Seq', 'Name', 'Code', 'Category', 'Order', ''].map(h => (
                                            <TableCell key={h} sx={{ fontWeight: 700, color: TEXT, fontSize: '0.78rem', py: 1.25 }}>{h}</TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sortedRules.map((r, i) => (
                                        <TableRow key={r.ruleId} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                            <TableCell sx={{ width: 80 }}>
                                                <TextField value={r.sequence}
                                                    onChange={e => updateSeq(r.ruleId, e.target.value)}
                                                    type="number" size="small"
                                                    inputProps={{ style: { width: 55, padding: '4px 6px' } }}
                                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '6px' } }} />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600} color={TEXT}>{r.ruleName}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <code style={{ fontSize: '0.72rem', backgroundColor: '#F3F4F6', padding: '1px 5px', borderRadius: 3, color: TEXT }}>
                                                    {r.ruleCode}
                                                </code>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={r.category} size="small"
                                                    sx={{ fontWeight: 600, fontSize: '0.68rem', ...(CATEGORY_SX[r.category] || {}) }} />
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip title="Move up">
                                                    <span>
                                                        <IconButton size="small" onClick={() => moveRule(i, -1)} disabled={i === 0}>
                                                            <ArrowUpward sx={{ fontSize: 15 }} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title="Move down">
                                                    <span>
                                                        <IconButton size="small" onClick={() => moveRule(i, 1)} disabled={i === sortedRules.length - 1}>
                                                            <ArrowDownward sx={{ fontSize: 15 }} />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell align="right">
                                                <IconButton size="small" color="error" onClick={() => removeRule(r.ruleId)}>
                                                    <Delete sx={{ fontSize: 16 }} />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
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
                    {saving ? 'Saving…' : 'Save Structure'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SalaryStructureForm;
