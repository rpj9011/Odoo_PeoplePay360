// frontend/src/components/admin/PolicyAssignmentModal.jsx
// Admin component to assign policies to employees

import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Box,
    Typography,
    Chip,
    Stack,
    Alert,
    CircularProgress,
    Autocomplete,
    FormControlLabel,
    Switch,
    Divider
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import api from '../../api/axios';

const PolicyAssignmentModal = ({ open, onClose, onSuccess }) => {
    const [policies, setPolicies] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [selectedPolicy, setSelectedPolicy] = useState('');
    const [selectedEmployees, setSelectedEmployees] = useState([]);
    const [assignToAll, setAssignToAll] = useState(false);
    const [deadline, setDeadline] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const [loading, setLoading] = useState(false);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);

    // Load policies and employees on mount
    useEffect(() => {
        if (open) {
            loadPolicies();
            loadEmployees();
            // Reset state
            setSelectedPolicy('');
            setSelectedEmployees([]);
            setAssignToAll(false);
            setError('');
            setResult(null);
            setDeadline(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        }
    }, [open]);

    const loadPolicies = async () => {
        setLoadingData(true);
        try {
            const { data } = await api.get('/policies', {
                params: { status: 'Active' }
            });
            // Ensure data is an array
            setPolicies(Array.isArray(data) ? data : (data.policies || []));
        } catch (err) {
            console.error('Failed to load policies:', err);
            setError('Failed to load policies');
            setPolicies([]); // Set empty array on error
        } finally {
            setLoadingData(false);
        }
    };

    const loadEmployees = async () => {
        setLoadingData(true);
        try {
            const { data } = await api.get('/admin/employees', {
                params: { all: true, status: 'active' }
            });
            // Filter out Admin and HR roles and ensure it's an array
            const employeeList = Array.isArray(data) ? data : [];
            const filtered = employeeList.filter(e => e.role === 'Employee' || e.role === 'Intern');
            setEmployees(filtered);
        } catch (err) {
            console.error('Failed to load employees:', err);
            setError('Failed to load employees');
            setEmployees([]); // Set empty array on error
        } finally {
            setLoadingData(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedPolicy) {
            setError('Please select a policy');
            return;
        }

        if (!assignToAll && selectedEmployees.length === 0) {
            setError('Please select at least one employee or choose "Assign to All"');
            return;
        }

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const payload = {
                policyId: selectedPolicy,
                deadline: deadline.toISOString()
            };

            let response;
            if (assignToAll) {
                response = await api.post('/onboarding/admin/assign-policy-to-all', payload);
            } else {
                payload.userIds = selectedEmployees.map(e => e._id);
                response = await api.post('/onboarding/admin/assign-policy-to-users', payload);
            }

            setResult(response.data.results);
            
            if (onSuccess) {
                setTimeout(() => {
                    onSuccess(response.data);
                    onClose();
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to assign policy:', err);
            setError(err.response?.data?.error || 'Failed to assign policy');
        } finally {
            setLoading(false);
        }
    };

    const selectedPolicyData = policies.find(p => p._id === selectedPolicy);

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            maxWidth="md" 
            fullWidth
            PaperProps={{
                sx: { borderRadius: 2 }
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>
                <Typography variant="h5" fontWeight={600}>
                    Assign Policy to Employees
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Assign a policy for employees to acknowledge
                </Typography>
            </DialogTitle>

            <DialogContent dividers>
                <Stack spacing={3}>
                    {error && (
                        <Alert severity="error" onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    {loadingData && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CircularProgress size={20} />
                            <Typography variant="body2" color="text.secondary">
                                Loading data...
                            </Typography>
                        </Box>
                    )}

                    {result && (
                        <Alert severity="success">
                            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                Assignment Complete
                            </Typography>
                            <Typography variant="body2">
                                ✓ Successfully assigned: {result.success?.length || 0}
                            </Typography>
                            {result.alreadyAccepted?.length > 0 && (
                                <Typography variant="body2">
                                    ℹ Already accepted: {result.alreadyAccepted.length}
                                </Typography>
                            )}
                            {result.failed?.length > 0 && (
                                <Typography variant="body2" color="error">
                                    ✗ Failed: {result.failed.length}
                                </Typography>
                            )}
                        </Alert>
                    )}

                    <FormControl fullWidth>
                        <InputLabel>Select Policy</InputLabel>
                        <Select
                            value={selectedPolicy}
                            onChange={(e) => setSelectedPolicy(e.target.value)}
                            label="Select Policy"
                            disabled={loading || loadingData || policies.length === 0}
                        >
                            <MenuItem value="">
                                <em>{policies.length === 0 ? 'No active policies available' : 'Select a policy'}</em>
                            </MenuItem>
                            {policies.map(policy => (
                                <MenuItem key={policy._id} value={policy._id}>
                                    {policy.name} (v{policy.version})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {selectedPolicyData && (
                        <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
                            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                Policy Details
                            </Typography>
                            <Stack spacing={0.5}>
                                <Typography variant="body2">
                                    <strong>Name:</strong> {selectedPolicyData.name}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Version:</strong> {selectedPolicyData.version}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Effective From:</strong>{' '}
                                    {new Date(selectedPolicyData.effectiveFrom).toLocaleDateString()}
                                </Typography>
                                {selectedPolicyData.department && (
                                    <Typography variant="body2">
                                        <strong>Department:</strong> {selectedPolicyData.department}
                                    </Typography>
                                )}
                            </Stack>
                        </Box>
                    )}

                    <Divider />

                    <FormControlLabel
                        control={
                            <Switch
                                checked={assignToAll}
                                onChange={(e) => {
                                    setAssignToAll(e.target.checked);
                                    if (e.target.checked) {
                                        setSelectedEmployees([]);
                                    }
                                }}
                                disabled={loading}
                            />
                        }
                        label={
                            <Box>
                                <Typography variant="body1">Assign to All Active Employees</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Assign this policy to all active employees (Employee & Intern roles)
                                </Typography>
                            </Box>
                        }
                    />

                    {!assignToAll && (
                        <Autocomplete
                            multiple
                            options={employees}
                            getOptionLabel={(option) => 
                                `${option.fullName} (${option.employeeCode})${option.department ? ` - ${option.department}` : ''}`
                            }
                            value={selectedEmployees}
                            onChange={(e, newValue) => setSelectedEmployees(newValue)}
                            disabled={loading || assignToAll || loadingData || employees.length === 0}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Select Employees"
                                    placeholder={employees.length === 0 ? 'No employees available' : 'Search employees...'}
                                    helperText={
                                        employees.length === 0 
                                            ? 'No active employees found'
                                            : selectedEmployees.length > 0 
                                                ? `${selectedEmployees.length} employee(s) selected` 
                                                : 'Select employees to assign this policy'
                                    }
                                />
                            )}
                            renderTags={(value, getTagProps) =>
                                value.map((option, index) => (
                                    <Chip
                                        key={option._id}
                                        label={`${option.fullName} (${option.employeeCode})`}
                                        size="small"
                                        {...getTagProps({ index })}
                                    />
                                ))
                            }
                        />
                    )}

                    {assignToAll && (
                        <Alert severity="info">
                            This will assign the policy to <strong>{employees.length}</strong> active employees
                        </Alert>
                    )}

                    <LocalizationProvider dateAdapter={AdapterDateFns}>
                        <DatePicker
                            label="Acknowledgement Deadline"
                            value={deadline}
                            onChange={(newValue) => setDeadline(newValue)}
                            disabled={loading}
                            minDate={new Date()}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    fullWidth
                                    helperText="Employees will be notified to acknowledge by this date"
                                />
                            )}
                        />
                    </LocalizationProvider>
                </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onClose} disabled={loading || loadingData}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleAssign}
                    disabled={
                        loading || 
                        loadingData || 
                        !selectedPolicy || 
                        (!assignToAll && selectedEmployees.length === 0) ||
                        policies.length === 0 ||
                        (assignToAll && employees.length === 0)
                    }
                    startIcon={loading && <CircularProgress size={20} />}
                >
                    {loading ? 'Assigning...' : 'Assign Policy'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PolicyAssignmentModal;
