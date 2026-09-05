// frontend/src/components/EmployeeForm.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    Grid, Select, MenuItem, InputLabel, FormControl, Box, Stack, Typography,
    Chip, OutlinedInput, IconButton, Autocomplete, FormControlLabel, Switch,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import api from '../api/axios';
import { SkeletonBox } from '../components/SkeletonLoaders';

const initialFormState = {
    employeeCode: '',
    fullName: '',
    email: '',
    password: '',
    role: 'Employee',
    domain: '',
    designation: '',
    department: '',
    joiningDate: new Date().toISOString().slice(0, 10),
    shiftGroup: '',
    // reportingPerson stores the manager's ObjectId string (mirrors AdminEmployeeProfileDialog.reportingPersonId)
    reportingPerson: '',
    isActive: true,
    alternateSaturdayPolicy: 'All Saturdays Working',
    employmentStatus: 'Probation',
    probationDurationMonths: 3,
    internshipDurationMonths: 6,
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    leaveBalances: {
        paid: 0,
        sick: 0,
        casual: 0,
    },
};

// Role enum values must match backend/models/User.js exactly (case-sensitive).
// Display labels are human-readable; submitted `value` is the raw enum string.
const roles = [
    { value: 'Admin',            label: 'Admin' },
    { value: 'HRManager',        label: 'HR Manager' },
    { value: 'HRPayrollUser',    label: 'HR Payroll User' },
    { value: 'HRPayrollManager', label: 'HR Payroll Manager' },
    { value: 'Employee',         label: 'Employee' },
    { value: 'Intern',           label: 'Intern' },
];
const domains = ['Development', 'Design', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations', 'Support', 'Management', 'Other'];
const satPolicies = ['Week 1 & 3 Off', 'Week 2 & 4 Off', 'All Saturdays Working', 'All Saturdays Off'];
const employmentStatuses = ['Intern', 'Probation', 'Permanent'];
const allWeekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

const cardSx = {
    background: '#fff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
};

const textFieldSx = {
    '& .MuiOutlinedInput-root': { borderRadius: '12px', backgroundColor: '#fff' },
    '& .MuiInputLabel-root': { color: '#666' },
};

const formControlStyles = {
    '& .MuiOutlinedInput-root': { borderRadius: '12px', backgroundColor: '#fff' },
    '& .MuiInputBase-root': { borderRadius: '12px', backgroundColor: '#fff' },
    '& .MuiInputLabel-root': { color: '#666' },
};

const EmployeeForm = ({ open, onClose, onSave, employee, shifts, isSaving }) => {
    const [formData, setFormData] = useState(initialFormState);
    const [errors, setErrors] = useState({});

    // ── Manager (reporting person) autocomplete state ────────────────────────
    const [managerOptions, setManagerOptions] = useState([]);
    const [managerLoading, setManagerLoading] = useState(false);
    // The full object for the currently-selected manager (needed for Autocomplete value prop)
    const [selectedManager, setSelectedManager] = useState(null);

    const isEditing = !!employee;

    // Fetch all active employees for the manager dropdown whenever the dialog opens.
    // Mirrors the same /admin/employees?all=true call used by AdminEmployeeProfileDialog.
    useEffect(() => {
        if (!open) return;
        let active = true;
        setManagerLoading(true);
        api.get('/admin/employees?all=true')
            .then(({ data }) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : (data.employees || []);
                setManagerOptions(list);
            })
            .catch(() => { /* non-fatal: dropdown stays empty */ })
            .finally(() => { if (active) setManagerLoading(false); });
        return () => { active = false; };
    }, [open]);

    // Resolve selected manager object from the stored ObjectId whenever employee or options change.
    useEffect(() => {
        if (!managerOptions.length) { setSelectedManager(null); return; }
        const rpId = employee?.reportingPerson?._id || employee?.reportingPerson || '';
        if (!rpId) { setSelectedManager(null); return; }
        const match = managerOptions.find(opt => opt._id === rpId);
        setSelectedManager(match || null);
    }, [employee, managerOptions]);

    useEffect(() => {
        if (open) {
            if (isEditing) {
                setFormData({
                    employeeCode: employee.employeeCode || '',
                    fullName: employee.fullName || '',
                    email: employee.email || '',
                    password: '',
                    role: employee.role || 'Employee',
                    domain: employee.domain || '',
                    designation: employee.designation || '',
                    department: employee.department || '',
                    joiningDate: employee.joiningDate ? new Date(employee.joiningDate).toISOString().slice(0, 10) : '',
                    shiftGroup: employee.shiftGroup?._id || employee.shiftGroup || '',
                    reportingPerson: employee.reportingPerson?._id || employee.reportingPerson || '',
                    isActive: employee.isActive !== false,
                    alternateSaturdayPolicy: employee.alternateSaturdayPolicy || 'All Saturdays Working',
                    employmentStatus: employee.employmentStatus || 'Probation',
                    probationDurationMonths: employee.probationDurationMonths || 3,
                    internshipDurationMonths: employee.internshipDurationMonths || 6,
                    workingDays: employee.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                    leaveBalances: {
                        paid: employee.leaveBalances?.paid ?? 0,
                        sick: employee.leaveBalances?.sick ?? 0,
                        casual: employee.leaveBalances?.casual ?? 0,
                    },
                });
            } else {
                setFormData(initialFormState);
                setSelectedManager(null);
            }
            setErrors({});
        }
    }, [employee, open, isEditing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSwitchChange = (e) => {
        const { name, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: checked }));
    };

    const handleBalanceChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            leaveBalances: {
                ...prev.leaveBalances,
                [name]: value === '' ? '' : Number(value),
            },
        }));
    };

    const handleManagerChange = (_, newValue) => {
        setSelectedManager(newValue || null);
        setFormData(prev => ({ ...prev, reportingPerson: newValue?._id || '' }));
    };

    const validate = () => {
        const tempErrors = {};
        if (!formData.employeeCode) tempErrors.employeeCode = 'Employee Code is required.';
        if (!formData.fullName) tempErrors.fullName = 'Full Name is required.';
        if (!formData.email) tempErrors.email = 'Email is required.';
        if (!isEditing && !formData.password) tempErrors.password = 'Password is required for new employees.';
        if (formData.employmentStatus === 'Probation' && !formData.probationDurationMonths) {
            tempErrors.probationDurationMonths = 'Select a probation duration.';
        }
        setErrors(tempErrors);
        return Object.keys(tempErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validate()) return;
        const dataToSave = { ...formData };
        if (!dataToSave.password) delete dataToSave.password;
        // Send null when manager is cleared so the backend clears the field correctly.
        if (!dataToSave.reportingPerson) dataToSave.reportingPerson = null;
        onSave(dataToSave);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: '24px' } }}>
            <DialogTitle sx={{ px: 4, pt: 3, pb: 2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                        <Typography variant="overline" sx={{ color: '#E53935', letterSpacing: 1 }}>
                            Advanced Editor
                        </Typography>
                        <Typography variant="h6" fontWeight={700}>
                            {isEditing ? 'Edit Employee Details' : 'Add New Employee'}
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} size="large">
                        <CloseIcon />
                    </IconButton>
                </Stack>
            </DialogTitle>

            <DialogContent dividers sx={{ backgroundColor: '#f9fafb', px: 4, py: 4 }}>
                <Stack spacing={3}>
                    {/* ── Section 1 — Job Details ─────────────────────────────────────── */}
                    <Box sx={cardSx}>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                            Section 1 — Job Details
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    name="fullName" label="Full Name" value={formData.fullName}
                                    onChange={handleChange} fullWidth required
                                    error={!!errors.fullName} helperText={errors.fullName} sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    name="employeeCode" label="Employee Code" value={formData.employeeCode}
                                    onChange={handleChange} fullWidth required
                                    error={!!errors.employeeCode} helperText={errors.employeeCode} sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    name="designation" label="Designation" value={formData.designation}
                                    onChange={handleChange} fullWidth sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    name="department" label="Department" value={formData.department}
                                    onChange={handleChange} fullWidth sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    name="joiningDate" label="Joining Date" type="date" value={formData.joiningDate}
                                    onChange={handleChange} fullWidth InputLabelProps={{ shrink: true }} sx={textFieldSx}
                                />
                            </Grid>

                            {/* Manager — mirrors reportingPerson in AdminEmployeeProfileDialog */}
                            <Grid item xs={12} md={6}>
                                <Autocomplete
                                    options={managerOptions}
                                    loading={managerLoading}
                                    value={selectedManager}
                                    onChange={handleManagerChange}
                                    getOptionLabel={(opt) =>
                                        opt.fullName
                                            ? `${opt.fullName}${opt.employeeCode ? ` (${opt.employeeCode})` : ''}`
                                            : ''
                                    }
                                    isOptionEqualToValue={(opt, val) => opt._id === val?._id}
                                    // Exclude the employee being edited from their own manager list
                                    filterOptions={(opts) =>
                                        opts.filter(o => !isEditing || o._id !== employee?._id)
                                    }
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Manager (Reporting Person)"
                                            placeholder="Search by name…"
                                            sx={textFieldSx}
                                        />
                                    )}
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                                />
                            </Grid>
                        </Grid>
                    </Box>

                    {/* ── Section 2 — System & Access ─────────────────────────────────── */}
                    <Box sx={cardSx}>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                            Section 2 — System & Access
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    name="email" label="Email Address" type="email" value={formData.email}
                                    onChange={handleChange} fullWidth required
                                    error={!!errors.email} helperText={errors.email} sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    name="password" label="Password" type="password" value={formData.password}
                                    onChange={handleChange} fullWidth required={!isEditing}
                                    helperText={isEditing ? 'Leave blank to keep current password' : 'Required for new employee'}
                                    error={!!errors.password} sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Role</InputLabel>
                                    <Select name="role" label="Role" value={formData.role} onChange={handleChange}>
                                        {roles.map(r => (
                                            <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Domain</InputLabel>
                                    <Select name="domain" label="Domain" value={formData.domain} onChange={handleChange}>
                                        <MenuItem value=""><em>Select Domain</em></MenuItem>
                                        {domains.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>

                            {/* Active / Inactive status toggle — previously only on the list row */}
                            <Grid item xs={12} md={6}>
                                <Box
                                    sx={{
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '12px',
                                        px: 2,
                                        py: 1.5,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        backgroundColor: '#fff',
                                    }}
                                >
                                    <Box>
                                        <Typography variant="body2" fontWeight={600} color="text.primary">
                                            Account Status
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {formData.isActive ? 'Active — can log in and clock in' : 'Inactive — login blocked'}
                                        </Typography>
                                    </Box>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                name="isActive"
                                                checked={formData.isActive}
                                                onChange={handleSwitchChange}
                                                color="success"
                                            />
                                        }
                                        label={formData.isActive ? 'Active' : 'Inactive'}
                                        labelPlacement="start"
                                        sx={{ m: 0, gap: 1 }}
                                    />
                                </Box>
                            </Grid>
                        </Grid>
                    </Box>

                    {/* ── Section 3 — Work & Leave Policy ─────────────────────────────── */}
                    <Box sx={cardSx}>
                        <Typography variant="h6" fontWeight={700} gutterBottom>
                            Section 3 — Work &amp; Leave Policy
                        </Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Shift Group</InputLabel>
                                    <Select name="shiftGroup" label="Shift Group" value={formData.shiftGroup} onChange={handleChange}>
                                        <MenuItem value=""><em>None</em></MenuItem>
                                        {shifts?.map(s => (
                                            <MenuItem key={s._id} value={s._id}>{s.shiftName}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Employment Status</InputLabel>
                                    <Select name="employmentStatus" label="Employment Status" value={formData.employmentStatus} onChange={handleChange}>
                                        {employmentStatuses.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            {formData.employmentStatus === 'Probation' && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth sx={formControlStyles} error={!!errors.probationDurationMonths}>
                                        <InputLabel>Probation Period</InputLabel>
                                        <Select
                                            name="probationDurationMonths"
                                            label="Probation Period"
                                            value={formData.probationDurationMonths}
                                            onChange={handleChange}
                                        >
                                            {monthOptions.map(m => (
                                                <MenuItem key={`probation-${m}`} value={m}>
                                                    {m} Month{m > 1 ? 's' : ''}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    {errors.probationDurationMonths && (
                                        <Typography variant="caption" color="error.main" sx={{ mt: 0.5, display: 'block' }}>
                                            {errors.probationDurationMonths}
                                        </Typography>
                                    )}
                                </Grid>
                            )}
                            {formData.employmentStatus === 'Intern' && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth sx={formControlStyles}>
                                        <InputLabel>Internship Duration</InputLabel>
                                        <Select name="internshipDurationMonths" label="Internship Duration" value={formData.internshipDurationMonths} onChange={handleChange}>
                                            {monthOptions.map(m => (
                                                <MenuItem key={m} value={m}>{m} Month{m > 1 ? 's' : ''}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                            )}
                            {formData.employmentStatus === 'Permanent' && (
                                <Grid item xs={12} sm={6} md={3}>
                                    <FormControl fullWidth sx={formControlStyles}>
                                        <InputLabel>Duration</InputLabel>
                                        <Select disabled><MenuItem value="">Permanent</MenuItem></Select>
                                    </FormControl>
                                </Grid>
                            )}
                            <Grid item xs={12} sm={6} md={3}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Alternate Saturday Policy</InputLabel>
                                    <Select name="alternateSaturdayPolicy" label="Alternate Saturday Policy" value={formData.alternateSaturdayPolicy} onChange={handleChange}>
                                        {satPolicies.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>

                            {/* Leave Balances */}
                            <Grid item xs={12} sm={4} md={4}>
                                <TextField
                                    name="sick" label="Sick Leaves Balance" type="number"
                                    value={formData.leaveBalances.sick} onChange={handleBalanceChange}
                                    fullWidth sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} sm={4} md={4}>
                                <TextField
                                    name="casual" label="Casual Leaves Balance" type="number"
                                    value={formData.leaveBalances.casual} onChange={handleBalanceChange}
                                    fullWidth sx={textFieldSx}
                                />
                            </Grid>
                            <Grid item xs={12} sm={4} md={4}>
                                <TextField
                                    name="paid" label="Planned Leaves Balance" type="number"
                                    value={formData.leaveBalances.paid} onChange={handleBalanceChange}
                                    fullWidth sx={textFieldSx}
                                />
                            </Grid>

                            {/* Working Days */}
                            <Grid item xs={12}>
                                <FormControl fullWidth sx={formControlStyles}>
                                    <InputLabel>Working Days</InputLabel>
                                    <Select
                                        multiple
                                        name="workingDays"
                                        value={formData.workingDays}
                                        onChange={handleChange}
                                        input={<OutlinedInput label="Working Days" sx={{ borderRadius: '12px' }} />}
                                        renderValue={(selected) => (
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {selected.map(v => <Chip key={v} label={v} />)}
                                            </Box>
                                        )}
                                    >
                                        {allWeekDays.map(day => (
                                            <MenuItem key={day} value={day}>{day}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Box>
                </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 4, py: 3, gap: 1.5 }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderRadius: '12px' }}>
                    Cancel
                </Button>
                <Button
                    onClick={handleSubmit}
                    variant="contained"
                    disabled={isSaving}
                    sx={{ backgroundColor: '#E53935', borderRadius: '12px', minWidth: 140, '&:hover': { backgroundColor: '#d32f2f' } }}
                >
                    {isSaving ? <SkeletonBox width="22px" height="22px" borderRadius="50%" /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EmployeeForm;
