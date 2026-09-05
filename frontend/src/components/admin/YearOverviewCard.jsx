import React from 'react';
import { Card, CardContent, Box, Typography, Chip, Switch, FormControlLabel, Grid } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';

const YearOverviewCard = ({ year, holidays, onToggleLock, isAdmin = true }) => {
    if (!year) return null;

    // Calculate holiday counts
    const totalHolidays = holidays.length;
    const nationalHolidays = holidays.filter(h => h.type === 'National').length;
    const optionalHolidays = holidays.filter(h => h.type === 'Optional').length;

    return (
        <Card
            sx={{
                mb: 3,
                borderRadius: '16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid #f0f0f0',
                background: 'linear-gradient(135deg, #ffffff 0%, #fafafa 100%)'
            }}
        >
            <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                            Year {year.year}
                        </Typography>
                        <Chip
                            label={year.isActive ? 'Active' : 'Archived'}
                            color={year.isActive ? 'error' : 'default'}
                            size="small"
                            sx={{ fontWeight: 500 }}
                        />
                    </Box>
                    {isAdmin && !year.isActive && (
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={year.isLocked}
                                    onChange={() => onToggleLock && onToggleLock(year._id)}
                                    icon={<LockOpenIcon />}
                                    checkedIcon={<LockIcon />}
                                />
                            }
                            label={year.isLocked ? 'Locked' : 'Unlocked'}
                            sx={{ m: 0 }}
                        />
                    )}
                </Box>

                <Grid container spacing={3}>
                    <Grid item xs={12} sm={4}>
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: '12px',
                                bgcolor: 'rgba(211, 47, 47, 0.05)',
                                border: '1px solid rgba(211, 47, 47, 0.1)'
                            }}
                        >
                            <Typography variant="h4" sx={{ fontWeight: 700, color: 'error.main', mb: 0.5 }}>
                                {totalHolidays}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Total Holidays
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: '12px',
                                bgcolor: 'rgba(25, 118, 210, 0.05)',
                                border: '1px solid rgba(25, 118, 210, 0.1)'
                            }}
                        >
                            <Typography variant="h4" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>
                                {nationalHolidays}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                National Holidays
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: '12px',
                                bgcolor: 'rgba(156, 39, 176, 0.05)',
                                border: '1px solid rgba(156, 39, 176, 0.1)'
                            }}
                        >
                            <Typography variant="h4" sx={{ fontWeight: 700, color: 'secondary.main', mb: 0.5 }}>
                                {optionalHolidays}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Optional Holidays
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>

                <Box sx={{ mt: 2, display: 'flex', gap: 2, fontSize: '14px', color: 'text.secondary' }}>
                    <Typography variant="caption">
                        Start: {new Date(year.startDate).toLocaleDateString()}
                    </Typography>
                    <Typography variant="caption">•</Typography>
                    <Typography variant="caption">
                        End: {new Date(year.endDate).toLocaleDateString()}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );
};

export default YearOverviewCard;
