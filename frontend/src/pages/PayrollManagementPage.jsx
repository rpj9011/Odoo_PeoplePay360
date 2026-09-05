// frontend/src/pages/PayrollManagementPage.jsx

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Box, Typography, Tabs, Tab, IconButton, Alert, Paper, Card, CardContent } from '@mui/material';
import { ArrowBack, Dashboard, People, Settings, Calculate } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/payroll/PayrollManagementPage.css';

// Lazy load payroll components for better code splitting
const PayrollDashboard = lazy(() => import('../components/payroll/PayrollDashboard'));
const PayrollSettings = lazy(() => import('../components/payroll/PayrollSettings'));
const PayrollCalculator = lazy(() => import('../components/payroll/PayrollCalculator'));
const PayrollTable = lazy(() => import('../components/payroll/PayrollTable'));

import { SkeletonBox } from '../components/SkeletonLoaders';
const PayrollManagementPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [payrollSettings, setPayrollSettings] = useState(() => {
    const saved = sessionStorage.getItem('payroll-settings');
    return saved ? JSON.parse(saved) : {
      basicPercentage: 40,
      hraPercentage: 20,
      allowancesPercentage: 15,
      pfPercentage: 12,
      esiPercentage: 0.75,
      professionalTax: 200,
      overtimeRate: 150,
      unpaidLeaveDeduction: 1000,
      tdsPercentage: 5
    };
  });

  const [employees, setEmployees] = useState(() => {
    const saved = sessionStorage.getItem('payroll-employees');
    return saved ? JSON.parse(saved) : [];
  });

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Check if user has access
  useEffect(() => {
    if (user && user.role !== 'Admin' && user.role !== 'HR') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Save settings to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('payroll-settings', JSON.stringify(payrollSettings));
  }, [payrollSettings]);

  // Save employees to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('payroll-employees', JSON.stringify(employees));
  }, [employees]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleBackToAnalytics = () => {
    navigate('/admin/dashboard');
  };

  const handleSettingsUpdate = (newSettings) => {
    setPayrollSettings(newSettings);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleEmployeesUpdate = (newEmployees) => {
    setEmployees(newEmployees);
    setRefreshTrigger(prev => prev + 1);
  };

  if (!user || (user.role !== 'Admin' && user.role !== 'HR')) {
    return (
      <Box className="payroll-page-container" sx={{ padding: '24px' }}>
        <Alert severity="error">
          You do not have permission to access this page.
        </Alert>
      </Box>
    );
  }

  return (
      <Box sx={{ 
        minHeight: '100vh',
        background: '#ffffff',
        padding: '24px'
      }}>
      {/* Header */}
      <Paper elevation={0} sx={{ 
        background: 'linear-gradient(135deg, #2C3E50 0%, #34495e 100%)',
        borderRadius: '20px',
        padding: '32px',
        marginBottom: '24px',
        border: '1px solid #2C3E50'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <IconButton 
            onClick={handleBackToAnalytics}
            sx={{ 
              background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
              color: '#2C3E50',
              '&:hover': {
                background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                transform: 'scale(1.05)'
              },
              transition: 'all 0.3s ease',
              borderRadius: '12px',
              padding: '12px',
              border: '1px solid #ffffff'
            }}
          >
            <ArrowBack />
          </IconButton>
          
          <Box sx={{ flex: 1 }}>
            <Typography variant="h3" sx={{ 
              fontWeight: 700, 
              color: '#ffffff',
              textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
              mb: 1
            }}>
              💰 Payroll Management System
            </Typography>
            <Typography variant="h6" sx={{ 
              color: '#f8f9fa',
              fontWeight: 400,
              lineHeight: 1.5,
              textShadow: '1px 1px 2px rgba(0,0,0,0.2)'
            }}>
              Manage employee payroll structures, salary calculations, and deductions with ease
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Enhanced Tabs Navigation */}
      <Paper elevation={0} sx={{ 
        background: '#ffffff',
        borderRadius: '20px',
        marginBottom: '24px',
        border: '1px solid #e9ecef',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange}
          variant="fullWidth"
          sx={{
            '& .MuiTab-root': {
              color: '#6c757d',
              fontWeight: 600,
              textTransform: 'none',
              fontSize: '16px',
              padding: '20px 16px',
              transition: 'all 0.3s ease',
              '&:hover': {
                color: '#2C3E50',
                background: '#f8f9fa'
              }
            },
            '& .Mui-selected': {
              color: '#2C3E50 !important',
              background: '#f8f9fa'
            },
            '& .MuiTabs-indicator': {
              height: '4px',
              background: '#2C3E50',
              borderRadius: '2px'
            }
          }}
        >
          <Tab 
            icon={<Dashboard sx={{ fontSize: '20px', mb: 0.5 }} />} 
            label="Dashboard" 
            iconPosition="top"
          />
          <Tab 
            icon={<People sx={{ fontSize: '20px', mb: 0.5 }} />} 
            label="Employee Salaries" 
            iconPosition="top"
          />
          <Tab 
            icon={<Settings sx={{ fontSize: '20px', mb: 0.5 }} />} 
            label="Payroll Settings" 
            iconPosition="top"
          />
          <Tab 
            icon={<Calculate sx={{ fontSize: '20px', mb: 0.5 }} />} 
            label="Payroll Calculator" 
            iconPosition="top"
          />
        </Tabs>
      </Paper>

      {/* Tab Panels with Enhanced Styling */}
      <Box sx={{ 
        background: '#ffffff',
        borderRadius: '20px',
        padding: '32px',
        border: '1px solid #e9ecef',
        minHeight: '600px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <Suspense fallback={
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '400px',
            flexDirection: 'column',
            gap: 2
          }}>
            <SkeletonBox width="48px" height="48px" borderRadius="50%" />
            <Typography variant="body1" sx={{ color: '#6c757d' }}>
              Loading component...
            </Typography>
          </Box>
        }>
          {tabValue === 0 && (
            <PayrollDashboard 
              employees={employees}
              settings={payrollSettings}
              refreshTrigger={refreshTrigger}
            />
          )}
          
          {tabValue === 1 && (
            <PayrollTable 
              employees={employees}
              onEmployeesUpdate={handleEmployeesUpdate}
              settings={payrollSettings}
            />
          )}
          
          {tabValue === 2 && (
            <PayrollSettings 
              settings={payrollSettings}
              onSettingsUpdate={handleSettingsUpdate}
            />
          )}
          
          {tabValue === 3 && (
            <PayrollCalculator 
              settings={payrollSettings}
            />
          )}
        </Suspense>
      </Box>
    </Box>
  );
};

export default PayrollManagementPage;

