// frontend/src/components/payroll/PayrollCalculator.jsx

import React, { useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  Divider,
  InputAdornment,
  Card,
  CardContent,
  Alert
} from '@mui/material';
import { Calculate, Clear } from '@mui/icons-material';

const PayrollCalculator = ({ settings }) => {
  const [ctc, setCtc] = useState('');
  const [overtimeHours, setOvertimeHours] = useState('');
  const [unpaidLeaveDays, setUnpaidLeaveDays] = useState('');
  const [bonus, setBonus] = useState('');
  const [result, setResult] = useState(null);

  const handleCalculate = () => {
    const ctcValue = parseFloat(ctc) || 0;
    const overtimeValue = parseFloat(overtimeHours) || 0;
    const leaveValue = parseFloat(unpaidLeaveDays) || 0;
    const bonusValue = parseFloat(bonus) || 0;

    // Calculate components
    const basic = (ctcValue * settings.basicPercentage) / 100;
    const hra = (ctcValue * settings.hraPercentage) / 100;
    const allowances = (ctcValue * settings.allowancesPercentage) / 100;
    const grossPay = basic + hra + allowances;

    // Calculate deductions
    const pf = (basic * settings.pfPercentage) / 100;
    const esi = (grossPay * settings.esiPercentage) / 100;
    const professionalTax = settings.professionalTax;
    const tds = (grossPay * settings.tdsPercentage) / 100;
    
    // Additional calculations
    const overtimePay = overtimeValue * settings.overtimeRate;
    const leaveDeduction = leaveValue * settings.unpaidLeaveDeduction;
    
    const totalDeductions = pf + esi + professionalTax + tds + leaveDeduction;
    const totalEarnings = grossPay + overtimePay + bonusValue;
    const netPay = totalEarnings - totalDeductions;

    setResult({
      ctc: ctcValue,
      basic,
      hra,
      allowances,
      grossPay,
      pf,
      esi,
      professionalTax,
      tds,
      overtimePay,
      leaveDeduction,
      bonus: bonusValue,
      totalDeductions,
      totalEarnings,
      netPay,
      monthlyNetPay: netPay / 12
    });
  };

  const handleClear = () => {
    setCtc('');
    setOvertimeHours('');
    setUnpaidLeaveDays('');
    setBonus('');
    setResult(null);
  };

  return (
    <Box>
      <Box className="card">
        <Typography className="card-title" sx={{ mb: 1 }}>
          Payroll Calculator
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--text-secondary)', mb: 3 }}>
          Calculate employee salary based on CTC and additional factors
        </Typography>
        <Divider sx={{ mb: 3, borderColor: 'var(--border-color)' }} />

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              label="Annual CTC"
              type="number"
              value={ctc}
              onChange={(e) => setCtc(e.target.value)}
              fullWidth
              variant="outlined"
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: '#dc3545',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#dc3545',
                  },
                },
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Overtime Hours (per month)"
              type="number"
              value={overtimeHours}
              onChange={(e) => setOvertimeHours(e.target.value)}
              fullWidth
              variant="outlined"
              InputProps={{
                endAdornment: <InputAdornment position="end">hrs</InputAdornment>,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: '#dc3545',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#dc3545',
                  },
                },
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="LOP Loss of Pay Days (per month)"
              type="number"
              value={unpaidLeaveDays}
              onChange={(e) => setUnpaidLeaveDays(e.target.value)}
              fullWidth
              variant="outlined"
              InputProps={{
                endAdornment: <InputAdornment position="end">days</InputAdornment>,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: '#dc3545',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#dc3545',
                  },
                },
              }}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              label="Bonus / Incentive"
              type="number"
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              fullWidth
              variant="outlined"
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  '&:hover fieldset': {
                    borderColor: '#dc3545',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#dc3545',
                  },
                },
              }}
            />
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2 }}>
              <Button
                variant="contained"
                startIcon={<Calculate />}
                onClick={handleCalculate}
                disabled={!ctc}
                className="btn-primary"
              >
                Calculate Salary
              </Button>
              <Button
                variant="outlined"
                startIcon={<Clear />}
                onClick={handleClear}
                className="btn-secondary"
              >
                Clear
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Box>

      {/* Results Section */}
      {result && (
        <Box className="card" sx={{ mt: 3, backgroundColor: '#f8f9fa' }}>
          <Typography className="card-title" sx={{ mb: 2 }}>
            Calculated Results
          </Typography>
          <Divider sx={{ mb: 3, borderColor: 'var(--border-color)' }} />

          <Grid container spacing={3}>
            {/* Earnings Breakdown */}
            <Grid item xs={12} md={4}>
              <Box sx={{ 
                p: 2,
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                height: '100%'
              }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--accent-green)', mb: 2, textTransform: 'uppercase', fontSize: '0.8rem' }}>
                  💰 EARNINGS
                </Typography>
                  
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Basic Salary</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{result.basic.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">HRA</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{result.hra.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Allowances</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{result.allowances.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                  {result.overtimePay > 0 && (
                    <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Overtime Pay</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#28a745' }}>
                        +₹{result.overtimePay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </Typography>
                    </Box>
                  )}
                  {result.bonus > 0 && (
                    <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Bonus/Incentive</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#28a745' }}>
                        +₹{result.bonus.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#28a745' }}>
                      Total Earnings
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#28a745' }}>
                  ₹{result.totalEarnings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              </Box>
            </Grid>

            {/* Deductions Breakdown */}
            <Grid item xs={12} md={4}>
              <Box sx={{ 
                p: 2,
                backgroundColor: 'white',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                height: '100%'
              }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--accent-red)', mb: 2, textTransform: 'uppercase', fontSize: '0.8rem' }}>
                  📉 DEDUCTIONS
                </Typography>
                  
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Provident Fund</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{result.pf.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">ESI</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{result.esi.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Professional Tax</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{result.professionalTax.toLocaleString('en-IN')}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">TDS</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      ₹{result.tds.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Typography>
                  </Box>
                  {result.leaveDeduction > 0 && (
                    <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="body2" color="text.secondary">Leave Deduction</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#dc3545' }}>
                        -₹{result.leaveDeduction.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#dc3545' }}>
                      Total Deductions
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#dc3545' }}>
                  ₹{result.totalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              </Box>
            </Grid>

            {/* Net Pay */}
            <Grid item xs={12} md={4}>
              <Box sx={{ 
                p: 3,
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                color: '#111111',
                border: '1px solid var(--border-color)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)'
              }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: 'var(--text-primary)' }}>
                  💳 NET SALARY
                </Typography>
                  
                  <Typography variant="body2" sx={{ mb: 1, color: 'var(--text-secondary)' }}>
                    Annual Net Pay
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, mb: 3, color: '#111111' }}>
                    ₹{result.netPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Typography>
                  
                  <Divider sx={{ borderColor: 'var(--border-color)', mb: 3 }} />
                  
                  <Typography variant="body2" sx={{ mb: 1, color: 'var(--text-secondary)' }}>
                    Monthly Net Pay
                  </Typography>
                  <Typography variant="h4" sx={{ fontWeight: 700, color: '#111111' }}>
                    ₹{result.monthlyNetPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Typography>
              </Box>
            </Grid>
          </Grid>

          {/* Summary Alert */}
          <Alert severity="info" sx={{ mt: 3 }}>
            <Typography variant="body2">
              <strong>Summary:</strong> Based on an annual CTC of ₹{result.ctc.toLocaleString('en-IN')}, 
              the employee's monthly take-home salary is ₹{result.monthlyNetPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })} 
              after all deductions and including additional earnings.
            </Typography>
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default PayrollCalculator;

