import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    FormControl,
    Select,
    MenuItem,
    RadioGroup,
    FormControlLabel,
    Radio,
    Checkbox,
    FormGroup,
    Typography,
    Box,
    Alert,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    TextField,
    Chip,
    CircularProgress,
    Stepper,
    Step,
    StepLabel
} from '@mui/material';
import {
    ContentCopy as CopyIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Lock as LockIcon,
    LockOpen as UnlockIcon,
    Warning as WarningIcon
} from '@mui/icons-material';
import api from '../../api/axios';

const CloneHolidaysModal = ({ open, onClose, years, onSuccess }) => {
    const [activeStep, setActiveStep] = useState(0);
    const [sourceYearId, setSourceYearId] = useState('');
    const [targetYearId, setTargetYearId] = useState('');
    const [createNewYear, setCreateNewYear] = useState(false);
    const [newYearData, setNewYearData] = useState({ year: new Date().getFullYear() + 1, startDate: '', endDate: '' });
    const [cloneMode, setCloneMode] = useState('intelligent');
    const [options, setOptions] = useState({
        recalculateFixed: true,
        fetchLunar: true,
        allowReview: true
    });
    const [preview, setPreview] = useState(null);
    const [cloneLogId, setCloneLogId] = useState(null);
    const [editedHolidays, setEditedHolidays] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const steps = ['Configure Clone', 'Review & Edit', 'Confirm'];

    useEffect(() => {
        if (!open) {
            resetModal();
        }
    }, [open]);

    const resetModal = () => {
        setActiveStep(0);
        setSourceYearId('');
        setTargetYearId('');
        setCreateNewYear(false);
        setNewYearData({ year: new Date().getFullYear() + 1, startDate: '', endDate: '' });
        setCloneMode('intelligent');
        setOptions({ recalculateFixed: true, fetchLunar: true, allowReview: true });
        setPreview(null);
        setCloneLogId(null);
        setEditedHolidays({});
        setError('');
    };

    const handleGeneratePreview = async () => {
        setLoading(true);
        setError('');
        try {
            let targetId = targetYearId;
            
            // Create new year if needed
            if (createNewYear) {
                const createRes = await api.post('/admin/leave-years', {
                    year: parseInt(newYearData.year),
                    startDate: newYearData.startDate,
                    endDate: newYearData.endDate
                });
                targetId = createRes.data._id;
                setTargetYearId(targetId);
            }

            // Validate targetId before making request
            if (!targetId) {
                setError('Target year ID is missing. Please select a target year.');
                setLoading(false);
                return;
            }

            // Get clone preview - POST to /:id/clone/preview
            console.log('Calling clone preview with targetId:', targetId, 'sourceYearId:', sourceYearId);
            const res = await api.post(`/admin/leave-years/${targetId}/clone/preview`, {
                sourceYearId
            });

            setPreview(res.data);
            setCloneLogId(res.data.cloneLogId);
            setActiveStep(1);
        } catch (err) {
            console.error('Clone preview error:', err);
            setError(err.response?.data?.message || 'Failed to generate preview');
        } finally {
            setLoading(false);
        }
    };

    const handleEditHoliday = (holidayKey, field, value) => {
        setEditedHolidays(prev => ({
            ...prev,
            [holidayKey]: {
                ...prev[holidayKey],
                [field]: value
            }
        }));
    };

    const handleRemoveHoliday = (holidayKey) => {
        setEditedHolidays(prev => ({
            ...prev,
            [holidayKey]: {
                ...prev[holidayKey],
                removed: true
            }
        }));
    };

    const handleConfirmClone = async () => {
        setLoading(true);
        setError('');
        try {
            // Convert editedHolidays object to array format expected by backend
            const previewEdits = Object.entries(editedHolidays).map(([holidayId, edits]) => ({
                holidayId,
                ...edits
            }));

            // POST to /clone/confirm
            await api.post('/admin/leave-years/clone/confirm', {
                cloneLogId,
                previewEdits
            });

            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to clone holidays');
        } finally {
            setLoading(false);
        }
    };

    const getHolidayValue = (holiday, field) => {
        const key = holiday._id || holiday.name;
        if (editedHolidays[key]?.[field] !== undefined) {
            return editedHolidays[key][field];
        }
        return holiday[field];
    };

    const isHolidayRemoved = (holidayKey) => {
        return editedHolidays[holidayKey]?.removed === true;
    };

    const getStatusChip = (status) => {
        const statusConfig = {
            'SUCCESS': { color: '#4caf50', label: '✓ Auto Generated' },
            'NEEDS_REVIEW': { color: '#ff9800', label: '⚠ Needs Review' },
            'DATASET_MISSING': { color: '#f44336', label: '⚠ Dataset Missing' },
            'MANUAL': { color: '#2196f3', label: '📝 Manual' }
        };

        const config = statusConfig[status] || { color: '#757575', label: status };
        return (
            <Chip
                label={config.label}
                size="small"
                sx={{
                    backgroundColor: config.color,
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: 500
                }}
            />
        );
    };

    const renderStepContent = () => {
        switch (activeStep) {
            case 0:
                return (
                    <Box sx={{ py: 2 }}>
                        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
                            Clone Configuration
                        </Typography>

                        {/* Source Year */}
                        <FormControl fullWidth sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                Source Year
                            </Typography>
                            <Select
                                value={sourceYearId}
                                onChange={(e) => setSourceYearId(e.target.value)}
                                displayEmpty
                            >
                                <MenuItem value="" disabled>Select source year</MenuItem>
                                {years.map((year) => (
                                    <MenuItem key={year._id} value={year._id}>
                                        {year.year} {year.isActive && '(Active)'}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {/* Target Year */}
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                Target Year
                            </Typography>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={createNewYear}
                                        onChange={(e) => setCreateNewYear(e.target.checked)}
                                    />
                                }
                                label="Create new year"
                            />

                            {createNewYear ? (
                                <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                                    <TextField
                                        label="Year"
                                        type="number"
                                        fullWidth
                                        value={newYearData.year}
                                        onChange={(e) => setNewYearData({ ...newYearData, year: e.target.value })}
                                        sx={{ mb: 2 }}
                                    />
                                    <TextField
                                        label="Start Date"
                                        type="date"
                                        fullWidth
                                        value={newYearData.startDate}
                                        onChange={(e) => setNewYearData({ ...newYearData, startDate: e.target.value })}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                        sx={{ mb: 2 }}
                                    />
                                    <TextField
                                        label="End Date"
                                        type="date"
                                        fullWidth
                                        value={newYearData.endDate}
                                        onChange={(e) => setNewYearData({ ...newYearData, endDate: e.target.value })}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                    />
                                </Box>
                            ) : (
                                <Select
                                    fullWidth
                                    value={targetYearId}
                                    onChange={(e) => setTargetYearId(e.target.value)}
                                    displayEmpty
                                >
                                    <MenuItem value="" disabled>Select target year</MenuItem>
                                    {years.filter(y => y._id !== sourceYearId).map((year) => (
                                        <MenuItem key={year._id} value={year._id}>
                                            {year.year}
                                        </MenuItem>
                                    ))}
                                </Select>
                            )}
                        </Box>

                        {/* Clone Mode */}
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                Clone Mode
                            </Typography>
                            <RadioGroup value={cloneMode} onChange={(e) => setCloneMode(e.target.value)}>
                                <FormControlLabel
                                    value="intelligent"
                                    control={<Radio />}
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                Intelligent Clone (Recommended)
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Recalculates fixed dates and fetches lunar holidays from dataset
                                            </Typography>
                                        </Box>
                                    }
                                />
                                <FormControlLabel
                                    value="exact"
                                    control={<Radio />}
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                Exact Copy
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Copies all holidays with same dates (not recommended)
                                            </Typography>
                                        </Box>
                                    }
                                />
                                <FormControlLabel
                                    value="without_lunar"
                                    control={<Radio />}
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                Clone Without Lunar Holidays
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                Only clones fixed-date holidays
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </RadioGroup>
                        </Box>

                        {/* Options */}
                        {cloneMode === 'intelligent' && (
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                    Options
                                </Typography>
                                <FormGroup>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={options.recalculateFixed}
                                                onChange={(e) => setOptions({ ...options, recalculateFixed: e.target.checked })}
                                            />
                                        }
                                        label="Recalculate Fixed-Date Holidays"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={options.fetchLunar}
                                                onChange={(e) => setOptions({ ...options, fetchLunar: e.target.checked })}
                                            />
                                        }
                                        label="Fetch Lunar Dates from Internal Dataset"
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={options.allowReview}
                                                onChange={(e) => setOptions({ ...options, allowReview: e.target.checked })}
                                            />
                                        }
                                        label="Allow Manual Review Before Saving"
                                    />
                                </FormGroup>
                            </Box>
                        )}
                    </Box>
                );

            case 1:
                return (
                    <Box sx={{ py: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                            Review & Edit Holidays
                        </Typography>

                        {preview?.warnings && preview.warnings.length > 0 && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                                    Warnings:
                                </Typography>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>
                                    {preview.warnings.map((warning, idx) => (
                                        <li key={idx}>{warning}</li>
                                    ))}
                                </ul>
                            </Alert>
                        )}

                        {preview?.statistics && (
                            <Box sx={{ mb: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: '8px' }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                                    Clone Statistics
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <Chip label={`Total: ${preview.statistics.totalHolidays}`} size="small" />
                                    <Chip label={`Fixed: ${preview.statistics.fixedHolidays}`} size="small" color="primary" />
                                    <Chip label={`Lunar: ${preview.statistics.lunarHolidays}`} size="small" color="secondary" />
                                    {preview.statistics.missingDatasets > 0 && (
                                        <Chip label={`Missing: ${preview.statistics.missingDatasets}`} size="small" color="error" />
                                    )}
                                </Box>
                            </Box>
                        )}

                        <TableContainer sx={{ maxHeight: 400 }}>
                            <Table stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Holiday</TableCell>
                                        <TableCell>Source Date</TableCell>
                                        <TableCell>New Date</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {preview?.holidays?.map((holiday) => (
                                        <TableRow
                                            key={holiday._id || holiday.name}
                                            sx={{
                                                opacity: isHolidayRemoved(holiday._id || holiday.name) ? 0.4 : 1,
                                                textDecoration: isHolidayRemoved(holiday._id || holiday.name) ? 'line-through' : 'none'
                                            }}
                                        >
                                            <TableCell>{holiday.name}</TableCell>
                                            <TableCell>
                                                {holiday.sourceDate ? new Date(holiday.sourceDate).toLocaleDateString() : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    type="date"
                                                    size="small"
                                                    value={getHolidayValue(holiday, 'date')?.split('T')[0] || holiday.date?.split('T')[0] || ''}
                                                    onChange={(e) => handleEditHoliday(holiday._id || holiday.name, 'date', e.target.value)}
                                                    disabled={isHolidayRemoved(holiday._id || holiday.name)}
                                                    sx={{ width: 150 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    size="small"
                                                    value={getHolidayValue(holiday, 'type') || holiday.type || 'Company'}
                                                    onChange={(e) => handleEditHoliday(holiday._id || holiday.name, 'type', e.target.value)}
                                                    disabled={isHolidayRemoved(holiday._id || holiday.name)}
                                                    sx={{ width: 120 }}
                                                >
                                                    <MenuItem value="Company">Company</MenuItem>
                                                    <MenuItem value="National">National</MenuItem>
                                                    <MenuItem value="Optional">Optional</MenuItem>
                                                </Select>
                                            </TableCell>
                                            <TableCell>{getStatusChip(holiday.status)}</TableCell>
                                            <TableCell>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleRemoveHoliday(holiday._id || holiday.name)}
                                                    disabled={isHolidayRemoved(holiday._id || holiday.name)}
                                                    color="error"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                );

            case 2:
                return (
                    <Box sx={{ py: 2 }}>
                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                            Confirm Clone Operation
                        </Typography>

                        <Alert severity="info" sx={{ mb: 2 }}>
                            You are about to clone{' '}
                            {preview?.holidays?.filter(h => !isHolidayRemoved(h._id || h.name)).length || 0} holidays
                            from {preview?.sourceYear} to {preview?.targetYear}.
                        </Alert>

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            After confirmation:
                        </Typography>
                        <ul style={{ marginTop: 0 }}>
                            <li>Holidays will be created in the target year</li>
                            <li>Attendance calendar will be updated automatically</li>
                            <li>Clone operation will be logged for audit</li>
                        </ul>
                    </Box>
                );

            default:
                return null;
        }
    };

    const canProceed = () => {
        if (activeStep === 0) {
            if (!sourceYearId) return false;
            if (createNewYear) {
                return newYearData.year && newYearData.startDate && newYearData.endDate;
            }
            return !!targetYearId;
        }
        return true;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CopyIcon />
                    Clone Holidays to New Year
                </Box>
            </DialogTitle>

            <DialogContent>
                <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {renderStepContent()}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                {activeStep > 0 && (
                    <Button onClick={() => setActiveStep(activeStep - 1)} disabled={loading}>
                        Back
                    </Button>
                )}
                {activeStep < steps.length - 1 ? (
                    <Button
                        variant="contained"
                        onClick={activeStep === 0 ? handleGeneratePreview : () => setActiveStep(activeStep + 1)}
                        disabled={!canProceed() || loading}
                    >
                        {loading ? <CircularProgress size={24} /> : 'Next'}
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        onClick={handleConfirmClone}
                        disabled={loading}
                        sx={{ bgcolor: '#dc3545' }}
                    >
                        {loading ? <CircularProgress size={24} /> : 'Confirm & Clone'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default CloneHolidaysModal;
