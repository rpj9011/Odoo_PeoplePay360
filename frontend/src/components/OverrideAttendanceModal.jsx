/**
 * Universal Override Updater modal.
 * Reuses the same override form (type + note) and API as LogDetailModal.
 * Used from Admin Attendance Summary ⋮ menu and elsewhere.
 */
import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Typography,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@mui/material';
import api from '../api/axios';
import { SkeletonBox } from './SkeletonLoaders';

const OverrideAttendanceModal = ({ open, onClose, log, dateLabel, onSuccess }) => {
    const [overrideType, setOverrideType] = useState('halfday');
    const [overrideReason, setOverrideReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setOverrideType('halfday');
            setOverrideReason(log?.overrideReason?.trim() || '');
            setError('');
        }
    }, [open, log?.overrideReason]);

    const canOverride = log && (log.isHalfDay || log.overriddenByAdmin);
    const isUpdate = !!(log && log.overriddenByAdmin);

    const handleClose = () => {
        if (!isSubmitting) {
            setOverrideType('halfday');
            setOverrideReason('');
            setError('');
            onClose();
        }
    };

    const handleSubmit = async () => {
        if (!log?._id) return;
        const note = (overrideReason || '').trim();
        if (!note) {
            setError('Override note is required.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            if (isUpdate) {
                await api.patch(`/admin/attendance/override/${log._id}`, { overrideReason: note });
            } else {
                await api.post('/admin/attendance/override-half-day', {
                    attendanceLogId: log._id,
                    overrideReason: note,
                });
            }
            setOverrideType('halfday');
            setOverrideReason('');
            if (onSuccess) await onSuccess();
            handleClose();
        } catch (err) {
            const msg = err?.response?.data?.error || err?.response?.data?.message || (isUpdate ? 'Failed to update override.' : 'Failed to override half-day.');
            setError(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>{isUpdate ? 'Update Override' : 'Override Attendance'}</DialogTitle>
            <DialogContent>
                {dateLabel && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {dateLabel}
                    </Typography>
                )}
                {!log ? (
                    <Alert severity="info">No attendance record for the selected date.</Alert>
                ) : !canOverride ? (
                    <Alert severity="info">
                        Override applies to half-day only. This date has no half-day or overridden record.
                    </Alert>
                ) : (
                    <>
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {isUpdate
                                ? 'Edit the override note. The note is required for audit.'
                                : 'This will update the attendance status for this day. The override note is required for audit.'}
                        </Alert>
                        {!isUpdate && (
                            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                <InputLabel>Override type</InputLabel>
                                <Select
                                    value={overrideType}
                                    label="Override type"
                                    onChange={(e) => setOverrideType(e.target.value)}
                                >
                                    <MenuItem value="halfday">Half Day → Full Day</MenuItem>
                                    <MenuItem value="fullday" disabled>Full Day (coming soon)</MenuItem>
                                    <MenuItem value="holiday" disabled>Holiday (coming soon)</MenuItem>
                                </Select>
                            </FormControl>
                        )}
                        <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                            Override note *
                        </Typography>
                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            placeholder="e.g. Election Day, Company Event, Special Approval"
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            error={!!error}
                            helperText={error || (!overrideReason.trim() ? 'Override note is required' : '')}
                            sx={{ mt: 0.5 }}
                        />
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} variant="outlined" disabled={isSubmitting}>
                    Cancel
                </Button>
                {canOverride && (
                    <Button
                        onClick={handleSubmit}
                        variant="contained"
                        color="warning"
                        disabled={isSubmitting || !overrideReason.trim()}
                        startIcon={isSubmitting ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : null}
                    >
                        {isSubmitting ? (isUpdate ? 'Updating…' : 'Overriding…') : (isUpdate ? 'Update Override' : 'Confirm Override')}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default OverrideAttendanceModal;
