// frontend/src/components/ShiftForm.jsx
// Create / edit dialog for the new Shift schema (weeklyPattern + timezone).
// Replaces the old single-block start/end/duration form.
//
// Features:
//   • 7-row day table: day label, Working? toggle, Start Time, End Time, Break (min)
//   • Timezone selector (common IANA zones — enough for a demo; expandable)
//   • Live totalWeeklyHours summary computed in-browser as the user edits rows
//   • Flexible shifts: time columns are disabled (no fixed times for flexible schedules)

import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, MenuItem, FormControl, InputLabel, Select,
    Stack, Box, Typography, Divider, Switch, FormControlLabel,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Chip,
} from '@mui/material';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { SkeletonBox } from '../components/SkeletonLoaders';

// ── IANA timezone options (representative list — covers most deployment regions) ──
const TIMEZONE_OPTIONS = [
    'Asia/Kolkata',
    'Asia/Dubai',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Australia/Sydney',
    'Pacific/Auckland',
    'UTC',
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Build a fresh default weeklyPattern for a given shiftType
function buildDefaultPattern(shiftType) {
    return DAYS.map(day => {
        const isWeekday = !['Sat', 'Sun'].includes(day);
        return {
            day,
            isWorkingDay: isWeekday,
            startTime:    (isWeekday && shiftType === 'Fixed') ? '09:00' : '',
            endTime:      (isWeekday && shiftType === 'Fixed') ? '18:00' : '',
            breakMinutes: isWeekday ? 60 : 0,
        };
    });
}

// Parse "HH:mm" → fractional hours, or null
function parseH(t) {
    if (!t || typeof t !== 'string' || !t.includes(':')) return null;
    const [h, m] = t.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h + m / 60;
}

// Compute total weekly hours from a weeklyPattern array
function computeWeeklyHours(pattern, shiftType) {
    if (shiftType === 'Flexible') {
        // For flexible, count working days × 8h as a nominal total
        const workingDays = pattern.filter(e => e.isWorkingDay).length;
        return workingDays * 8;
    }
    let total = 0;
    for (const entry of pattern) {
        if (!entry.isWorkingDay) continue;
        const s = parseH(entry.startTime);
        const e = parseH(entry.endTime);
        if (s == null || e == null) continue;
        let diff = e - s;
        if (diff < 0) diff += 24;
        total += Math.max(0, diff - (entry.breakMinutes || 0) / 60);
    }
    return Math.round(total * 100) / 100;
}

const getInitialState = () => ({
    shiftName:    '',
    shiftType:    'Fixed',
    timezone:     'Asia/Kolkata',
    weeklyPattern: buildDefaultPattern('Fixed'),
});

const ShiftForm = ({ open, onClose, onSave, shift, isSaving }) => {
    const isEditing = Boolean(shift);
    const [formData, setFormData] = useState(getInitialState());

    // Populate form when editing an existing shift
    useEffect(() => {
        if (!open) return;
        if (isEditing) {
            // Normalise weeklyPattern: always 7 entries in DAYS order
            const existingPattern = Array.isArray(shift.weeklyPattern) && shift.weeklyPattern.length === 7
                ? shift.weeklyPattern
                : buildDefaultPattern(shift.shiftType || 'Fixed');

            const pattern = DAYS.map(day => {
                const found = existingPattern.find(e => e.day === day) || {};
                return {
                    day,
                    isWorkingDay: !!found.isWorkingDay,
                    startTime:    found.startTime    || '',
                    endTime:      found.endTime      || '',
                    breakMinutes: found.breakMinutes ?? 0,
                };
            });

            setFormData({
                shiftName:     shift.shiftName    || '',
                shiftType:     shift.shiftType    || 'Fixed',
                timezone:      shift.timezone     || 'Asia/Kolkata',
                weeklyPattern: pattern,
            });
        } else {
            setFormData(getInitialState());
        }
    }, [shift, open, isEditing]);

    // When shiftType changes, rebuild the pattern defaults
    const handleShiftTypeChange = (e) => {
        const newType = e.target.value;
        setFormData(prev => ({
            ...prev,
            shiftType: newType,
            weeklyPattern: buildDefaultPattern(newType),
        }));
    };

    const handleTopChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Update a single cell in the weeklyPattern
    const handleDayChange = (dayIndex, field, value) => {
        setFormData(prev => {
            const pattern = prev.weeklyPattern.map((entry, i) => {
                if (i !== dayIndex) return entry;
                const updated = { ...entry, [field]: value };
                // When toggling a day off, clear its times
                if (field === 'isWorkingDay' && !value) {
                    updated.startTime    = '';
                    updated.endTime      = '';
                    updated.breakMinutes = 0;
                }
                return updated;
            });
            return { ...prev, weeklyPattern: pattern };
        });
    };

    // Live-computed weekly hours (shown as read-only summary)
    const totalWeeklyHours = useMemo(
        () => computeWeeklyHours(formData.weeklyPattern, formData.shiftType),
        [formData.weeklyPattern, formData.shiftType]
    );

    const handleSave = () => {
        if (!formData.shiftName.trim()) return;
        onSave({
            shiftName:     formData.shiftName.trim(),
            shiftType:     formData.shiftType,
            timezone:      formData.timezone,
            weeklyPattern: formData.weeklyPattern,
            // Pass computed value so backend pre-save hook is consistent
            totalWeeklyHours,
        });
    };

    const isFlexible = formData.shiftType === 'Flexible';

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullWidth
            maxWidth="md"
            PaperProps={{ sx: { borderRadius: '12px' } }}
        >
            <DialogTitle sx={{ p: 3, pb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <ScheduleOutlinedIcon color="action" />
                    <Typography variant="h6">
                        {isEditing ? 'Edit Working Schedule' : 'Add Working Schedule'}
                    </Typography>
                </Box>
            </DialogTitle>

            <Divider />

            <DialogContent sx={{ p: 3 }}>
                <Stack spacing={3}>
                    {/* ── Top row: Name / Type / Timezone ── */}
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                            name="shiftName"
                            label="Schedule Name"
                            value={formData.shiftName}
                            onChange={handleTopChange}
                            fullWidth
                            required
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                        />

                        <FormControl sx={{ minWidth: 150 }}>
                            <InputLabel>Type</InputLabel>
                            <Select
                                name="shiftType"
                                label="Type"
                                value={formData.shiftType}
                                onChange={handleShiftTypeChange}
                                sx={{ borderRadius: '8px' }}
                            >
                                <MenuItem value="Fixed">Fixed</MenuItem>
                                <MenuItem value="Flexible">Flexible</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl sx={{ minWidth: 200 }}>
                            <InputLabel>Timezone</InputLabel>
                            <Select
                                name="timezone"
                                label="Timezone"
                                value={formData.timezone}
                                onChange={handleTopChange}
                                sx={{ borderRadius: '8px' }}
                            >
                                {TIMEZONE_OPTIONS.map(tz => (
                                    <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>

                    {/* ── Weekly pattern table ── */}
                    <Box>
                        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: '#374151' }}>
                            Weekly Pattern
                        </Typography>

                        {isFlexible && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Flexible schedule — employees can choose their own start/end times.
                                Mark which days are working days; specific times are not required.
                            </Typography>
                        )}

                        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: '8px' }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', width: 70 }}>Day</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', width: 110 }}>Working?</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Start Time</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>End Time</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', width: 130 }}>Break (min)</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {formData.weeklyPattern.map((entry, idx) => {
                                        const isWeekend = ['Sat', 'Sun'].includes(entry.day);
                                        const disabled  = !entry.isWorkingDay || isFlexible;
                                        return (
                                            <TableRow
                                                key={entry.day}
                                                sx={{
                                                    bgcolor: entry.isWorkingDay ? '#fff' : '#FAFAFA',
                                                    opacity: entry.isWorkingDay ? 1 : 0.6,
                                                }}
                                            >
                                                {/* Day label */}
                                                <TableCell>
                                                    <Typography
                                                        variant="body2"
                                                        fontWeight={entry.isWorkingDay ? 700 : 400}
                                                        color={isWeekend ? '#9CA3AF' : '#111827'}
                                                    >
                                                        {entry.day}
                                                    </Typography>
                                                </TableCell>

                                                {/* Working day toggle */}
                                                <TableCell>
                                                    <Switch
                                                        checked={entry.isWorkingDay}
                                                        onChange={(e) => handleDayChange(idx, 'isWorkingDay', e.target.checked)}
                                                        size="small"
                                                        color="success"
                                                    />
                                                </TableCell>

                                                {/* Start time */}
                                                <TableCell>
                                                    <TextField
                                                        type="time"
                                                        value={entry.startTime}
                                                        onChange={(e) => handleDayChange(idx, 'startTime', e.target.value)}
                                                        disabled={disabled}
                                                        size="small"
                                                        InputLabelProps={{ shrink: true }}
                                                        sx={{
                                                            width: 130,
                                                            '& .MuiOutlinedInput-root': { borderRadius: '6px' },
                                                        }}
                                                    />
                                                </TableCell>

                                                {/* End time */}
                                                <TableCell>
                                                    <TextField
                                                        type="time"
                                                        value={entry.endTime}
                                                        onChange={(e) => handleDayChange(idx, 'endTime', e.target.value)}
                                                        disabled={disabled}
                                                        size="small"
                                                        InputLabelProps={{ shrink: true }}
                                                        sx={{
                                                            width: 130,
                                                            '& .MuiOutlinedInput-root': { borderRadius: '6px' },
                                                        }}
                                                    />
                                                </TableCell>

                                                {/* Break minutes */}
                                                <TableCell>
                                                    <TextField
                                                        type="number"
                                                        value={entry.breakMinutes}
                                                        onChange={(e) =>
                                                            handleDayChange(idx, 'breakMinutes', Math.max(0, parseInt(e.target.value, 10) || 0))
                                                        }
                                                        disabled={!entry.isWorkingDay}
                                                        size="small"
                                                        inputProps={{ min: 0, step: 5 }}
                                                        sx={{
                                                            width: 100,
                                                            '& .MuiOutlinedInput-root': { borderRadius: '6px' },
                                                        }}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>

                    {/* ── Weekly hours summary ── */}
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 1.5,
                            pt: 0.5,
                        }}
                    >
                        <Typography variant="body2" color="text.secondary">
                            Total weekly hours{isFlexible ? ' (nominal)' : ''}:
                        </Typography>
                        <Chip
                            label={`${totalWeeklyHours} h`}
                            color={totalWeeklyHours > 0 ? 'success' : 'default'}
                            variant="outlined"
                            size="small"
                            sx={{ fontWeight: 700, fontSize: '0.82rem' }}
                        />
                    </Box>
                </Stack>
            </DialogContent>

            <Divider />

            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} color="inherit">
                    Cancel
                </Button>
                <Button
                    onClick={handleSave}
                    variant="contained"
                    disabled={isSaving || !formData.shiftName.trim()}
                    sx={{ minWidth: 80 }}
                >
                    {isSaving
                        ? <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                        : 'Save'
                    }
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ShiftForm;
