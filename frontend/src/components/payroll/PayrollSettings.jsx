// frontend/src/components/payroll/PayrollSettings.jsx

import React, { useState } from 'react';
import {
  Box,
  Grid,
  Typography,
  TextField,
  Button,
  Divider,
  Alert,
  InputAdornment,
  Tooltip,
  IconButton
} from '@mui/material';
import { Save, RestartAlt, Info } from '@mui/icons-material';

const PayrollSettings = ({ settings, onSettingsUpdate }) => {
  const [formData, setFormData] = useState(() => {
    // Keep values as strings to avoid cursor jump and per-char overwrite in number inputs
    const initial = { ...settings };
    Object.keys(initial).forEach((key) => {
      initial[key] = String(initial[key] ?? '');
    });
    return initial;
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleChange = (field) => (event) => {
    const { value } = event.target;
    // Store raw string to keep typing fluid; validation happens in calculations/save
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Convert to numbers safely when saving
    const normalized = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, isNaN(parseFloat(v)) ? 0 : parseFloat(v)])
    );
    onSettingsUpdate(normalized);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleReset = () => {
    const defaultSettings = {
      basicPercentage: 40,
      hraPercentage: 20,
      allowancesPercentage: 15,
      pfPercentage: 12,
      esiPercentage: 0.75,
      professionalTax: 200,
      overtimeRate: 150,
      unpaidLeaveDeduction: 0,
      tdsPercentage: 5
    };
    setFormData(defaultSettings);
  };

  const SettingField = ({ label, field, suffix = '%', tooltip, min = 0, max = 100 }) => (
    <Grid item xs={12} md={6}>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'var(--text-primary)' }}>
            {label}
          </Typography>
          {tooltip && (
            <Tooltip title={tooltip} arrow>
              <IconButton size="small" sx={{ ml: 0.5, padding: 0.5 }}>
                <Info fontSize="small" sx={{ fontSize: '1rem', color: 'var(--text-secondary)' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <TextField
          type="number"
          value={formData[field]}
          onChange={handleChange(field)}
          fullWidth
          variant="outlined"
          size="small"
          InputProps={{
            endAdornment: <InputAdornment position="end">{suffix}</InputAdornment>,
          }}
          inputProps={{
            min: min,
            max: max,
            step: suffix === '%' ? 0.1 : 1
          }}
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
      </Box>
    </Grid>
  );

  // Calculate preview
  const sampleCTC = 1000000;
  const basicPct = parseFloat(formData.basicPercentage) || 0;
  const hraPct = parseFloat(formData.hraPercentage) || 0;
  const allowancesPct = parseFloat(formData.allowancesPercentage) || 0;
  const pfPct = parseFloat(formData.pfPercentage) || 0;
  const esiPct = parseFloat(formData.esiPercentage) || 0;
  const tdsPct = parseFloat(formData.tdsPercentage) || 0;
  const professionalTaxVal = parseFloat(formData.professionalTax) || 0;

  const basic = (sampleCTC * basicPct) / 100;
  const hra = (sampleCTC * hraPct) / 100;
  const allowances = (sampleCTC * allowancesPct) / 100;
  const grossPay = basic + hra + allowances;
  
  const pf = (basic * pfPct) / 100;
  const esi = (grossPay * esiPct) / 100;
  const tds = (grossPay * tdsPct) / 100;
  const totalDeductions = pf + esi + (professionalTaxVal * 12) + tds;
  
  const netPay = grossPay - totalDeductions;

  return (
    <Box>
      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Payroll settings saved successfully!
        </Alert>
      )}

      <Box className="card">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography className="card-title">
            Salary Structure Configuration
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<RestartAlt />}
              onClick={handleReset}
              className="btn-secondary"
            >
              Reset to Default
            </Button>
            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSave}
              className="btn-primary"
            >
              Save Settings
            </Button>
          </Box>
        </Box>
        <Divider sx={{ mb: 3, borderColor: 'var(--border-color)' }} />

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '1.1rem', mb: 2 }}>
              Salary Components (% of CTC)
            </Typography>
          </Grid>

          <SettingField
            label="Basic Salary"
            field="basicPercentage"
            tooltip="Base salary component - typically 40-50% of CTC"
          />
          <SettingField
            label="House Rent Allowance (HRA)"
            field="hraPercentage"
            tooltip="Housing allowance - typically 20-30% of CTC"
          />
          <SettingField
            label="Other Allowances"
            field="allowancesPercentage"
            tooltip="Includes travel, medical, and other allowances"
          />

          <Grid item xs={12}>
            <Divider sx={{ my: 2, borderColor: 'var(--border-color)' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '1.1rem', mb: 2 }}>
              Deductions
            </Typography>
          </Grid>

          <SettingField
            label="Provident Fund (PF)"
            field="pfPercentage"
            tooltip="Employee + Employer contribution - typically 12% each"
          />
          <SettingField
            label="ESI Contribution"
            field="esiPercentage"
            tooltip="Employee State Insurance - typically 0.75%"
            max={5}
          />
          <SettingField
            label="Professional Tax"
            field="professionalTax"
            suffix="₹"
            tooltip="Fixed professional tax per month"
            max={2500}
          />
          <SettingField
            label="TDS (Tax Deducted at Source)"
            field="tdsPercentage"
            tooltip="Income tax deduction - varies by salary slab"
            max={30}
          />

          <Grid item xs={12}>
            <Divider sx={{ my: 2, borderColor: 'var(--border-color)' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--accent-red)', fontSize: '1.1rem', mb: 2 }}>
              Additional Settings
            </Typography>
          </Grid>

          <SettingField
            label="Overtime Rate (per hour)"
            field="overtimeRate"
            suffix="₹"
            tooltip="Hourly rate for overtime work"
            max={10000}
          />
          <SettingField
            label="LOP Loss of Pay Deduction (per day)"
            field="unpaidLeaveDeduction"
            suffix="₹"
            tooltip="Deduction amount per unpaid leave day"
            max={10000}
          />
        </Grid>
      </Box>

      {/* Preview Section */}
      <Box className="card" sx={{ mt: 3, backgroundColor: '#f8f9fa' }}>
        <Typography className="card-title" sx={{ mb: 2 }}>
          Calculation Preview (Sample CTC: ₹10,00,000/year)
        </Typography>
        <Divider sx={{ mb: 3, borderColor: 'var(--border-color)' }} />

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Box sx={{ p: 2, backgroundColor: 'white', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <Typography variant="subtitle2" sx={{ color: 'var(--text-secondary)', mb: 2, textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 600 }}>
                EARNINGS
              </Typography>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Basic Salary:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  ₹{basic.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">HRA:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  ₹{hra.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Allowances:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  ₹{allowances.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              <Divider sx={{ my: 1.5, borderColor: 'var(--border-color)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--accent-green)' }}>
                  Gross Pay:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--accent-green)' }}>
                  ₹{grossPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item xs={12} md={4}>
            <Box sx={{ p: 2, backgroundColor: 'white', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <Typography variant="subtitle2" sx={{ color: 'var(--text-secondary)', mb: 2, textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 600 }}>
                DEDUCTIONS
              </Typography>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">PF:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  ₹{pf.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">ESI:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  ₹{esi.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Professional Tax:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  ₹{(professionalTaxVal * 12).toLocaleString('en-IN')}
                </Typography>
              </Box>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">TDS:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  ₹{tds.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
              <Divider sx={{ my: 1.5, borderColor: 'var(--border-color)' }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--accent-red)' }}>
                  Total Deductions:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--accent-red)' }}>
                  ₹{totalDeductions.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Typography>
              </Box>
            </Box>
          </Grid>

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
                NET PAY (Monthly)
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 700, mb: 1, color: '#111111' }}>
                ₹{(netPay / 12).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
                Annual: ₹{netPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
};

export default PayrollSettings;
