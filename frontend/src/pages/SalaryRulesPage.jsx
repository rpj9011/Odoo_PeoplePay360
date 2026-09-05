// frontend/src/pages/SalaryRulesPage.jsx
// Route: /payroll/salary-rules

import React, { useState, useEffect, useCallback } from 'react';
import {
    Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, IconButton,
    Link, Paper, Snackbar, Stack, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { ArrowBack, NavigateNext, Refresh } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { useAuth } from '../context/AuthContext';
import PageHeroHeader from '../components/PageHeroHeader';
import SalaryRuleForm from '../components/payroll/SalaryRuleForm';
import RuleIcon from '@mui/icons-material/Rule';

// ── Design tokens ─────────────────────────────────────────────────────────────
const RED    = '#E53935';
const TEXT   = '#1A1A1A';
const MUTED  = '#6B7280';
const BORDER = '#E5E7EB';
const SURFACE = '#F8F9FB';

const SALARY_CONFIG_WRITE = ['Admin', 'HRPayrollManager'];

const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, #C62828 100%)`,
    textTransform: 'none', fontWeight: 600, borderRadius: '8px', boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, #C62828 0%, #B71C1C 100%)', boxShadow: 'none' },
};

// ── Category chips ────────────────────────────────────────────────────────────
const CATEGORY_SX = {
    Basic:     { bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' },
    Allowance: { bgcolor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' },
    Gross:     { bgcolor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' },
    Deduction: { bgcolor: '#FEF2F2', color: '#991b1b', border: '1px solid #FECACA' },
    Net:       { bgcolor: '#F5F3FF', color: '#6D28D9', border: '1px solid #DDD6FE' },
};

const METHOD_SX = {
    FixedAmount:          { bgcolor: '#F9FAFB', color: MUTED,     border: `1px solid ${BORDER}` },
    PercentageOfWage:     { bgcolor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' },
    PercentageOfCategory: { bgcolor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' },
    Formula:              { bgcolor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' },
};

const SalaryRulesPage = () => {
    const { user }   = useAuth();
    const navigate   = useNavigate();
    const canWrite   = SALARY_CONFIG_WRITE.includes(user?.role);

    const [rules,    setRules]    = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editing,  setEditing]  = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const load = useCallback(() => {
        setLoading(true);
        axios.get('/api/salary-rules')
            .then(r => setRules(r.data?.data || []))
            .catch(() => setError('Failed to load salary rules.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSaved = (saved) => {
        setFormOpen(false); setEditing(null);
        setSnackbar({ open: true, message: `Rule "${saved.name}" saved.`, severity: 'success' });
        load();
    };

    const handleDelete = async (rule) => {
        if (!window.confirm(`Delete salary rule "${rule.name}" (${rule.code})? This cannot be undone.`)) return;
        setDeleting(rule._id);
        try {
            await axios.delete(`/api/salary-rules/${rule._id}`);
            setSnackbar({ open: true, message: `Rule "${rule.name}" deleted.`, severity: 'success' });
            load();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Delete failed.', severity: 'error' });
        } finally { setDeleting(null); }
    };

    return (
        <Box sx={{ bgcolor: SURFACE }}>
            {/* ── Breadcrumb ── */}
            <Box sx={{ px: { xs: 2, md: 4 }, pt: 2, pb: 0 }}>
                <Breadcrumbs separator={<NavigateNext fontSize="small" />}
                    sx={{ '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap', alignItems: 'center' } }}>
                    <Link component="button" variant="body2" underline="hover"
                        onClick={() => navigate('/payroll')}
                        sx={{ color: MUTED, display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', fontSize: '0.82rem' }}>
                        <ArrowBack sx={{ fontSize: 14 }} /> Payroll
                    </Link>
                    <Typography variant="body2" color={TEXT} fontWeight={500} sx={{ fontSize: '0.82rem' }}>
                        Salary Rules
                    </Typography>
                </Breadcrumbs>
            </Box>

            <PageHeroHeader
                eyebrow="Payroll Configuration"
                title="Salary Rules"
                description="Define individual computation rules — Fixed, Percentage, or Formula."
                icon={<RuleIcon />}
                actionArea={
                    <Stack direction="row" spacing={1}>
                        <IconButton onClick={load} size="small" sx={{ color: MUTED }}>
                            <Refresh fontSize="small" />
                        </IconButton>
                        {canWrite && (
                            <Button variant="contained" startIcon={<AddIcon />}
                                onClick={() => { setEditing(null); setFormOpen(true); }}
                                sx={primaryBtnSx}>
                                New Rule
                            </Button>
                        )}
                    </Stack>
                }
            />

            <Box sx={{ px: { xs: 2, md: 4 }, py: 3 }}>
                {error && <Alert severity="error" sx={{ borderRadius: '8px', mb: 2 }}>{error}</Alert>}

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Paper sx={{ borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                        {['Seq', 'Name', 'Code', 'Category', 'Applies To', 'Method', 'Detail', 'Active', canWrite ? 'Actions' : ''].filter(Boolean).map(h => (
                                            <TableCell key={h} sx={{ fontWeight: 700, color: TEXT, fontSize: '0.8rem', py: 1.5 }}>{h}</TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rules.length === 0 && (
                                        <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: MUTED }}>
                                            No salary rules yet. Click "New Rule" to create one.
                                        </TableCell></TableRow>
                                    )}
                                    {rules.map(r => (
                                        <TableRow key={r._id} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
                                            <TableCell sx={{ color: MUTED, fontSize: '0.78rem' }}>{r.sequence}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600} color={TEXT}>{r.name}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <code style={{ fontSize: '0.75rem', backgroundColor: '#F3F4F6', padding: '2px 6px', borderRadius: 4, color: TEXT }}>
                                                    {r.code}
                                                </code>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={r.category} size="small"
                                                    sx={{ fontWeight: 600, fontSize: '0.7rem', ...(CATEGORY_SX[r.category] || {}) }} />
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={r.appliesTo} size="small"
                                                    sx={{ fontWeight: 600, fontSize: '0.7rem',
                                                        ...(r.appliesTo === 'Earning'
                                                            ? { bgcolor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }
                                                            : { bgcolor: '#FEF2F2', color: '#991b1b', border: '1px solid #FECACA' }) }} />
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={r.computationMethod} size="small"
                                                    sx={{ fontWeight: 600, fontSize: '0.68rem', ...(METHOD_SX[r.computationMethod] || {}) }} />
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 160 }}>
                                                <Typography variant="caption" color={MUTED} sx={{ fontFamily: r.computationMethod === 'Formula' ? 'monospace' : 'inherit' }}>
                                                    {r.computationMethod === 'FixedAmount'          && `₹${r.fixedAmount?.toLocaleString('en-IN') ?? '—'}`}
                                                    {r.computationMethod === 'PercentageOfWage'     && `${r.percentage ?? '—'}% of Wage`}
                                                    {r.computationMethod === 'PercentageOfCategory' && `${r.percentage ?? '—'}% of ${r.percentageBaseCategory ?? '—'}`}
                                                    {r.computationMethod === 'Formula'              && (r.formula || '—')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={r.isActive ? 'Active' : 'Inactive'} size="small"
                                                    sx={{ fontWeight: 600, fontSize: '0.7rem',
                                                        ...(r.isActive
                                                            ? { bgcolor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }
                                                            : { bgcolor: '#F9FAFB', color: MUTED, border: `1px solid ${BORDER}` }) }} />
                                            </TableCell>
                                            {canWrite && (
                                                <TableCell>
                                                    <Stack direction="row" spacing={0.5}>
                                                        <Tooltip title="Edit">
                                                            <IconButton size="small" onClick={() => { setEditing(r); setFormOpen(true); }}>
                                                                <EditOutlinedIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Delete">
                                                            <span>
                                                                <IconButton size="small" color="error"
                                                                    onClick={() => handleDelete(r)}
                                                                    disabled={deleting === r._id}>
                                                                    {deleting === r._id ? <CircularProgress size={14} /> : <DeleteOutlineIcon fontSize="small" />}
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    </Stack>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                )}
            </Box>

            <SalaryRuleForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }}
                onSaved={handleSaved} initialData={editing} />

            <Snackbar open={snackbar.open} autoHideDuration={4000}
                onClose={() => setSnackbar(s => ({ ...s, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
                <Alert variant="filled" severity={snackbar.severity}
                    sx={{ borderRadius: '8px' }} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default SalaryRulesPage;
