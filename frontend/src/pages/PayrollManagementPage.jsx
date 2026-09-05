// frontend/src/pages/PayrollManagementPage.jsx
// Payroll management hub — styled to match app design system.

import React, { useState, useEffect, lazy, Suspense } from 'react';
import {
    Alert, Box, Button, CircularProgress, Paper, Tab, Tabs, Typography,
} from '@mui/material';
import {
    ArrowBack, Calculate, Dashboard, People, PlaylistAdd, Settings,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import PageHeroHeader from '../components/PageHeroHeader';
import PaymentsIcon from '@mui/icons-material/Payments';
import PayrunWizard from '../components/payroll/PayrunWizard';

// Lazy-load tab content
const PayrollDashboard  = lazy(() => import('../components/payroll/PayrollDashboard'));
const PayrollSettings   = lazy(() => import('../components/payroll/PayrollSettings'));
const PayrollCalculator = lazy(() => import('../components/payroll/PayrollCalculator'));
const PayrollTable      = lazy(() => import('../components/payroll/PayrollTable'));
const PayrunListTab     = lazy(() => import('../components/payroll/PayrunListTab'));

// ── Design tokens ─────────────────────────────────────────────────────────────
const RED     = '#E53935';
const MUTED   = '#6B7280';
const BORDER  = '#E5E7EB';
const SURFACE = '#F8F9FB';

const primaryBtnSx = {
    background: `linear-gradient(135deg, ${RED} 0%, #C62828 100%)`,
    textTransform: 'none', fontWeight: 600, borderRadius: '8px', boxShadow: 'none',
    '&:hover': { background: 'linear-gradient(135deg, #C62828 0%, #B71C1C 100%)', boxShadow: 'none' },
};

// PAYROLL_READ roles
const PAYROLL_ROLES = ['Admin', 'HRPayrollUser', 'HRPayrollManager'];

// ── Tab fallback ──────────────────────────────────────────────────────────────
const TabLoader = () => (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 340 }}>
        <CircularProgress size={28} sx={{ color: RED }} />
    </Box>
);

const PayrollManagementPage = () => {
    const { user }    = useAuth();
    const navigate    = useNavigate();
    const [tab, setTab]               = useState(0);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [payrollSettings, setPayrollSettings] = useState(() => {
        const saved = sessionStorage.getItem('payroll-settings');
        return saved ? JSON.parse(saved) : {
            basicPercentage: 40, hraPercentage: 20, allowancesPercentage: 15,
            pfPercentage: 12, esiPercentage: 0.75, professionalTax: 200,
            overtimeRate: 150, unpaidLeaveDeduction: 1000, tdsPercentage: 5,
        };
    });

    const [employees, setEmployees] = useState(() => {
        const saved = sessionStorage.getItem('payroll-employees');
        return saved ? JSON.parse(saved) : [];
    });

    useEffect(() => {
        if (user && !PAYROLL_ROLES.includes(user.role)) navigate('/dashboard');
    }, [user, navigate]);

    useEffect(() => { sessionStorage.setItem('payroll-settings', JSON.stringify(payrollSettings)); }, [payrollSettings]);
    useEffect(() => { sessionStorage.setItem('payroll-employees', JSON.stringify(employees)); }, [employees]);

    if (!user || !PAYROLL_ROLES.includes(user.role)) {
        return (
            <Box sx={{ bgcolor: SURFACE, p: 4 }}>
                <Alert severity="error" sx={{ borderRadius: '8px' }}>
                    You do not have permission to access this page.
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ bgcolor: SURFACE }}>
            {/* ── Page header ── */}
            <PageHeroHeader
                eyebrow="HR Management"
                title="Payroll"
                description="Manage payruns, salary structures, and payslips."
                icon={<PaymentsIcon />}
                actionArea={
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBack />}
                        onClick={() => navigate('/admin/dashboard')}
                        sx={{
                            textTransform: 'none',
                            borderRadius: '8px',
                            borderColor: BORDER,
                            color: MUTED,
                            fontSize: '0.875rem',
                            '&:hover': {
                                borderColor: RED,
                                color: RED,
                                bgcolor: '#FFF5F5',
                            },
                        }}
                    >
                        Back
                    </Button>
                }
            />

            <Box sx={{ px: { xs: 2, md: 4 }, pb: 4 }}>
                {/* ── Tab bar ── */}
                <Paper elevation={0} sx={{
                    borderRadius: '12px', border: `1px solid ${BORDER}`,
                    overflow: 'hidden', mb: 2,
                }}>
                    <Tabs
                        value={tab}
                        onChange={(_, v) => setTab(v)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{
                            '& .MuiTab-root': {
                                textTransform: 'none', fontWeight: 500,
                                fontSize: '0.875rem', color: MUTED,
                                minHeight: 52, px: 3,
                                '&:hover': { color: '#1A1A1A' },
                            },
                            '& .Mui-selected':       { color: RED, fontWeight: 600 },
                            '& .MuiTabs-indicator':  { bgcolor: RED, height: 2.5 },
                        }}
                    >
                        <Tab icon={<Dashboard sx={{ fontSize: 18 }} />} iconPosition="start" label="Dashboard" />
                        <Tab icon={<PlaylistAdd sx={{ fontSize: 18 }} />} iconPosition="start" label="Payruns" />
                        <Tab icon={<People sx={{ fontSize: 18 }} />} iconPosition="start" label="Employee Salaries" />
                        <Tab icon={<Settings sx={{ fontSize: 18 }} />} iconPosition="start" label="Settings" />
                        <Tab icon={<Calculate sx={{ fontSize: 18 }} />} iconPosition="start" label="Calculator" />
                    </Tabs>
                </Paper>

                {/* ── Tab content ── */}
                <Suspense fallback={<TabLoader />}>
                    {/* Dashboard */}
                    {tab === 0 && <PayrollDashboard />}

                    {/* Payruns */}
                    {tab === 1 && (
                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                                <Button variant="contained" startIcon={<PlaylistAdd />}
                                    onClick={() => setWizardOpen(true)} sx={primaryBtnSx}>
                                    New Payrun
                                </Button>
                            </Box>
                            <PayrunListTab refreshTrigger={refreshTrigger} />
                        </Box>
                    )}

                    {/* Employee Salaries */}
                    {tab === 2 && (
                        <PayrollTable
                            employees={employees}
                            onEmployeesUpdate={newEmps => { setEmployees(newEmps); setRefreshTrigger(t => t + 1); }}
                            settings={payrollSettings}
                        />
                    )}

                    {/* Settings */}
                    {tab === 3 && (
                        <PayrollSettings
                            settings={payrollSettings}
                            onSettingsUpdate={s => { setPayrollSettings(s); setRefreshTrigger(t => t + 1); }}
                        />
                    )}

                    {/* Calculator */}
                    {tab === 4 && <PayrollCalculator settings={payrollSettings} />}
                </Suspense>
            </Box>

            {/* Payrun Creation Wizard */}
            <PayrunWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
        </Box>
    );
};

export default PayrollManagementPage;
