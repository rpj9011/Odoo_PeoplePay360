// src/components/YearEndLeaveForm.jsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, Select, MenuItem, InputLabel, FormControl, Stack, Box, Typography } from '@mui/material';
import EditCalendarOutlinedIcon from '@mui/icons-material/EditCalendarOutlined';

import { SkeletonBox } from '../components/SkeletonLoaders';
const initialFormState = {
    employeeId: '',
    leaveType: 'Sick',
    remainingDays: 0,
    year: new Date().getFullYear() - 1,
    action: '',
    status: 'Pending',
    adminNotes: ''
};

const YearEndLeaveForm = ({ open, onClose, onSave, action, employees, isSaving }) => {
    const [formData, setFormData] = useState(initialFormState);
    const [errors, setErrors] = useState({});
    const isEditing = !!action;

    useEffect(() => {
        if (open) {
            if (isEditing && action) {
                setFormData({
                    _id: action._id,
                    employeeId: action.employeeId?._id || action.employeeId || '',
                    leaveType: action.leaveType || 'Sick',
                    remainingDays: action.remainingDays || 0,
                    year: action.year || new Date().getFullYear() - 1,
                    action: action.action || '',
                    status: action.status || 'Pending',
                    adminNotes: action.adminNotes || ''
                });
            } else {
                setFormData({
                    ...initialFormState,
                    year: new Date().getFullYear() - 1
                });
            }
            setErrors({});
        }
    }, [action, open, isEditing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        // Clear error for this field
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors = {};
        
        if (!formData.employeeId) {
            newErrors.employeeId = 'Employee is required';
        }
        
        if (!formData.leaveType) {
            newErrors.leaveType = 'Leave type is required';
        }
        
        if (formData.remainingDays === undefined || formData.remainingDays < 0) {
            newErrors.remainingDays = 'Remaining days must be 0 or greater';
        }
        
        if (!formData.year || formData.year < 2000 || formData.year > 2100) {
            newErrors.year = 'Year must be a valid year';
        }
        
        if (formData.action && !['carry', 'encash'].includes(formData.action)) {
            newErrors.action = 'Action must be either carry or encash';
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSaveClick = () => {
        if (!validateForm()) {
            return;
        }
        
        // Prepare data for API
        const submitData = {
            employeeId: formData.employeeId,
            leaveType: formData.leaveType,
            remainingDays: parseFloat(formData.remainingDays),
            year: parseInt(formData.year),
            action: formData.action || null,
            status: formData.status,
            adminNotes: formData.adminNotes || undefined
        };
        
        onSave(submitData);
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            fullWidth 
            maxWidth="sm" 
            PaperProps={{ 
                sx: { 
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
                } 
            }}
        >
            {/* Header */}
            <DialogTitle sx={{ 
                backgroundColor: '#dc3545', 
                color: '#ffffff', 
                fontWeight: 'bold',
                fontSize: '1.5rem',
                py: 2.5,
                px: 3
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <EditCalendarOutlinedIcon sx={{ color: '#ffffff' }} />
                    <Typography variant="h6" sx={{ color: '#ffffff' }}>
                        {isEditing ? 'Edit Year-End Leave Request' : 'Create Year-End Leave Request'}
                    </Typography>
                </Box>
            </DialogTitle>

            <DialogContent sx={{ 
                backgroundColor: '#ffffff',
                p: 3
            }}>
                <Stack spacing={2.5}>
                    <FormControl fullWidth required error={!!errors.employeeId}>
                        <InputLabel sx={{ color: '#dc3545', '&.Mui-focused': { color: '#dc3545' } }}>Employee</InputLabel>
                        <Select 
                            name="employeeId" 
                            label="Employee" 
                            value={formData.employeeId} 
                            onChange={handleChange} 
                            disabled={!employees.length}
                            sx={{
                                '& .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#dc3545'
                                },
                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#dc3545'
                                },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#dc3545'
                                }
                            }}
                        >
                            {employees.length === 0 && <MenuItem disabled>Loading employees...</MenuItem>}
                            {employees.map(emp => (
                                <MenuItem key={emp._id} value={emp._id}>
                                    {emp.fullName} ({emp.employeeCode})
                                </MenuItem>
                            ))}
                        </Select>
                        {errors.employeeId && (
                            <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                                {errors.employeeId}
                            </Typography>
                        )}
                    </FormControl>
                    
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <FormControl fullWidth required error={!!errors.leaveType}>
                                <InputLabel sx={{ color: '#dc3545', '&.Mui-focused': { color: '#dc3545' } }}>Leave Type</InputLabel>
                                <Select 
                                    name="leaveType" 
                                    label="Leave Type" 
                                    value={formData.leaveType} 
                                    onChange={handleChange}
                                    sx={{
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#dc3545'
                                        },
                                        '&:hover .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#dc3545'
                                        },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#dc3545'
                                        }
                                    }}
                                >
                                    <MenuItem value="Sick">Sick</MenuItem>
                                    <MenuItem value="Casual">Casual</MenuItem>
                                    <MenuItem value="Planned">Planned</MenuItem>
                                </Select>
                                {errors.leaveType && (
                                    <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                                        {errors.leaveType}
                                    </Typography>
                                )}
                            </FormControl>
                        </Grid>
                        <Grid item xs={6}>
                            <TextField
                                name="remainingDays"
                                label="Remaining Days"
                                type="number"
                                value={formData.remainingDays}
                                onChange={handleChange}
                                fullWidth
                                required
                                error={!!errors.remainingDays}
                                helperText={errors.remainingDays}
                                inputProps={{ min: 0, step: 0.5 }}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        '&:hover fieldset': {
                                            borderColor: '#dc3545'
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: '#dc3545'
                                        }
                                    },
                                    '& .MuiInputLabel-root.Mui-focused': {
                                        color: '#dc3545'
                                    }
                                }}
                            />
                        </Grid>
                    </Grid>
                    
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField
                                name="year"
                                label="Year"
                                type="number"
                                value={formData.year}
                                onChange={handleChange}
                                fullWidth
                                required
                                error={!!errors.year}
                                helperText={errors.year}
                                inputProps={{ min: 2000, max: 2100 }}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        '&:hover fieldset': {
                                            borderColor: '#dc3545'
                                        },
                                        '&.Mui-focused fieldset': {
                                            borderColor: '#dc3545'
                                        }
                                    },
                                    '& .MuiInputLabel-root.Mui-focused': {
                                        color: '#dc3545'
                                    }
                                }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <FormControl fullWidth>
                                <InputLabel sx={{ color: '#dc3545', '&.Mui-focused': { color: '#dc3545' } }}>Action</InputLabel>
                                <Select 
                                    name="action" 
                                    label="Action" 
                                    value={formData.action} 
                                    onChange={handleChange}
                                    sx={{
                                        '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#dc3545'
                                        },
                                        '&:hover .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#dc3545'
                                        },
                                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                            borderColor: '#dc3545'
                                        }
                                    }}
                                >
                                    <MenuItem value="">None</MenuItem>
                                    <MenuItem value="carry">Carry Forward</MenuItem>
                                    <MenuItem value="encash">Encash</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                    
                    <FormControl fullWidth required>
                        <InputLabel sx={{ color: '#dc3545', '&.Mui-focused': { color: '#dc3545' } }}>Status</InputLabel>
                        <Select 
                            name="status" 
                            label="Status" 
                            value={formData.status} 
                            onChange={handleChange}
                            sx={{
                                '& .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#dc3545'
                                },
                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#dc3545'
                                },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#dc3545'
                                }
                            }}
                        >
                            <MenuItem value="Pending">Pending</MenuItem>
                            <MenuItem value="Approved">Approved</MenuItem>
                            <MenuItem value="Rejected">Rejected</MenuItem>
                            <MenuItem value="Completed">Completed</MenuItem>
                        </Select>
                    </FormControl>
                    
                    <TextField 
                        name="adminNotes" 
                        label="Admin Notes" 
                        multiline 
                        rows={3} 
                        value={formData.adminNotes} 
                        onChange={handleChange} 
                        fullWidth 
                        placeholder="Optional notes for this year-end leave request"
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                '&:hover fieldset': {
                                    borderColor: '#dc3545'
                                },
                                '&.Mui-focused fieldset': {
                                    borderColor: '#dc3545'
                                }
                            },
                            '& .MuiInputLabel-root.Mui-focused': {
                                color: '#dc3545'
                            }
                        }}
                    />
                </Stack>
            </DialogContent>

            {/* Footer Actions */}
            <DialogActions sx={{ 
                p: 3,
                backgroundColor: '#ffffff',
                borderTop: '2px solid #e0e0e0',
                justifyContent: 'flex-end',
                gap: 2
            }}>
                <Button 
                    onClick={onClose} 
                    sx={{
                        color: '#dc3545',
                        borderColor: '#dc3545',
                        px: 3,
                        minWidth: '100px',
                        '&:hover': {
                            backgroundColor: '#fff5f5',
                            borderColor: '#dc3545'
                        }
                    }}
                    variant="outlined"
                >
                    Cancel
                </Button>
                <Button 
                    onClick={handleSaveClick} 
                    variant="contained" 
                    disabled={isSaving} 
                    sx={{ 
                        minWidth: '100px',
                        backgroundColor: '#dc3545',
                        color: '#ffffff',
                        fontWeight: 'bold',
                        px: 4,
                        '&:hover': {
                            backgroundColor: '#c82333'
                        },
                        '&.Mui-disabled': {
                            backgroundColor: '#cccccc',
                            color: '#666666'
                        }
                    }}
                >
                    {isSaving ? <SkeletonBox width="24px" height="24px" borderRadius="50%" /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default YearEndLeaveForm;




















