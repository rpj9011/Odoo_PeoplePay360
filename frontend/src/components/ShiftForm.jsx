import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Grid, FormControl, InputLabel, Select, MenuItem, Stack, Box, Typography, Divider } from '@mui/material';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';

import { SkeletonBox } from '../components/SkeletonLoaders';
const getInitialState = () => ({
    shiftName: '',
    shiftType: 'Fixed',
    startTime: '',
    endTime: '',
    durationHours: 8,
    paidBreakMinutes: 30,
});

const ShiftForm = ({ open, onClose, onSave, shift, isSaving }) => {
    const isEditing = Boolean(shift);
    const [formData, setFormData] = useState(getInitialState());

    useEffect(() => {
        if (open) {
            if (isEditing) {
                // --- THE FIX IS HERE ---
                // Ensure startTime and endTime are always strings for the input field.
                // Default to empty string '' if they are null or undefined.
                setFormData({ 
                    ...getInitialState(), 
                    ...shift,
                    startTime: shift.startTime || '',
                    endTime: shift.endTime || '',
                });
            } else {
                setFormData(getInitialState());
            }
        }
    }, [shift, open, isEditing]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = () => {
        if (!formData.shiftName) {
            return;
        }
        onSave(formData);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: '12px' } }}>
            <DialogTitle sx={{ p: 3, pb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <ScheduleOutlinedIcon color="action" />
                    <Typography variant="h6">{isEditing ? 'Edit Shift' : 'Add New Shift'}</Typography>
                </Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={2.5}>
                    <TextField name="shiftName" label="Shift Name" value={formData.shiftName} onChange={handleChange} fullWidth required />
                    <FormControl fullWidth>
                        <InputLabel>Shift Type</InputLabel>
                        <Select name="shiftType" label="Shift Type" value={formData.shiftType} onChange={handleChange}>
                            <MenuItem value="Fixed">Fixed</MenuItem>
                            <MenuItem value="Flexible">Flexible</MenuItem>
                        </Select>
                    </FormControl>
                    {formData.shiftType === 'Fixed' ? (
                        <Grid container spacing={2}>
                            <Grid item xs={6}><TextField name="startTime" label="Start Time" type="time" value={formData.startTime} onChange={handleChange} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
                            <Grid item xs={6}><TextField name="endTime" label="End Time" type="time" value={formData.endTime} onChange={handleChange} InputLabelProps={{ shrink: true }} fullWidth /></Grid>
                        </Grid>
                    ) : (
                        <TextField name="durationHours" label="Required Duration (Hours)" type="number" value={formData.durationHours} onChange={handleChange} fullWidth />
                    )}
                    <TextField name="paidBreakMinutes" label="Paid Break (Minutes)" type="number" value={formData.paidBreakMinutes} onChange={handleChange} fullWidth />
                </Stack>
            </DialogContent>
            <Divider />
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Button onClick={handleSave} variant="contained" disabled={isSaving} sx={{ minWidth: '80px' }}>
                    {isSaving ? <SkeletonBox width="24px" height="24px" borderRadius="50%" /> : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
export default ShiftForm;