// frontend/src/components/payroll/PayrollDialog.jsx

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
  Box,
  Divider,
  InputAdornment,
  Paper
} from '@mui/material';
import { Save, Close } from '@mui/icons-material';

const PayrollDialog = ({ open, onClose, onSave, employee, settings }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: '',
    designation: '',
    ctc: '',
    overtimeHours: '0',
    unpaidLeaveDays: '0',
    bonus: '0'
  });

  const [calculatedData, setCalculatedData] = useState(null);

  useEffect(() => {
    if (employee) {
      setFormData({
        name: employee.name || '',
        email: employee.email || '',
        department: employee.department || '',
        designation: employee.designation || '',
        ctc: employee.ctc || '',
        overtimeHours: employee.overtimeHours || '0',
        unpaidLeaveDays: employee.unpaidLeaveDays || '0',
        bonus: employee.bonus || '0'
      });
    } else {
      setFormData({
        name: '',
        email: '',
        department: '',
        designation: '',
        ctc: '',
        overtimeHours: '0',
        unpaidLeaveDays: '0',
        bonus: '0'
      });
    }
  }, [employee, open]);

  useEffect(() => {
    if (formData.ctc) {
      calculateSalary();
    }
  }, [formData, settings]);

  const handleChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const calculateSalary = () => {
    const ctcValue = parseFloat(formData.ctc) || 0;
    const overtimeValue = parseFloat(formData.overtimeHours) || 0;
    const leaveValue = parseFloat(formData.unpaidLeaveDays) || 0;
    const bonusValue = parseFloat(formData.bonus) || 0;

    if (ctcValue === 0) {
      setCalculatedData(null);
      return;
    }

    // Calculate salary components
    const basic = (ctcValue * settings.basicPercentage) / 100;
    const hra = (ctcValue * settings.hraPercentage) / 100;
    const allowances = (ctcValue * settings.allowancesPercentage) / 100;
    const grossPay = basic + hra + allowances;

    // Calculate deductions
    const pf = (basic * settings.pfPercentage) / 100;
    const esi = (grossPay * settings.esiPercentage) / 100;
    const tds = (grossPay * settings.tdsPercentage) / 100;
    const overtimePay = overtimeValue * settings.overtimeRate;
    const leaveDeduction = leaveValue * settings.unpaidLeaveDeduction;

    const totalDeductions = pf + esi + settings.professionalTax + tds + leaveDeduction;
    const totalEarnings = grossPay + overtimePay + bonusValue;
    const netPay = totalEarnings - totalDeductions;

    setCalculatedData({
      basic,
      hra,
      allowances,
      grossPay,
      pf,
      esi,
      tds,
      overtimePay,
      leaveDeduction,
      totalDeductions,
      totalEarnings,
      netPay
    });
  };

  const handleSave = () => {
    if (!formData.name || !formData.ctc) {
      alert('Please fill in required fields: Name and CTC');
      return;
    }

    const employeeData = {
      ...formData,
      ...calculatedData,
      ctc: parseFloat(formData.ctc),
      overtimeHours: parseFloat(formData.overtimeHours) || 0,
      unpaidLeaveDays: parseFloat(formData.unpaidLeaveDays) || 0,
      bonus: parseFloat(formData.bonus) || 0
    };

    onSave(employeeData);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, #2C3E50 0%, #34495e 100%)',
        fontWeight: 600,
        fontSize: '1.25rem',
        color: 'white',
        borderBottom: '1px solid #34495e',
        borderRadius: '12px 12px 0 0'
      }}>
        {employee ? 'Edit Employee Salary' : 'Add Employee Salary'}
      </DialogTitle>
      
      <DialogContent sx={{ mt: 2 }}>
        <Grid container spacing={3}>
          {/* Employee Details */}
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1a237e', mb: 2 }}>
              Employee Information
            </Typography>
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Employee Name *"
              value={formData.name}
              onChange={handleChange('name')}
              fullWidth
              variant="outlined"
              size="small"
              disabled={!!employee}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: 'var(--accent-red)',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: 'var(--accent-red)',
                  },
                },
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Email"
              value={formData.email}
              onChange={handleChange('email')}
              fullWidth
              variant="outlined"
              type="email"
              disabled={!!employee}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Department"
              value={formData.department}
              onChange={handleChange('department')}
              fullWidth
              variant="outlined"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Designation"
              value={formData.designation}
              onChange={handleChange('designation')}
              fullWidth
              variant="outlined"
            />
          </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2, borderColor: 'var(--border-color)' }} />
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '1.1rem', mb: 2 }}>
                Salary Details
              </Typography>
            </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Annual CTC *"
              value={formData.ctc}
              onChange={handleChange('ctc')}
              fullWidth
              variant="outlined"
              type="number"
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Bonus / Incentive"
              value={formData.bonus}
              onChange={handleChange('bonus')}
              fullWidth
              variant="outlined"
              type="number"
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Overtime Hours (Monthly)"
              value={formData.overtimeHours}
              onChange={handleChange('overtimeHours')}
              fullWidth
              variant="outlined"
              type="number"
              InputProps={{
                endAdornment: <InputAdornment position="end">hrs</InputAdornment>,
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="LOP Loss of Pay Days (Monthly)"
              value={formData.unpaidLeaveDays}
              onChange={handleChange('unpaidLeaveDays')}
              fullWidth
              variant="outlined"
              type="number"
              InputProps={{
                endAdornment: <InputAdornment position="end">days</InputAdornment>,
              }}
            />
          </Grid>

          {/* Salary Breakdown */}
          {calculatedData && (
            <>
              <Grid item xs={12}>
                <Divider sx={{ my: 2, borderColor: 'var(--border-color)' }} />
                <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '1.1rem', mb: 2 }}>
                  Calculated Salary Breakdown
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Paper sx={{ p: 3, backgroundColor: '#f8f9fa' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Basic Salary:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          ₹{calculatedData.basic.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">HRA:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          ₹{calculatedData.hra.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Allowances:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          ₹{calculatedData.allowances.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: '#28a745' }}>
                          Gross Pay:
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: '#28a745' }}>
                          ₹{calculatedData.grossPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">PF:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          ₹{calculatedData.pf.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">ESI:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          ₹{calculatedData.esi.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">TDS:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          ₹{calculatedData.tds.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: '#dc3545' }}>
                          Total Deductions:
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, color: '#dc3545' }}>
                          ₹{calculatedData.totalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                    </Grid>

                    <Grid item xs={12}>
                      <Divider sx={{ my: 2 }} />
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        backgroundColor: '#e3f2fd',
                        color: 'black',
                        p: 2,
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
                        border: '2px solid #2196f3'
                      }}>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'black' }}>
                          NET PAY (Annual):
                        </Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'black' }}>
                          ₹{calculatedData.netPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'center',
                        mt: 1
                      }}>
                        <Typography variant="body2" sx={{ color: '#6c757d' }}>
                          Monthly: ₹{(calculatedData.netPay / 12).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ p: 3, backgroundColor: 'var(--page-bg)', borderTop: '1px solid var(--border-color)' }}>
        <Button
          onClick={onClose}
          startIcon={<Close />}
          className="btn-secondary"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          startIcon={<Save />}
          className="btn-primary"
        >
          Save Salary
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PayrollDialog;

