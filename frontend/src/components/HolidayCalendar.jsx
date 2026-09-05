// src/components/HolidayCalendar.jsx
import React, { memo } from 'react';
import { Typography, Box, Paper, List, ListItem, ListItemText, ListItemIcon, Divider } from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CelebrationIcon from '@mui/icons-material/Celebration';

const HolidayCalendar = ({ holidays }) => {

    const formatDate = (dateString, isTentative = false) => {
        if (!dateString || isTentative) {
            return 'Tentative (Date not decided)';
        }
        const d = new Date(dateString);
        if (isNaN(d.getTime())) {
            return 'Tentative (Date not decided)';
        }
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        return d.toLocaleDateString('en-US', options);
    };

    return (
        <Paper elevation={0} sx={{ p: 3, borderRadius: '12px', border: '1px solid #e0e0e0', height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <CalendarMonthIcon color="action" />
                <Typography variant="h6" fontWeight={600}>Company Holidays</Typography>
            </Box>
            <Divider sx={{ mb: 1 }} />
            <List sx={{ maxHeight: '400px', overflowY: 'auto' }}>
                {holidays.length > 0 ? (
                    holidays
                        .filter(holiday => holiday.date && !holiday.isTentative) // Only show holidays with dates
                        .sort((a, b) => new Date(a.date) - new Date(b.date)) // Sort by date
                        .map((holiday, index) => (
                            <ListItem key={holiday._id || index} disablePadding>
                                <ListItemIcon sx={{ minWidth: '40px' }}>
                                    <CelebrationIcon sx={{ color: 'var(--theme-red)' }} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={holiday.name}
                                    secondary={formatDate(holiday.date, holiday.isTentative)}
                                    primaryTypographyProps={{ fontWeight: 500 }}
                                />
                            </ListItem>
                        ))
                ) : (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
                        No upcoming holidays have been declared.
                    </Typography>
                )}
            </List>
        </Paper>
    );
};

export default HolidayCalendar;