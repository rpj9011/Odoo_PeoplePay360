// src/components/UserLogModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, Box, IconButton, Paper, Stack, Chip, Divider, Alert } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WorkIcon from '@mui/icons-material/Work';
import TimerIcon from '@mui/icons-material/Timer';
import WatchLaterIcon from '@mui/icons-material/WatchLater';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import { formatTimeForDisplay, formatDateForDisplay, formatDuration, formatDurationShort } from '../utils/attendanceRenderUtils';
import '../styles/UserLogModal.css';

import { SkeletonBox } from '../components/SkeletonLoaders';

const UserLogModal = ({ open, onClose, log, date, loading = false, holiday, leave }) => {
    const [timelineEvents, setTimelineEvents] = useState([]);

    // Process sessions and breaks into a chronological timeline
    // Breaks separate work sessions - split sessions at break boundaries
    useEffect(() => {
        if (log) {
            // Process sessions
            const sessions = (log.sessions || [])
                .filter(s => s && (s.startTime || s.start_time))
                .map(s => ({
                    type: 'session',
                    startTime: s.startTime || s.start_time,
                    endTime: s.endTime || s.end_time,
                    location: s.location || s.address || null
                }));
            
            // Process breaks
            const breaks = (Array.isArray(log.breaks) ? log.breaks : [])
                .filter(b => b && (b.startTime || b.start_time))
                .map(b => ({
                    type: 'break',
                    startTime: b.startTime || b.start_time,
                    endTime: b.endTime || b.end_time,
                    breakType: b.breakType || b.type || 'Break',
                    location: b.location || b.address || null
                }));
            
            // Split sessions at break boundaries
            // Example: Session 9am-5pm with break 12pm-1pm becomes:
            // Session 9am-12pm, Break 12pm-1pm, Session 1pm-5pm
            const timeline = [];
            
            for (const session of sessions) {
                const sessionStart = new Date(session.startTime);
                const sessionEnd = session.endTime ? new Date(session.endTime) : null;
                
                // Find all breaks that occur within this session
                const breaksInSession = breaks.filter(breakItem => {
                    const breakStart = new Date(breakItem.startTime);
                    const breakEnd = breakItem.endTime ? new Date(breakItem.endTime) : null;
                    
                    // Break is within session if:
                    // - Break starts after session starts
                    // - Break ends before session ends (or session has no end)
                    return breakStart >= sessionStart && 
                           (!sessionEnd || (breakEnd && breakEnd <= sessionEnd));
                }).sort((a, b) => {
                    return new Date(a.startTime) - new Date(b.startTime);
                });
                
                if (breaksInSession.length === 0) {
                    // No breaks in this session, add it as-is
                    timeline.push(session);
                } else {
                    // Split session at break boundaries
                    let currentStart = sessionStart;
                    
                    for (let i = 0; i < breaksInSession.length; i++) {
                        const breakItem = breaksInSession[i];
                        const breakStart = new Date(breakItem.startTime);
                        const breakEnd = breakItem.endTime ? new Date(breakItem.endTime) : null;
                        
                        // Add work session before this break
                        if (currentStart < breakStart) {
                            timeline.push({
                                type: 'session',
                                startTime: currentStart.toISOString(),
                                endTime: breakStart.toISOString(),
                                location: session.location
                            });
                        }
                        
                        // Add the break
                        timeline.push(breakItem);
                        
                        // Update current start to after the break
                        currentStart = breakEnd || breakStart;
                    }
                    
                    // Add remaining work session after last break
                    if (sessionEnd && currentStart < sessionEnd) {
                        timeline.push({
                            type: 'session',
                            startTime: currentStart.toISOString(),
                            endTime: sessionEnd.toISOString(),
                            location: session.location
                        });
                    } else if (!sessionEnd && currentStart > sessionStart) {
                        // Session has no end time, add remaining portion
                        timeline.push({
                            type: 'session',
                            startTime: currentStart.toISOString(),
                            endTime: null,
                            location: session.location
                        });
                    }
                }
            }
            
            // Add any breaks that don't fall within any session
            for (const breakItem of breaks) {
                const breakStart = new Date(breakItem.startTime);
                const isInSession = sessions.some(session => {
                    const sessionStart = new Date(session.startTime);
                    const sessionEnd = session.endTime ? new Date(session.endTime) : null;
                    return breakStart >= sessionStart && 
                           (!sessionEnd || breakStart <= sessionEnd);
                });
                
                if (!isInSession) {
                    timeline.push(breakItem);
                }
            }
            
            // Sort timeline chronologically
            timeline.sort((a, b) => {
                const timeA = new Date(a.startTime);
                const timeB = new Date(b.startTime);
                return timeA - timeB;
            });
            
            setTimelineEvents(timeline);
        } else {
            setTimelineEvents([]);
        }
    }, [log]);

    const calculateStats = useMemo(() => {
        if (!log) return { 
            totalWorkMinutes: 0, 
            totalBreakMinutes: 0, 
            paidBreakMinutes: 0,
            firstCheckIn: null,
            lastCheckOut: null
        };
        
        const sessions = Array.isArray(log.sessions) ? log.sessions : [];
        // Ensure breaks is always an array (backend provides breaks array and breaksSummary object)
        const breaks = Array.isArray(log.breaks) ? log.breaks : [];
        
        // Calculate total work time
        const totalWorkMinutes = sessions.reduce((acc, session) => {
            if (session.startTime || session.start_time) {
                const start = new Date(session.startTime || session.start_time);
                const end = session.endTime || session.end_time ? 
                    new Date(session.endTime || session.end_time) : new Date();
                return acc + (end - start) / (1000 * 60);
            }
            return acc;
        }, 0);
        
        // Calculate total break time
        const totalBreakMinutes = breaks.reduce((acc, breakItem) => {
            if (breakItem.startTime || breakItem.start_time) {
                const start = new Date(breakItem.startTime || breakItem.start_time);
                const end = breakItem.endTime || breakItem.end_time ? 
                    new Date(breakItem.endTime || breakItem.end_time) : new Date();
                return acc + (end - start) / (1000 * 60);
            }
            return acc;
        }, 0);
        
        // Calculate paid break time
        const paidBreakMinutes = breaks
            .filter(b => (b.breakType || b.type || '').toLowerCase() === 'paid')
            .reduce((acc, breakItem) => {
                if (breakItem.startTime || breakItem.start_time) {
                    const start = new Date(breakItem.startTime || breakItem.start_time);
                    const end = breakItem.endTime || breakItem.end_time ? 
                        new Date(breakItem.endTime || breakItem.end_time) : new Date();
                    return acc + (end - start) / (1000 * 60);
                }
                return acc;
            }, 0);
        
        // Get first check-in and last check-out
        const firstCheckIn = sessions.length > 0 ? 
            (sessions[0].startTime || sessions[0].start_time) : null;
        
        const lastCheckOut = sessions.length > 0 && sessions[sessions.length - 1].endTime ? 
            (sessions[sessions.length - 1].endTime || sessions[sessions.length - 1].end_time) : 
            (log.clockOutTime || null);
        
        return {
            totalWorkMinutes: Math.max(0, totalWorkMinutes - totalBreakMinutes),
            totalBreakMinutes,
            paidBreakMinutes,
            firstCheckIn,
            lastCheckOut
        };
    }, [log]);

    // Get shift time range for header
    const getShiftTimeRange = () => {
        if (!log || !log.shiftInfo) return '';
        const shift = log.shiftInfo;
        const startTime = shift.startTime || shift.start_time || '09:00';
        const endTime = shift.endTime || shift.end_time || '18:00';
        
        // Convert 24h to 12h format
        const formatTo12h = (time24) => {
            if (!time24) return '';
            const [hours, minutes] = time24.split(':');
            const hour = parseInt(hours);
            const period = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes} ${period}`;
        };
        
        return `${formatTo12h(startTime)} - ${formatTo12h(endTime)}`;
    };

    // Get time of day label (Morning/Afternoon/Evening)
    const getTimeOfDay = () => {
        if (!date) return 'Morning';
        const dateObj = date instanceof Date ? date : new Date(date);
        if (isNaN(dateObj.getTime())) return 'Morning';
        const hour = dateObj.getHours();
        if (hour < 12) return 'Morning';
        if (hour < 17) return 'Afternoon';
        return 'Evening';
    };

    if (!open) return null;

    const dateObj = date instanceof Date ? date : (date ? new Date(date) : null);
    const fullDateStr = dateObj ? formatDateForDisplay(dateObj) : 'Log Details';
    const shiftTimeRange = getShiftTimeRange();
    const timeOfDay = getTimeOfDay();

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            fullWidth 
            maxWidth="md" 
            PaperProps={{ className: 'user-log-dialog' }}
        >
            <DialogTitle className="dialog-header">
                <Box className="header-content">
                    <Box>
                        <Typography variant="body1" className="header-date">
                            {fullDateStr} {timeOfDay} {shiftTimeRange && `[${shiftTimeRange}]`}
                        </Typography>
                    </Box>
                    <Box className="header-actions">
                        <IconButton onClick={onClose} size="small" className="close-button">
                            <CloseIcon />
                        </IconButton>
                    </Box>
                </Box>
            </DialogTitle>
            
            <DialogContent className="dialog-content">
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                    </Box>
                ) : !log && !holiday && !leave ? (
                    <Alert severity="info">No attendance data available for this date.</Alert>
                ) : !log && (holiday || leave) ? (
                    <Box className="audit-timeline-container">
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {holiday ? (
                                <Box>
                                    <Typography variant="h6" gutterBottom>
                                        Holiday: {holiday.name}
                                    </Typography>
                                    {holiday.description && (
                                        <Typography variant="body2" color="text.secondary">
                                            {holiday.description}
                                        </Typography>
                                    )}
                                </Box>
                            ) : leave ? (
                                <Box>
                                    <Typography variant="h6" gutterBottom>
                                        Leave: {formatLeaveRequestType(leave.requestType || leave.leaveType || 'Leave')}
                                    </Typography>
                                    {leave.leaveType && (
                                        <Box sx={{ mt: 1, mb: 1 }}>
                                            <Chip 
                                                label={leave.leaveType === 'Full Day' ? 'Full Day Leave' : leave.leaveType}
                                                color={leave.leaveType === 'Full Day' ? 'primary' : 'secondary'}
                                                variant="outlined"
                                                sx={{ fontWeight: 600 }}
                                            />
                                        </Box>
                                    )}
                                    {/* CRITICAL FIX: Always display employee's leave reason when available */}
                                    {/* Check multiple sources: log.leaveReason, leave.reason, log.leaveInfo.reason */}
                                    {(log?.leaveReason || leave?.reason || log?.leaveInfo?.reason) ? (
                                        <Box sx={{ mt: 1, p: 1.5, bgcolor: '#e3f2fd', borderRadius: 1, border: '1px solid #2196f3' }}>
                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#1565c0', display: 'block', mb: 0.5 }}>
                                                Employee's Reason:
                                            </Typography>
                                            <Typography variant="body2" color="text.primary">
                                                {log?.leaveReason || leave?.reason || log?.leaveInfo?.reason}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                                            No reason provided
                                        </Typography>
                                    )}
                                    {/* Display half-day reason if this is a half-day leave */}
                                    {log?.isHalfDay && log?.halfDayReason && (
                                        <Box sx={{ mt: 1, p: 1.5, bgcolor: '#fff3cd', borderRadius: 1, border: '1px solid #ffc107' }}>
                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#856404', display: 'block', mb: 0.5 }}>
                                                Half-Day Reason:
                                            </Typography>
                                            <Typography variant="body2" color="text.primary">
                                                {log.halfDayReason}
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>
                            ) : null}
                        </Alert>
                    </Box>
                ) : (
                    <Box className="audit-timeline-container">
                        {/* Summary Cards */}
                        <Box className="summary-cards-container">
                            <Paper className="summary-stat-card">
                                <Box className="summary-stat-content">
                                    <WorkIcon className="summary-stat-icon summary-stat-icon-primary" />
                                    <Box className="summary-stat-text">
                                        <Typography className="summary-stat-label">Total Work Time</Typography>
                                        <Typography className="summary-stat-value">
                                            {formatDuration(calculateStats.totalWorkMinutes)}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                            <Paper className="summary-stat-card">
                                <Box className="summary-stat-content">
                                    <TimerIcon className="summary-stat-icon summary-stat-icon-warning" />
                                    <Box className="summary-stat-text">
                                        <Typography className="summary-stat-label">Total Breaks</Typography>
                                        <Typography className="summary-stat-value">
                                            {formatDuration(calculateStats.totalBreakMinutes)}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                            <Paper className="summary-stat-card">
                                <Box className="summary-stat-content">
                                    <WatchLaterIcon className="summary-stat-icon summary-stat-icon-info" />
                                    <Box className="summary-stat-text">
                                        <Typography className="summary-stat-label">Paid Breaks</Typography>
                                        <Typography className="summary-stat-value">
                                            {formatDuration(calculateStats.paidBreakMinutes)}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                            <Paper className="summary-stat-card">
                                <Box className="summary-stat-content">
                                    <AccessTimeIcon className="summary-stat-icon summary-stat-icon-success" />
                                    <Box className="summary-stat-text">
                                        <Typography className="summary-stat-label">First Check-in</Typography>
                                        <Typography className="summary-stat-value">
                                            {formatTimeForDisplay(calculateStats.firstCheckIn) || '--:--'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                            <Paper className="summary-stat-card">
                                <Box className="summary-stat-content">
                                    <AccessTimeIcon className="summary-stat-icon summary-stat-icon-error" />
                                    <Box className="summary-stat-text">
                                        <Typography className="summary-stat-label">Last Check-out</Typography>
                                        <Typography className="summary-stat-value">
                                            {formatTimeForDisplay(calculateStats.lastCheckOut) || '--:--'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                        </Box>

                        {/* Leave reason: Display when log exists and has leave information */}
                        {(log?.attendanceStatus === 'Leave' || log?.leaveInfo || log?.leaveReason || leave) && (
                            <Box sx={{ mt: 2, mb: 2, p: 1.5, bgcolor: '#e3f2fd', borderRadius: 1, border: '1px solid #2196f3' }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: '#1565c0', display: 'block', mb: 0.5 }}>
                                    Employee's Leave Reason:
                                </Typography>
                                <Typography variant="body2" color="text.primary">
                                    {log?.leaveReason || log?.leaveInfo?.reason || leave?.reason || 'No reason provided'}
                                </Typography>
                                {(log?.leaveInfo?.leaveType || leave?.leaveType) && (
                                    <Box sx={{ mt: 1 }}>
                                        <Chip 
                                            label={(log?.leaveInfo?.leaveType || leave?.leaveType) === 'Full Day' ? 'Full Day Leave' : (log?.leaveInfo?.leaveType || leave?.leaveType)}
                                            color={(log?.leaveInfo?.leaveType || leave?.leaveType) === 'Full Day' ? 'primary' : 'secondary'}
                                            variant="outlined"
                                            size="small"
                                            sx={{ fontWeight: 600 }}
                                        />
                                    </Box>
                                )}
                            </Box>
                        )}

                        {/* Admin override note: strict check — overrideReason required */}
                        {log?.overriddenByAdmin === true && typeof log?.overrideReason === 'string' && log.overrideReason.trim().length > 0 && (
                            <Box sx={{ mt: 2, mb: 2, p: 1.5, bgcolor: '#fff8e1', borderRadius: 1, border: '1px solid #ffc107' }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: '#856404', display: 'block', mb: 0.5 }}>
                                    Overridden
                                </Typography>
                                <Typography variant="body2" color="text.primary">
                                    {log.overrideReason.trim()}
                                </Typography>
                            </Box>
                        )}

                        {/* Timeline Events */}
                        {timelineEvents.length > 0 ? (
                            <Box className="timeline-events">
                                {timelineEvents.map((event, eventIndex) => {
                                    const isBreak = event.type === 'break';
                                    const duration = event.endTime ? 
                                        (new Date(event.endTime) - new Date(event.startTime)) / (1000 * 60) : 0;
                                    
                                    // Get break label text
                                    const getBreakLabel = () => {
                                        if (!isBreak) return '';
                                        const breakType = (event.breakType || '').toLowerCase();
                                        if (breakType === 'paid' || breakType === 'meal') {
                                            return 'Meal Break';
                                        }
                                        return 'Unpaid Break';
                                    };

                                    return (
                                        <Box key={`event-${eventIndex}`} className="timeline-event-block">
                                            {/* Work Session or Break Card */}
                                            <Paper className={`timeline-entry-card ${isBreak ? 'break-card' : 'work-session-card'}`}>
                                                <Box className="timeline-entry-content">
                                                    {/* Start Time (Left) */}
                                                    <Box className="timeline-entry-left">
                                                        <Box className="timeline-time-icon-group">
                                                            <Box className={`timeline-icon ${isBreak ? 'timeline-icon-break' : 'timeline-icon-work'}`}>
                                                                <Box className={`icon-square ${isBreak ? 'icon-square-orange' : 'icon-square-green'}`}></Box>
                                                            </Box>
                                                            <Typography className={`timeline-time ${isBreak ? 'timeline-time-break' : 'timeline-time-work'}`}>
                                                                {formatTimeForDisplay(event.startTime)}
                                                            </Typography>
                                                        </Box>
                                                    </Box>

                                                    {/* Dotted Connector with Break Label (for breaks) */}
                                                    <Box className="timeline-connector">
                                                        {isBreak ? (
                                                            <Box className="break-label-center">
                                                                <Typography className="break-label-text">
                                                                    {getBreakLabel()}
                                                                </Typography>
                                                            </Box>
                                                        ) : (
                                                            <Box className="dotted-line"></Box>
                                                        )}
                                                    </Box>

                                                    {/* End Time (Right) */}
                                                    <Box className="timeline-entry-right">
                                                        <Box className="timeline-time-icon-group">
                                                            <Box className={`timeline-icon ${isBreak ? 'timeline-icon-break' : 'timeline-icon-work'}`}>
                                                                <Box className={`icon-square ${isBreak ? 'icon-square-orange' : 'icon-square-green'}`}></Box>
                                                            </Box>
                                                            <Typography className={`timeline-time ${isBreak ? 'timeline-time-break' : 'timeline-time-work'}`}>
                                                                {formatTimeForDisplay(event.endTime) || '--:--'}
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                </Box>
                                            </Paper>

                                            {/* Break Label (only for breaks) */}
                                            {isBreak && (
                                                <Box className="break-label-container">
                                                    <Chip 
                                                        label={`${event.breakType || 'Break'} Break - ${formatDurationShort(duration)}`}
                                                        className={`break-label-chip ${(event.breakType || '').toLowerCase() === 'paid' ? 'break-label-paid' : 'break-label-unpaid'}`}
                                                        size="small"
                                                    />
                                                </Box>
                                            )}
                                        </Box>
                                    );
                                })}
                            </Box>
                        ) : (
                            <Alert severity="info" className="timeline-empty-alert">
                                No timeline events recorded for this day.
                            </Alert>
                        )}

                        {/* Summary Footer */}
                        <Box className="summary-footer">
                            <Box className="summary-item">
                                <Typography className="summary-label">First Check-In</Typography>
                                <Typography className="summary-value summary-value-success">
                                    {formatTimeForDisplay(calculateStats.firstCheckIn) || '-'}
                                </Typography>
                            </Box>
                            <Box className="summary-item">
                                <Typography className="summary-label">Last Check-Out</Typography>
                                <Typography className="summary-value">
                                    {formatTimeForDisplay(calculateStats.lastCheckOut) || '-'}
                                </Typography>
                            </Box>
                            <Box className="summary-item">
                                <Typography className="summary-label">Total Hours</Typography>
                                <Typography className="summary-value summary-value-success">
                                    {formatDuration(calculateStats.totalWorkMinutes)}
                                </Typography>
                            </Box>
                            <Box className="summary-item">
                                <Typography className="summary-label">Paid break</Typography>
                                <Typography className="summary-value summary-value-info">
                                    {formatDuration(calculateStats.paidBreakMinutes)}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default UserLogModal;
