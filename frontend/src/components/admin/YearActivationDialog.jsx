import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Alert
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import axios from 'axios';

const YearActivationDialog = ({ open, onClose, year, currentActiveYear, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleActivate = async () => {
        setLoading(true);
        setError(null);

        try {
            await axios.post(`/api/admin/leave-years/${year._id}/activate`, {
                confirmDeactivateCurrent: true
            });

            onSuccess();
            onClose();
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Failed to activate year';
            setError(errorMessage);
            console.error('Error activating year:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!year) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon color="warning" />
                    <Typography variant="h6">Activate Leave Year</Typography>
                </Box>
            </DialogTitle>
            <DialogContent>
                <Alert severity="warning" sx={{ mb: 2 }}>
                    This action will affect the entire system. All employees will see holidays from the new active year.
                </Alert>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ my: 2 }}>
                    <Typography variant="body1" gutterBottom>
                        <strong>Current Active Year:</strong> {currentActiveYear?.year || 'None'}
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                        <strong>Year to Activate:</strong> {year.year}
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary">
                    When you activate this year:
                </Typography>
                <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                    <Typography component="li" variant="body2" color="text.secondary">
                        The current active year will be automatically deactivated
                    </Typography>
                    <Typography component="li" variant="body2" color="text.secondary">
                        Employee leave pages will show holidays from {year.year}
                    </Typography>
                    <Typography component="li" variant="body2" color="text.secondary">
                        Attendance calculations will use {year.year} holidays
                    </Typography>
                    <Typography component="li" variant="body2" color="text.secondary">
                        All dependent systems will be synchronized automatically
                    </Typography>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    onClick={handleActivate}
                    variant="contained"
                    color="error"
                    disabled={loading}
                >
                    {loading ? 'Activating...' : 'Activate Year'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default YearActivationDialog;
