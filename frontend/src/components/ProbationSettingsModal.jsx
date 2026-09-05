// frontend/src/components/ProbationSettingsModal.jsx

import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, Select, MenuItem, InputLabel, FormControl, Box, Stack, Divider, Typography, Paper, Alert, Chip, Tooltip, FormControlLabel, Switch } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import api from '../api/axios';

import { SkeletonBox } from '../components/SkeletonLoaders';
const formSectionStyles = {
    p: 2.5,
    borderRadius: '16px',
    border: '1px solid',
    borderColor: 'divider',
    backgroundColor: '#fafafa'
};

const formControlStyles = {
    '& .MuiOutlinedInput-root': { borderRadius: '12px' },
    '& .MuiInputBase-root': { borderRadius: '12px' }
};

const ProbationSettingsModal = ({ open, onClose, employee, onSave }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [probationData, setProbationData] = useState(null);
    
    const [formData, setFormData] = useState({
        employeeType: 'On-Role',
        probationStatus: 'None',
        conversionDate: '',
        probationDurationMonths: 3
    });

    useEffect(() => {
        if (open && employee) {
            fetchProbationStatus();
        }
    }, [open, employee]);

    const fetchProbationStatus = async () => {
        try {
            setLoading(true);
            const { data } = await api.get(`/admin/employees/${employee._id}/probation-status`);
            setProbationData(data.employee);
            
            setFormData({
                employeeType: data.employee.employeeType || 'On-Role',
                probationStatus: data.employee.probationStatus || 'None',
                conversionDate: data.employee.conversionDate 
                    ? new Date(data.employee.conversionDate).toISOString().slice(0, 10) 
                    : '',
                probationDurationMonths: data.employee.probationDurationMonths || 3
            });
        } catch (err) {
            setError('Failed to fetch probation status');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.conversionDate && formData.employeeType === 'On-Role' && formData.probationStatus === 'On Probation') {
            setError('Conversion date is required when setting employee on probation');
            return;
        }

        try {
            setLoading(true);
            const { data } = await api.post(`/admin/employees/${employee._id}/probation-settings`, formData);
            setSuccess(data.message || 'Probation settings updated successfully!');
            
            // Refresh data
            await fetchProbationStatus();
            
            if (onSave) {
                onSave();
            }
            
            setTimeout(() => {
                setSuccess('');
            }, 3000);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update probation settings');
        } finally {
            setLoading(false);
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'On Probation':
                return <HourglassEmptyIcon fontSize="small" />;
            case 'Permanent':
                return <CheckCircleIcon fontSize="small" />;
            default:
                return <PersonIcon fontSize="small" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'On Probation':
                return 'warning';
            case 'Permanent':
                return 'success';
            case 'Intern':
                return 'info';
            default:
                return 'default';
        }
    };

    const calculateEndDate = () => {
        if (formData.conversionDate && formData.probationDurationMonths) {
            const startDate = new Date(formData.conversionDate);
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + parseInt(formData.probationDurationMonths));
            return endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        return 'N/A';
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: '24px' } }}>
            <DialogTitle sx={{ p: 3, pb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <SettingsIcon sx={{ color: '#D32F2F' }} />
                    <Typography variant="h6">⚙️ Probation Settings & Intern Conversion</Typography>
                </Box>
                {employee && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1, ml: 4.5 }}>
                        Managing probation settings for {employee.fullName} ({employee.employeeCode})
                    </Typography>
                )}
            </DialogTitle>

            <DialogContent sx={{ p: 3, backgroundColor: '#f9fafb' }}>
                <Stack spacing={3}>
                    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
                    {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

                    {loading && !probationData ? (
                        <Box display="flex" justifyContent="center" py={4}>
                            <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                        </Box>
                    ) : (
                        <>
                            {/* Employee Details Section */}
                            <Paper component={Stack} spacing={2} sx={formSectionStyles}>
                                <Typography variant="subtitle1" fontWeight={600} display="flex" alignItems="center" gap={1}>
                                    <PersonIcon fontSize="small" /> Employee Details
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="Employee Name"
                                            value={employee?.fullName || ''}
                                            fullWidth
                                            disabled
                                            sx={formControlStyles}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            label="Employee ID"
                                            value={employee?.employeeCode || ''}
                                            fullWidth
                                            disabled
                                            sx={formControlStyles}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <TextField
                                            label="Department"
                                            value={employee?.department || 'N/A'}
                                            fullWidth
                                            disabled
                                            sx={formControlStyles}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <TextField
                                            label="Designation"
                                            value={employee?.designation || 'N/A'}
                                            fullWidth
                                            disabled
                                            sx={formControlStyles}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <TextField
                                            label="Join Date"
                                            value={employee?.joiningDate 
                                                ? new Date(employee.joiningDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                                                : 'N/A'}
                                            fullWidth
                                            disabled
                                            sx={formControlStyles}
                                        />
                                    </Grid>
                                    {probationData && (
                                        <Grid item xs={12}>
                                            <Box display="flex" gap={1} flexWrap="wrap">
                                                <Chip 
                                                    icon={getStatusIcon(probationData.probationStatus)}
                                                    label={`Status: ${probationData.probationStatus || 'Not Set'}`}
                                                    color={getStatusColor(probationData.probationStatus)}
                                                    variant="outlined"
                                                />
                                                <Chip 
                                                    label={`Type: ${probationData.employeeType || 'On-Role'}`}
                                                    color={probationData.employeeType === 'Intern' ? 'info' : 'primary'}
                                                    variant="outlined"
                                                />
                                                {probationData.remainingDays !== null && probationData.remainingDays > 0 && (
                                                    <Chip 
                                                        label={`Remaining Days: ${probationData.remainingDays}`}
                                                        color="warning"
                                                        variant="filled"
                                                    />
                                                )}
                                            </Box>
                                        </Grid>
                                    )}
                                </Grid>
                            </Paper>

                            {/* Conversion Controls Section */}
                            <Paper component={Stack} spacing={2} sx={formSectionStyles}>
                                <Typography variant="subtitle1" fontWeight={600} display="flex" alignItems="center" gap={1}>
                                    <CalendarTodayIcon fontSize="small" /> Conversion Controls
                                </Typography>
                                
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <FormControl fullWidth sx={formControlStyles}>
                                            <InputLabel>Employee Type</InputLabel>
                                            <Select
                                                name="employeeType"
                                                label="Employee Type"
                                                value={formData.employeeType}
                                                onChange={handleChange}
                                            >
                                                <MenuItem value="Intern">Intern</MenuItem>
                                                <MenuItem value="On-Role">On-Role</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                            Select whether employee is an intern or on-role
                                        </Typography>
                                    </Grid>

                                    <Grid item xs={12} sm={6}>
                                        <FormControl fullWidth sx={formControlStyles}>
                                            <InputLabel>Probation Status</InputLabel>
                                            <Select
                                                name="probationStatus"
                                                label="Probation Status"
                                                value={formData.probationStatus}
                                                onChange={handleChange}
                                            >
                                                <MenuItem value="None">None</MenuItem>
                                                <MenuItem value="On Probation">On Probation</MenuItem>
                                                <MenuItem value="Permanent">Permanent</MenuItem>
                                            </Select>
                                        </FormControl>
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                            Current probation status of the employee
                                        </Typography>
                                    </Grid>

                                    {formData.employeeType === 'On-Role' && formData.probationStatus !== 'None' && (
                                        <>
                                            <Grid item xs={12} sm={6}>
                                                <TextField
                                                    name="conversionDate"
                                                    label="Conversion Date (Intern → On-Role)"
                                                    type="date"
                                                    value={formData.conversionDate}
                                                    onChange={handleChange}
                                                    fullWidth
                                                    InputLabelProps={{ shrink: true }}
                                                    sx={formControlStyles}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                    Date when employee was converted from Intern to On-Role
                                                </Typography>
                                            </Grid>

                                            <Grid item xs={12} sm={6}>
                                                <FormControl fullWidth sx={formControlStyles}>
                                                    <InputLabel>Probation Duration</InputLabel>
                                                    <Select
                                                        name="probationDurationMonths"
                                                        label="Probation Duration"
                                                        value={formData.probationDurationMonths}
                                                        onChange={handleChange}
                                                    >
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => (
                                                            <MenuItem key={month} value={month}>
                                                                {month} Month{month > 1 ? 's' : ''}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                    Defines how long the employee remains under review after conversion
                                                </Typography>
                                            </Grid>

                                            <Grid item xs={12}>
                                                <Alert severity="info" icon={<CalendarTodayIcon />}>
                                                    <Typography variant="subtitle2" fontWeight={600}>
                                                        Auto-Calculated End Date: {calculateEndDate()}
                                                    </Typography>
                                                    <Typography variant="caption">
                                                        The probation will automatically end on this date, and the employee will be marked as Permanent.
                                                    </Typography>
                                                </Alert>
                                            </Grid>
                                        </>
                                    )}
                                </Grid>
                            </Paper>

                            {/* Current Probation Info */}
                            {probationData && probationData.probationStartDate && (
                                <Paper component={Stack} spacing={2} sx={{ ...formSectionStyles, backgroundColor: '#e8f5e9' }}>
                                    <Typography variant="subtitle1" fontWeight={600} display="flex" alignItems="center" gap={1}>
                                        <CheckCircleIcon fontSize="small" /> Current Probation Information
                                    </Typography>
                                    <Grid container spacing={2}>
                                        {probationData.conversionDate && (
                                            <Grid item xs={12} sm={6}>
                                                <Typography variant="body2" color="text.secondary">Conversion Date</Typography>
                                                <Typography variant="body1" fontWeight={600}>
                                                    {new Date(probationData.conversionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                                </Typography>
                                            </Grid>
                                        )}
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">Probation Start Date</Typography>
                                            <Typography variant="body1" fontWeight={600}>
                                                {new Date(probationData.probationStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                            </Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">Probation End Date</Typography>
                                            <Typography variant="body1" fontWeight={600}>
                                                {probationData.probationEndDate 
                                                    ? new Date(probationData.probationEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                                                    : 'N/A'}
                                            </Typography>
                                        </Grid>
                                        {probationData.remainingDays !== null && (
                                            <Grid item xs={12} sm={6}>
                                                <Typography variant="body2" color="text.secondary">Remaining Days</Typography>
                                                <Typography variant="body1" fontWeight={600} color={probationData.remainingDays > 30 ? 'success.main' : 'warning.main'}>
                                                    {probationData.remainingDays > 0 
                                                        ? `${probationData.remainingDays} days` 
                                                        : probationData.probationStatus === 'On Probation'
                                                            ? 'Probation period ended'
                                                            : 'N/A'}
                                                </Typography>
                                            </Grid>
                                        )}
                                    </Grid>
                                </Paper>
                            )}
                        </>
                    )}
                </Stack>
            </DialogContent>

            <Divider />
            <DialogActions sx={{ p: '16px 24px' }}>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Button 
                    onClick={handleSubmit} 
                    variant="contained" 
                    disabled={loading}
                    sx={{ borderRadius: '12px', minWidth: '120px' }}
                >
                    {loading ? <SkeletonBox width="24px" height="24px" borderRadius="50%" /> : 'Save Settings'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ProbationSettingsModal;

