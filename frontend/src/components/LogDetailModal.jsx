// src/components/LogDetailModal.jsx
/**
 * RECENT FIXES (2026-01-08):
 * 1. Fixed modal scroll at 100% browser zoom (max-height constraint on content)
 * 2. Added smooth open/close animation (GPU-accelerated fade + scale)
 * 3. Enhanced break visualization for consistency (admin + employee views)
 * 4. No backend/API/timezone changes - purely UI/UX improvements
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogTitle, DialogContent, Typography, Box, IconButton, DialogActions, Button, TextField, Select, MenuItem, FormControl, InputLabel, Divider, Paper, Stack, ToggleButtonGroup, ToggleButton, Alert, Grid, Chip } from '@mui/material';
import api from '../api/axios';
import { Timeline, TimelineItem, TimelineSeparator, TimelineConnector, TimelineContent, TimelineDot } from '@mui/lab';
import CloseIcon from '@mui/icons-material/Close';
import WatchLaterIcon from '@mui/icons-material/WatchLater';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WorkIcon from '@mui/icons-material/Work';
import TimerIcon from '@mui/icons-material/Timer';
import SaveIcon from '@mui/icons-material/Save';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { formatLeaveRequestType } from '../utils/saturdayUtils';
import { normalizeSession, validateSessionDuration, createNormalizedDateTime } from '../utils/timeNormalization';
import { formatTimeForDisplay, formatDateForDisplay, formatDuration, formatDurationShort } from '../utils/attendanceRenderUtils';
import { getISTDateString, parseISTDate, formatISTDate, formatISTTimeHHMM, getISTNow } from '../utils/istTime';
import '../styles/LogDetailModal.css';

import { SkeletonBox } from '../components/SkeletonLoaders';

/** Format time as HH:mm (IST) for form inputs. Uses centralized IST utility. */
const formatTimeToHHMM = (dateTime) => {
    if (!dateTime) return '';
    return formatISTTimeHHMM(dateTime);
};

/** Duration in minutes → display. Uses IST now when end not yet set. */
const calculateEventDuration = (startTime, endTime, now = null) => {
    if (!startTime) return 0;
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : (now || getISTNow());
    return Math.max(0, (end - start) / (1000 * 60));
};

const LogDetailModal = ({ open, onClose, log, date, isAdmin, onSave, onRefresh, holiday, leave }) => {
    const [editableLog, setEditableLog] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [adminView, setAdminView] = useState('view');
    const [localError, setLocalError] = useState('');
    const [overrideModalOpen, setOverrideModalOpen] = useState(false);
    const [overrideModalMode, setOverrideModalMode] = useState('apply'); // 'apply' | 'update'
    const [overrideType, setOverrideType] = useState('halfday');
    const [overrideReason, setOverrideReason] = useState('');
    const [isOverriding, setIsOverriding] = useState(false);
    const [removeOverrideConfirmOpen, setRemoveOverrideConfirmOpen] = useState(false);
    const [isRemovingOverride, setIsRemovingOverride] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (open) {
            setLocalError('');
            
            if (log) {
                const newEditableLog = JSON.parse(JSON.stringify(log));
                newEditableLog.sessions = (newEditableLog.sessions || []).map(s => ({ ...s, _id: s._id || uuidv4() }));
                newEditableLog.breaks = (Array.isArray(newEditableLog.breaks) ? newEditableLog.breaks : []).map(b => ({ ...b, _id: b._id || uuidv4() }));
                // ECR lives in notes section: show notes or early checkout reason so Admin can edit
                newEditableLog.notes = (newEditableLog.notes && String(newEditableLog.notes).trim()) || (newEditableLog.earlyCheckoutNote && String(newEditableLog.earlyCheckoutNote).trim()) || '';
                setEditableLog(newEditableLog);
            } else {
                setEditableLog(null);
            }
            
            if (isAdmin) setAdminView('view');
            
            // Content renders immediately - smooth animation from CSS
            setIsLoading(false);
        } else {
            setIsLoading(false);
        }
    }, [log, open, isAdmin]);

    // --- ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS ---
    // This ensures hooks are called in the same order on every render
    
    const timelineEvents = useMemo(() => {
        if (!log) return [];
        const sessions = (log.sessions || []).map(s => ({ ...s, eventType: 'session' }));
        const breaks = (Array.isArray(log.breaks) ? log.breaks : []).map(b => ({ ...b, eventType: 'break' }));
        return [...sessions, ...breaks].sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    }, [log]);

    // --- Hooks hoisted from ReadOnlyView to comply with Rules of Hooks ---
    // useMemo must not be called inside a nested function/component defined within render.
    const calculateStats = useMemo(() => {
        if (!log) return { 
            totalWorkMinutes: 0, 
            totalBreakMinutes: 0, 
            paidBreakMinutes: 0,
            firstCheckIn: null,
            lastCheckOut: null
        };
        
        const sessions = log.sessions || [];
        const breaks = Array.isArray(log.breaks) ? log.breaks : [];
        
        const totalWorkMinutes = sessions.reduce((acc, session) => {
            if (session.startTime || session.start_time) {
                const start = new Date(session.startTime || session.start_time);
                const end = session.endTime || session.end_time ? 
                    new Date(session.endTime || session.end_time) : new Date();
                return acc + (end - start) / (1000 * 60);
            }
            return acc;
        }, 0);
        
        const totalBreakMinutes = breaks.reduce((acc, breakItem) => {
            if (breakItem.startTime || breakItem.start_time) {
                const start = new Date(breakItem.startTime || breakItem.start_time);
                const end = breakItem.endTime || breakItem.end_time ? 
                    new Date(breakItem.endTime || breakItem.end_time) : new Date();
                return acc + (end - start) / (1000 * 60);
            }
            return acc;
        }, 0);
        
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

    const processedTimeline = useMemo(() => {
        if (!log) return [];
        
        const sessions = (log.sessions || [])
            .filter(s => s && (s.startTime || s.start_time))
            .map(s => ({
                type: 'session',
                startTime: s.startTime || s.start_time,
                endTime: s.endTime || s.end_time,
                location: s.location || s.address || null
            }));
        
        const breaks = (log.breaks || [])
            .filter(b => b && (b.startTime || b.start_time))
            .map(b => ({
                type: 'break',
                startTime: b.startTime || b.start_time,
                endTime: b.endTime || b.end_time,
                breakType: b.breakType || b.type || 'Break',
                location: b.location || b.address || null
            }));
        
        const timeline = [];
        
        for (const session of sessions) {
            const sessionStart = new Date(session.startTime);
            const sessionEnd = session.endTime ? new Date(session.endTime) : null;
            
            const breaksInSession = breaks.filter(breakItem => {
                const breakStart = new Date(breakItem.startTime);
                const breakEnd = breakItem.endTime ? new Date(breakItem.endTime) : null;
                return breakStart >= sessionStart && 
                       (!sessionEnd || (breakEnd && breakEnd <= sessionEnd));
            }).sort((a, b) => {
                return new Date(a.startTime) - new Date(b.startTime);
            });
            
            if (breaksInSession.length === 0) {
                timeline.push(session);
            } else {
                let currentStart = sessionStart;
                
                for (let i = 0; i < breaksInSession.length; i++) {
                    const breakItem = breaksInSession[i];
                    const breakStart = new Date(breakItem.startTime);
                    const breakEnd = breakItem.endTime ? new Date(breakItem.endTime) : null;
                    
                    if (currentStart < breakStart) {
                        timeline.push({
                            type: 'session',
                            startTime: currentStart.toISOString(),
                            endTime: breakStart.toISOString(),
                            location: session.location
                        });
                    }
                    
                    timeline.push(breakItem);
                    currentStart = breakEnd || breakStart;
                }
                
                if (sessionEnd && currentStart < sessionEnd) {
                    timeline.push({
                        type: 'session',
                        startTime: currentStart.toISOString(),
                        endTime: sessionEnd.toISOString(),
                        location: session.location
                    });
                } else if (!sessionEnd && currentStart > sessionStart) {
                    timeline.push({
                        type: 'session',
                        startTime: currentStart.toISOString(),
                        endTime: null,
                        location: session.location
                    });
                }
            }
        }
        
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
        
        timeline.sort((a, b) => {
            const timeA = new Date(a.startTime);
            const timeB = new Date(b.startTime);
            return timeA - timeB;
        });
        
        return timeline;
    }, [log]);

    // --- CONDITIONAL RETURNS AFTER ALL HOOKS ---
    // Allow modal to open even without log if there's holiday or leave info
    // CRITICAL FIX: Prevent opening modal for absent/week-off/weekend when there's no log
    if (!date) return null;
    if (!log && !holiday && !leave) return null;
    if (log && !editableLog) return null;

    // IST-only: dateForApi from backend when editing; fullDateStr always IST-formatted
    const dateForApi = log ? log.attendanceDate : null;
    const dateForDisplay = log
        ? parseISTDate(log.attendanceDate)
        : (typeof date === 'string' ? parseISTDate(date) : parseISTDate(getISTDateString(date)));
    const fullDateStr = formatISTDate(dateForDisplay, { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

    const handleSessionChange = (id, field, value) => {
        const updatedSessions = editableLog.sessions.map(s => {
            if (s._id === id) {
                if (field === 'startTime' || field === 'endTime') {
                    if (!value) {
                        return { ...s, [field]: null };
                    }
                    const parts = String(value).split(':');
                    const timePart = parts.length >= 3 ? value : `${parts[0] || '00'}:${(parts[1] || '00').padStart(2, '0')}:00`;
                    let newDateTime = dayjs(`${dateForApi}T${timePart}+05:30`);

                    // If updating endTime, check if it should be next day
                    if (field === 'endTime' && s.startTime) {
                        const startTime = dayjs(s.startTime);
                        if (newDateTime.isBefore(startTime)) {
                            newDateTime = newDateTime.add(1, 'day');
                        }
                    }

                    // If updating startTime, check if endTime needs adjustment
                    if (field === 'startTime' && s.endTime) {
                        const endTime = dayjs(s.endTime);
                        if (endTime.isBefore(newDateTime)) {
                            // End time will be adjusted when user edits it
                        }
                    }

                    return { ...s, [field]: newDateTime.toISOString() };
                }
                return { ...s, [field]: value };
            }
            return s;
        });
        setEditableLog(prev => ({ ...prev, sessions: updatedSessions }));
    };

    const handleBreakChange = (id, field, value) => {
        const breaksArray = Array.isArray(editableLog.breaks) ? editableLog.breaks : [];
        const updatedBreaks = breaksArray.map(b => {
            if (b._id === id) {
                if (field === 'startTime' || field === 'endTime') {
                    if (!value) {
                        return { ...b, [field]: null };
                    }
                    const parts = String(value).split(':');
                    const timePart = parts.length >= 3 ? value : `${parts[0] || '00'}:${(parts[1] || '00').padStart(2, '0')}:00`;
                    let newDateTime = dayjs(`${dateForApi}T${timePart}+05:30`);

                    // If updating endTime, check if it should be next day
                    if (field === 'endTime' && b.startTime) {
                        const startTime = dayjs(b.startTime);
                        if (newDateTime.isBefore(startTime)) {
                            newDateTime = newDateTime.add(1, 'day');
                        }
                    }

                    if (field === 'startTime' && b.endTime) {
                        const endTime = dayjs(b.endTime);
                        if (endTime.isBefore(newDateTime)) {
                            // End will be adjusted when user edits it
                        }
                    }

                    return { ...b, [field]: newDateTime.toISOString() };
                }
                return { ...b, [field]: value };
            }
            return b;
        });
        setEditableLog(prev => ({ ...prev, breaks: updatedBreaks }));
    };

    const addSession = () => {
        // IST: explicit +05:30 so datetimes are IST
        const newSession = {
            _id: uuidv4(),
            startTime: new Date(`${dateForApi}T09:00:00+05:30`).toISOString(),
            endTime: new Date(`${dateForApi}T17:00:00+05:30`).toISOString()
        };
        setEditableLog(prev => ({ ...prev, sessions: [...prev.sessions, newSession] }));
    };
    
    const addBreak = () => {
        const newBreak = {
            _id: uuidv4(),
            breakType: 'Paid',
            startTime: new Date(`${dateForApi}T12:00:00+05:30`).toISOString(),
            endTime: new Date(`${dateForApi}T13:00:00+05:30`).toISOString()
        };
        setEditableLog(prev => ({ ...prev, breaks: [...(Array.isArray(prev.breaks) ? prev.breaks : []), newBreak] }));
    };

    const deleteSession = (id) => {
        setEditableLog(prev => ({ ...prev, sessions: prev.sessions.filter(s => s._id !== id) }));
    };

    const deleteBreak = (id) => {
        setEditableLog(prev => ({ ...prev, breaks: (Array.isArray(prev.breaks) ? prev.breaks : []).filter(b => b._id !== id) }));
    };

    /**
     * Centralized payload builder with strict validation
     * Ensures all required fields exist and are properly formatted before API call
     * 
     * Expected payload structure:
     * {
     *   sessions: Array<{ startTime: string (ISO), endTime: string (ISO) | null }>
     *   breaks: Array<{ startTime: string (ISO), endTime: string (ISO), breakType: 'Paid' | 'Unpaid' | 'Extra' }>
     *   notes: string
     *   attendanceDate: string (YYYY-MM-DD) - optional, for reference
     * }
     */
    const buildValidatedPayload = () => {
        try {
            // Ensure sessions and breaks are arrays
            const sessions = Array.isArray(editableLog?.sessions) ? editableLog.sessions : [];
            const breaks = Array.isArray(editableLog?.breaks) ? editableLog.breaks : [];

            // Validate and normalize sessions - strip extra fields, ensure valid times
            const normalizedSessions = sessions.map((session, index) => {
                if (!session || typeof session !== 'object') {
                    throw new Error(`Session #${index + 1} is invalid. Expected an object.`);
                }

                if (!session.startTime) {
                    throw new Error(`Session #${index + 1} is missing startTime.`);
                }

                // Convert to dayjs for validation
                const start = dayjs(session.startTime);
                if (!start.isValid()) {
                    throw new Error(`Session #${index + 1} has an invalid startTime: ${session.startTime}`);
                }

                // Build clean session object (only include required fields)
                const cleanSession = {
                    startTime: start.toISOString() // Ensure ISO format
                };

                // End time is optional, but if provided must be valid
                if (session.endTime) {
                    let end = dayjs(session.endTime);
                    if (!end.isValid()) {
                        throw new Error(`Session #${index + 1} has an invalid endTime: ${session.endTime}`);
                    }

                    // Normalize: if end is before start, add 1 day (cross-day scenario)
                    if (end.isBefore(start)) {
                        end = end.add(1, 'day');
                    }

                    // Validate duration (max 24 hours for admin edits - increased from 16 hours)
                    // This allows for legitimate cases like night shifts, corrections, etc.
                    const durationHours = end.diff(start, 'hour', true);
                    if (durationHours <= 0) {
                        throw new Error(`Session #${index + 1} end time must be after start time.`);
                    }
                    // Increased limit to 24 hours for admin flexibility
                    if (durationHours > 24) {
                        throw new Error(`Session #${index + 1} duration cannot exceed 24 hours.`);
                    }

                    cleanSession.endTime = end.toISOString();
                } else {
                    cleanSession.endTime = null;
                }

                return cleanSession;
            });

            // Validate and normalize breaks - strip extra fields, ensure valid times and breakType
            const normalizedBreaks = breaks.map((brk, index) => {
                if (!brk || typeof brk !== 'object') {
                    throw new Error(`Break #${index + 1} is invalid. Expected an object.`);
                }

                if (!brk.startTime) {
                    throw new Error(`Break #${index + 1} is missing startTime.`);
                }

                if (!brk.endTime) {
                    throw new Error(`Break #${index + 1} is missing endTime.`);
                }

                const start = dayjs(brk.startTime);
                if (!start.isValid()) {
                    throw new Error(`Break #${index + 1} has an invalid startTime: ${brk.startTime}`);
                }

                let end = dayjs(brk.endTime);
                if (!end.isValid()) {
                    throw new Error(`Break #${index + 1} has an invalid endTime: ${brk.endTime}`);
                }

                // Normalize: if end is before start, add 1 day (cross-day scenario)
                if (end.isBefore(start)) {
                    end = end.add(1, 'day');
                }

                // Validate duration (max 24 hours for admin edits - increased from 16 hours)
                // This allows for legitimate cases like corrections, extended breaks, etc.
                const durationHours = end.diff(start, 'hour', true);
                if (durationHours <= 0) {
                    throw new Error(`Break #${index + 1} end time must be after start time.`);
                }
                // Increased limit to 24 hours for admin flexibility
                if (durationHours > 24) {
                    throw new Error(`Break #${index + 1} duration cannot exceed 24 hours.`);
                }

                // Normalize breakType (handle both type and breakType for backward compatibility)
                const breakType = (brk.breakType || brk.type || 'Unpaid').trim();
                if (!['Paid', 'Unpaid', 'Extra'].includes(breakType)) {
                    throw new Error(`Break #${index + 1} has an invalid breakType: ${breakType}. Must be 'Paid', 'Unpaid', or 'Extra'.`);
                }

                // Build clean break object (only include required fields)
                return {
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                    breakType: breakType
                };
            });

            // Build final payload - only send required fields to backend
            const payload = {
                sessions: normalizedSessions,
                breaks: normalizedBreaks,
                notes: (editableLog?.notes || '').toString().trim()
            };

            // Optional: include attendanceDate for reference (backend may not use it)
            if (dateForApi) {
                payload.attendanceDate = dateForApi;
            }

            // Log payload in development mode for debugging
            if (process.env.NODE_ENV === 'development') {
                console.log('📤 Payload being sent to backend:', {
                    sessionsCount: payload.sessions.length,
                    breaksCount: Array.isArray(payload.breaks) ? payload.breaks.length : 0,
                    hasNotes: !!payload.notes,
                    sessions: payload.sessions,
                    breaks: payload.breaks
                });
            }

            return payload;
        } catch (validationError) {
            // Convert validation errors to user-friendly messages
            throw new Error(validationError.message || 'Validation failed. Please check all fields.');
        }
    };

    const handleSaveChanges = async () => {
        setLocalError('');
        setIsSaving(true);

        try {
            // Validate and build payload
            const payload = buildValidatedPayload();

            // Validate log ID exists
            if (!log?._id) {
                throw new Error('Attendance log ID is missing. Cannot save changes.');
            }

            // Call onSave with proper error handling
            await onSave(log._id, payload);
            
            // Success - onSave will handle UI updates
            setIsSaving(false);
        } catch (error) {
            // Handle validation errors and API errors safely
            const errorMessage = error?.message || error?.response?.data?.error || error?.response?.data?.message || 'Failed to save changes. Please try again.';
            setLocalError(errorMessage);
            setIsSaving(false);
            
            // Log error for debugging (only in development)
            if (process.env.NODE_ENV === 'development') {
                console.error('❌ Error saving attendance log:', {
                    error,
                    message: errorMessage,
                    logId: log?._id
                });
            }
        }
    };

    const ReadOnlyView = () => {
        // If no log but there's holiday or leave, show that information
        // Also show leave info when log exists but it's a leave day (no sessions)
        const isLeaveDay = leave || log?.isLeave || log?.attendanceStatus === 'Leave' || log?.leaveInfo;
        const hasNoSessions = !log?.sessions || log.sessions.length === 0;

        // Shared override note block — reused in both the early-return branch and the main view
        const overrideNoteText = (typeof log?.overrideReason === 'string' && log.overrideReason.trim().length > 0)
            ? log.overrideReason.trim()
            : (typeof log?.adminOverride === 'string' && log.adminOverride !== 'None' && log.adminOverride.trim().length > 0)
                ? log.adminOverride.trim()
                : null;
        const hasValidOverrideNote = log?.overriddenByAdmin === true && overrideNoteText !== null;

        const OverrideNoteBlock = hasValidOverrideNote ? (
            <Box sx={{ mt: 2, p: 1.5, bgcolor: '#fff8e1', borderRadius: 1, border: '1px solid #ffc107' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: '#856404', display: 'block', mb: 0.5 }}>
                    Overridden by Admin
                </Typography>
                <Typography variant="body2" color="text.primary" sx={{ mb: 0.5 }}>
                    {overrideNoteText}
                </Typography>
                {log?.overriddenAt && (
                    <Typography variant="caption" sx={{ color: '#856404', display: 'block', mt: 0.5 }}>
                        Applied: {new Date(log.overriddenAt).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                        })}
                    </Typography>
                )}
            </Box>
        ) : null;

        const isAdminOverriddenNoSessions = !isLeaveDay && !holiday && hasNoSessions && hasValidOverrideNote;

        if ((!log && (holiday || leave)) || (isLeaveDay && hasNoSessions && !holiday) || isAdminOverriddenNoSessions) {
            // For pure admin-override records with no sessions, show a dedicated override-only card
            if (isAdminOverriddenNoSessions) {
                return (
                    <DialogContent className="dialog-content audit-dialog-content">
                        <Box className="audit-timeline-container">
                            <Alert severity="info" sx={{ mb: 2 }}>
                                <Typography variant="body2">
                                    This day has no clock-in record. Attendance status was set directly by admin override.
                                </Typography>
                            </Alert>
                            {OverrideNoteBlock}
                        </Box>
                    </DialogContent>
                );
            }
            return (
                <DialogContent className="dialog-content audit-dialog-content">
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
                            ) : (leave || log?.leaveInfo) ? (
                                <Box>
                                    {/* Use leave prop if available, otherwise use log.leaveInfo */}
                                    {(() => {
                                        const effectiveLeave = leave || log?.leaveInfo || null;
                                        const requestType = effectiveLeave?.requestType || effectiveLeave?.leaveType || 'Leave';
                                        const leaveType = effectiveLeave?.leaveType || 'Full Day';
                                        
                                        return (
                                            <>
                                                <Typography variant="h6" gutterBottom>
                                                    Leave: {formatLeaveRequestType(requestType)}
                                                </Typography>
                                                {(leaveType || requestType) && (
                                                    <Box sx={{ mt: 1, mb: 1 }}>
                                                        <Chip 
                                                            label={leaveType === 'Full Day' ? 'Full Day Leave' : (leaveType || requestType || 'Leave')}
                                                            color={leaveType === 'Full Day' ? 'primary' : 'secondary'}
                                                            variant="outlined"
                                                            sx={{ fontWeight: 600 }}
                                                        />
                                                    </Box>
                                                )}
                                            </>
                                        );
                                    })()}
                                    {/* CRITICAL FIX: Always display employee's leave reason when available */}
                                    {/* Check multiple sources: log.leaveReason, leave.reason, log.leaveInfo.reason */}
                                    {/* IMPORTANT: Backend sends leaveInfo.reason even when there's no attendance log */}
                                    {(() => {
                                        // Try multiple sources in order of priority
                                        // 1. Direct leaveReason from log (backend field)
                                        // 2. leaveInfo.reason from log (backend leaveInfo object)
                                        // 3. leave.reason from prop (passed from calendar)
                                        // Use leave prop if available, otherwise fall back to log data
                                        const effectiveLeave = leave || log?.leaveInfo || null;
                                        const leaveReason = log?.leaveReason || 
                                                          (effectiveLeave?.reason) || 
                                                          (log?.leaveInfo?.reason) ||
                                                          (leave?.reason);
                                        
                                        // Debug logging for development
                                        if (process.env.NODE_ENV === 'development' && leave && !leaveReason) {
                                            console.warn('[LogDetailModal] Leave reason not found:', {
                                                hasLog: !!log,
                                                logLeaveReason: log?.leaveReason,
                                                logLeaveInfo: log?.leaveInfo,
                                                leaveProp: leave,
                                                leaveReason: leave?.reason
                                            });
                                        }
                                        
                                        // Display reason if available (even if it's "No reason provided")
                                        if (leaveReason) {
                                            return (
                                                <Box sx={{ mt: 1, p: 1.5, bgcolor: '#e3f2fd', borderRadius: 1, border: '1px solid #2196f3' }}>
                                                    <Typography variant="caption" sx={{ fontWeight: 600, color: '#1565c0', display: 'block', mb: 0.5 }}>
                                                        Employee's Reason:
                                                    </Typography>
                                                    <Typography variant="body2" color="text.primary">
                                                        {leaveReason}
                                                    </Typography>
                                                </Box>
                                            );
                                        }
                                        
                                        // No reason found
                                        return (
                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                                                No reason provided
                                            </Typography>
                                        );
                                    })()}
                                    {/* Display half-day reason if this is a half-day (show for both regular half-day and half-day leave) */}
                                    {log?.isHalfDay && log?.halfDayReason && (
                                        <Box sx={{ mt: 1, p: 1.5, bgcolor: '#fff3cd', borderRadius: 1, border: '1px solid #ffc107' }}>
                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#856404', display: 'block', mb: 0.5 }}>
                                                Half-Day Reason:
                                            </Typography>
                                            <Typography variant="body2" color="text.primary">
                                                {log.halfDayReason}
                                            </Typography>
                                            {log?.overriddenByAdmin && (
                                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#856404', fontStyle: 'italic' }}>
                                                    Admin Override Applied
                                                </Typography>
                                            )}
                                        </Box>
                                    )}
                                </Box>
                            ) : null}
                        </Alert>
                        {/* ── OVERRIDE NOTE ── Always show when admin has overridden this day,
                            even if it's a leave day or has no sessions. This was previously
                            missing from this early-return branch. */}
                        {OverrideNoteBlock}
                    </Box>
                </DialogContent>
            );
        }

        // calculateStats and processedTimeline are defined at the parent component level
        // (above ReadOnlyView) to comply with React Rules of Hooks.

        // Get shift time range for header
        const getShiftTimeRange = () => {
            if (!log || !log.shiftInfo) return '';
            const shift = log.shiftInfo;
            const startTime = shift.startTime || shift.start_time || '09:00';
            const endTime = shift.endTime || shift.end_time || '18:00';
            
            const formatTo12h = (time24) => {
                const [hours, minutes] = time24.split(':');
                const hour = parseInt(hours);
                const period = hour >= 12 ? 'PM' : 'AM';
                const hour12 = hour % 12 || 12;
                return `${hour12}:${minutes} ${period}`;
            };
            
            return `${formatTo12h(startTime)} - ${formatTo12h(endTime)}`;
        };

        const getTimeOfDay = () => {
            if (!date) return 'Morning';
            const hour = date.getHours();
            if (hour < 12) return 'Morning';
            if (hour < 17) return 'Afternoon';
            return 'Evening';
        };

        const fullDateStr = date ? formatDateForDisplay(date) : 'Log Details';
        const shiftTimeRange = getShiftTimeRange();
        const timeOfDay = getTimeOfDay();

        return (
            <DialogContent className="dialog-content audit-dialog-content">
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

                    {/* Admin override note — uses shared OverrideNoteBlock defined at top of ReadOnlyView */}
                    {OverrideNoteBlock}

                    {/* Early Checkout Reason (synced with notes; editable from Admin Notes section) */}
                    {(() => {
                        const ecrText = (log?.earlyCheckoutNote && String(log.earlyCheckoutNote).trim()) || (log?.notes && String(log.notes).trim()) || '';
                        return ecrText ? (
                            <Box sx={{ mt: 2, mb: 2, p: 1.5, bgcolor: 'rgba(229, 57, 53, 0.08)', borderRadius: 1, border: '1px solid rgba(229, 57, 53, 0.3)' }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: '#c62828', display: 'block', mb: 0.5 }}>
                                    Early Checkout Reason
                                </Typography>
                                <Typography variant="body2" color="text.primary">
                                    {ecrText}
                                </Typography>
                            </Box>
                        ) : null;
                    })()}

                    {/* Timeline Events */}
                    {processedTimeline.length > 0 ? (
                        <Box className="timeline-events">
                            {processedTimeline.map((event, eventIndex) => {
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
            </DialogContent>
        );
    };

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            fullWidth 
            maxWidth="md"
            PaperProps={{ 
                className: 'log-detail-dialog'
            }}
            TransitionProps={{
                timeout: {
                    enter: 300,
                    exit: 200
                }
            }}
            transitionDuration={{
                enter: 300,
                exit: 200
            }}
        >
            <DialogTitle className="dialog-header">
                {(!isAdmin || (isAdmin && adminView === 'view')) ? (
                    <Box className="header-content">
                        <Box>
                            <Typography variant="body1" className="header-date">
                                {fullDateStr} {(() => {
                                    if (!date) return '';
                                    const hour = date.getHours();
                                    const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
                                    const shift = log?.shiftInfo;
                                    if (shift) {
                                        const startTime = shift.startTime || shift.start_time || '09:00';
                                        const endTime = shift.endTime || shift.end_time || '18:00';
                                        const formatTo12h = (time24) => {
                                            const [hours, minutes] = time24.split(':');
                                            const hour = parseInt(hours);
                                            const period = hour >= 12 ? 'PM' : 'AM';
                                            const hour12 = hour % 12 || 12;
                                            return `${hour12}:${minutes} ${period}`;
                                        };
                                        return `${timeOfDay} [${formatTo12h(startTime)} - ${formatTo12h(endTime)}]`;
                                    }
                                    return timeOfDay;
                                })()}
                            </Typography>
                        </Box>
                        <Box className="header-actions">
                            <IconButton onClick={onClose} size="small" className="close-button">
                                <CloseIcon />
                            </IconButton>
                        </Box>
                    </Box>
                ) : (
                    <Box>
                        <Typography variant="h6">{fullDateStr}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Admin Edit View
                        </Typography>
                    </Box>
                )}
                {isAdmin && (!isAdmin || (isAdmin && adminView === 'view')) && (
                    <Box className="dialog-header-actions" sx={{ mt: 1 }}>
                        <ToggleButtonGroup
                            value={adminView}
                            exclusive
                            onChange={(e, newView) => { if(newView) setAdminView(newView); }}
                            aria-label="admin view toggle"
                            size="small"
                        >
                            <ToggleButton value="view" aria-label="view mode"><VisibilityIcon /></ToggleButton>
                            <ToggleButton value="edit" aria-label="edit mode"><EditIcon /></ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                )}
                {isAdmin && adminView === 'edit' && (
                    <Box className="dialog-header-actions">
                        <IconButton onClick={onClose} className="close-button"><CloseIcon /></IconButton>
                    </Box>
                )}
            </DialogTitle>
            
            {(!isAdmin || (isAdmin && adminView === 'view')) ? <ReadOnlyView /> : (
            <>
                {/* ADMIN EDITABLE VIEW */}
                <DialogContent className="admin-edit-content">
                    {localError && <Alert severity="error" className="admin-edit-error-alert">{localError}</Alert>}
                    <Stack spacing={0}>
                        {/* Work Sessions Section */}
                        <Paper className="admin-edit-section admin-edit-section-sessions">
                            <Box className="admin-edit-section-header admin-edit-section-header-sessions">
                                <CheckCircleIcon className="admin-edit-section-icon admin-edit-section-icon-success" />
                                <Typography className="admin-edit-section-title">Work Sessions</Typography>
                            </Box>
                            
                            {editableLog.sessions.map((session, index) => (
                                <Paper key={session._id} className="admin-edit-entry-card admin-edit-entry-card-session">
                                    <Grid container className="admin-edit-entry-grid">
                                        <Grid item className="admin-edit-entry-index">
                                            <Typography className="admin-edit-entry-index-text">
                                                #{index + 1}
                                            </Typography>
                                        </Grid>
                                        <Grid item className="admin-edit-entry-fields">
                                            <Grid container spacing={2}>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField 
                                                        label="Check-in" 
                                                        type="time" 
                                                        fullWidth 
                                                        size="small" 
                                                        value={formatTimeToHHMM(session.startTime)} 
                                                        onChange={(e) => handleSessionChange(session._id, 'startTime', e.target.value)} 
                                                        InputLabelProps={{ shrink: true }}
                                                        className="admin-edit-input admin-edit-input-checkin"
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <TextField 
                                                        label="Check-out" 
                                                        type="time" 
                                                        fullWidth 
                                                        size="small" 
                                                        value={formatTimeToHHMM(session.endTime)} 
                                                        onChange={(e) => handleSessionChange(session._id, 'endTime', e.target.value)} 
                                                        InputLabelProps={{ shrink: true }}
                                                        className="admin-edit-input admin-edit-input-checkout"
                                                    />
                                                </Grid>
                                            </Grid>
                                        </Grid>
                                        <Grid item className="admin-edit-entry-delete">
                                            <IconButton 
                                                color="error" 
                                                onClick={() => deleteSession(session._id)}
                                                className="admin-edit-delete-button"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            ))}
                            
                            <Button 
                                startIcon={<AddCircleOutlineIcon />} 
                                onClick={addSession}
                                variant="outlined"
                                className="admin-edit-add-button admin-edit-add-button-session"
                            >
                                Add Session
                            </Button>
                        </Paper>

                        {/* Breaks Section */}
                        <Paper className="admin-edit-section admin-edit-section-breaks">
                            <Box className="admin-edit-section-header admin-edit-section-header-breaks">
                                <WatchLaterIcon className="admin-edit-section-icon admin-edit-section-icon-warning" />
                                <Typography className="admin-edit-section-title">Breaks</Typography>
                            </Box>
                            
                            {(Array.isArray(editableLog.breaks) ? editableLog.breaks : []).map((brk, index) => (
                                <Paper key={brk._id} className="admin-edit-entry-card admin-edit-entry-card-break">
                                    <Grid container className="admin-edit-entry-grid">
                                        <Grid item className="admin-edit-entry-index">
                                            <Typography className="admin-edit-entry-index-text">
                                                #{index + 1}
                                            </Typography>
                                        </Grid>
                                        <Grid item className="admin-edit-entry-fields">
                                            <Grid container spacing={2}>
                                                <Grid item xs={12} sm={4}>
                                                    <FormControl fullWidth size="small" className="admin-edit-input admin-edit-input-break-type">
                                                        <InputLabel>Type</InputLabel>
                                                        <Select 
                                                            value={brk.breakType} 
                                                            label="Type" 
                                                            onChange={(e) => handleBreakChange(brk._id, 'breakType', e.target.value)}
                                                        >
                                                            <MenuItem value="Paid">Paid</MenuItem>
                                                            <MenuItem value="Unpaid">Unpaid</MenuItem>
                                                            <MenuItem value="Extra">Extra</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </Grid>
                                                <Grid item xs={12} sm={4}>
                                                    <TextField 
                                                        label="Start Time" 
                                                        type="time" 
                                                        fullWidth 
                                                        size="small" 
                                                        value={formatTimeToHHMM(brk.startTime)} 
                                                        onChange={(e) => handleBreakChange(brk._id, 'startTime', e.target.value)} 
                                                        InputLabelProps={{ shrink: true }}
                                                        className="admin-edit-input admin-edit-input-break-time"
                                                    />
                                                </Grid>
                                                <Grid item xs={12} sm={4}>
                                                    <TextField 
                                                        label="End Time" 
                                                        type="time" 
                                                        fullWidth 
                                                        size="small" 
                                                        value={formatTimeToHHMM(brk.endTime)} 
                                                        onChange={(e) => handleBreakChange(brk._id, 'endTime', e.target.value)} 
                                                        InputLabelProps={{ shrink: true }}
                                                        className="admin-edit-input admin-edit-input-break-time"
                                                    />
                                                </Grid>
                                            </Grid>
                                        </Grid>
                                        <Grid item className="admin-edit-entry-delete">
                                            <IconButton 
                                                color="error" 
                                                onClick={() => deleteBreak(brk._id)}
                                                className="admin-edit-delete-button"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            ))}
                            
                            <Button 
                                startIcon={<AddCircleOutlineIcon />} 
                                onClick={addBreak}
                                variant="outlined"
                                className="admin-edit-add-button admin-edit-add-button-break"
                            >
                                Add Break
                            </Button>
                        </Paper>

                        {/* Override Section: apply (half-day) or update/remove (already overridden) */}
                        {(editableLog?.isHalfDay || editableLog?.overriddenByAdmin) && (
                            <Paper className="admin-edit-section admin-edit-section-override" sx={{ border: '2px solid #ffc107', bgcolor: '#fff3cd' }}>
                                <Box className="admin-edit-section-header admin-edit-section-header-override">
                                    <Typography className="admin-edit-section-title" sx={{ color: '#856404', fontWeight: 600 }}>
                                        {editableLog?.overriddenByAdmin ? 'Attendance Override' : 'Half-Day Status Override'}
                                    </Typography>
                                </Box>
                                
                                <Box sx={{ p: 2 }}>
                                    {editableLog?.overriddenByAdmin ? (
                                        <>
                                            {editableLog.overrideReason && (
                                                <Typography variant="body2" sx={{ mb: 2, color: '#856404' }}>
                                                    <strong>Override note:</strong> {editableLog.overrideReason}
                                                </Typography>
                                            )}
                                            <Grid container spacing={1}>
                                                <Grid item xs={12} sm={6}>
                                                    <Button 
                                                        variant="contained" 
                                                        color="warning"
                                                        fullWidth
                                                        size="small"
                                                        onClick={() => {
                                                            setOverrideModalMode('update');
                                                            setOverrideReason(editableLog.overrideReason || '');
                                                            setOverrideModalOpen(true);
                                                        }}
                                                        startIcon={<EditIcon />}
                                                    >
                                                        Update Override
                                                    </Button>
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <Button 
                                                        variant="outlined" 
                                                        color="error"
                                                        fullWidth
                                                        size="small"
                                                        onClick={() => setRemoveOverrideConfirmOpen(true)}
                                                        startIcon={<DeleteIcon />}
                                                    >
                                                        Remove Override
                                                    </Button>
                                                </Grid>
                                            </Grid>
                                        </>
                                    ) : (
                                        <>
                                            <Typography variant="body2" sx={{ mb: 2, color: '#856404' }}>
                                                Current Reason: {editableLog.halfDayReasonText || 'No reason specified'}
                                            </Typography>
                                            <Button 
                                                variant="contained" 
                                                color="warning"
                                                fullWidth
                                                onClick={() => {
                                                    setOverrideModalMode('apply');
                                                    setOverrideReason('');
                                                    setOverrideModalOpen(true);
                                                }}
                                                startIcon={<EditIcon />}
                                                sx={{ fontWeight: 600 }}
                                            >
                                                Override Half-Day to Present
                                            </Button>
                                        </>
                                    )}
                                </Box>
                            </Paper>
                        )}

                        {/* Notes Section */}
                        <Paper className="admin-edit-section admin-edit-section-notes">
                            <Box className="admin-edit-section-header admin-edit-section-header-notes">
                                <EditIcon className="admin-edit-section-icon admin-edit-section-icon-primary" />
                                <Typography className="admin-edit-section-title">Notes</Typography>
                            </Box>
                            
                            <TextField 
                                fullWidth 
                                multiline 
                                rows={4} 
                                label="Notes for the day"
                                placeholder="Add any additional notes or comments for this day..."
                                value={editableLog.notes || ''}
                                onChange={(e) => setEditableLog(prev => ({...prev, notes: e.target.value}))}
                                className="admin-edit-input admin-edit-input-notes"
                            />
                        </Paper>
                    </Stack>
                </DialogContent>
                <DialogActions className="admin-edit-dialog-actions">
                    <Button 
                        onClick={onClose}
                        variant="outlined"
                        className="admin-edit-cancel-button"
                    >
                        Cancel
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={handleSaveChanges} 
                        disabled={isSaving}
                        startIcon={isSaving ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : <SaveIcon />}
                        className="admin-edit-save-button"
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </DialogActions>
            </>
            )}
            
            {/* Override Modal: Apply (half-day → present) or Update (edit note) */}
            <Dialog 
                open={overrideModalOpen} 
                onClose={() => {
                    setOverrideModalOpen(false);
                    setOverrideModalMode('apply');
                    setOverrideType('halfday');
                    setOverrideReason('');
                }}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{overrideModalMode === 'update' ? 'Update Override' : 'Override Attendance'}</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        {overrideModalMode === 'update'
                            ? 'Edit the override note. The note is required for audit.'
                            : 'This will update the attendance status for this day. The override note is required for audit.'}
                    </Alert>
                    
                    {overrideModalMode === 'apply' && (
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
                        required
                        error={overrideModalOpen && !overrideReason.trim()}
                        helperText={overrideModalOpen && !overrideReason.trim() ? 'Override note is required' : ''}
                        sx={{ mt: 0.5 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button 
                        onClick={() => {
                            setOverrideModalOpen(false);
                            setOverrideModalMode('apply');
                            setOverrideType('halfday');
                            setOverrideReason('');
                        }}
                        variant="outlined"
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={async () => {
                            if (!overrideReason.trim()) {
                                setLocalError('Override note is required');
                                return;
                            }
                            setIsOverriding(true);
                            setLocalError('');
                            try {
                                if (overrideModalMode === 'update') {
                                    await api.patch(`/admin/attendance/override/${editableLog._id}`, {
                                        overrideReason: overrideReason.trim()
                                    });
                                } else {
                                    await api.post('/admin/attendance/override-half-day', {
                                        attendanceLogId: editableLog._id,
                                        overrideReason: overrideReason.trim()
                                    });
                                }
                                setOverrideModalOpen(false);
                                setOverrideModalMode('apply');
                                setOverrideType('halfday');
                                setOverrideReason('');
                                if (onRefresh) await onRefresh();
                                if (overrideModalMode === 'apply') onClose();
                                else setEditableLog(prev => prev ? { ...prev, overrideReason: overrideReason.trim() } : null);
                            } catch (error) {
                                console.error(overrideModalMode === 'update' ? 'Error updating override:' : 'Error overriding half-day:', error);
                                setLocalError(error.response?.data?.error || (overrideModalMode === 'update' ? 'Failed to update override' : 'Failed to override half-day status'));
                            } finally {
                                setIsOverriding(false);
                            }
                        }}
                        variant="contained"
                        color="warning"
                        disabled={isOverriding || !overrideReason.trim()}
                        startIcon={isOverriding ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : null}
                    >
                        {isOverriding ? (overrideModalMode === 'update' ? 'Updating...' : 'Overriding...') : (overrideModalMode === 'update' ? 'Update Override' : 'Confirm Override')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Remove Override confirmation */}
            <Dialog open={removeOverrideConfirmOpen} onClose={() => !isRemovingOverride && setRemoveOverrideConfirmOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Remove Override</DialogTitle>
                <DialogContent>
                    <Typography>Override will be cleared and attendance status will be restored to system-calculated (e.g. Half-day if applicable). The attendance record is not deleted.</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRemoveOverrideConfirmOpen(false)} variant="outlined" disabled={isRemovingOverride}>Cancel</Button>
                    <Button 
                        variant="contained" 
                        color="error" 
                        disabled={isRemovingOverride}
                        onClick={async () => {
                            setIsRemovingOverride(true);
                            try {
                                await api.post('/admin/attendance/remove-override', { attendanceLogId: editableLog?._id });
                                setRemoveOverrideConfirmOpen(false);
                                if (onRefresh) await onRefresh();
                                onClose();
                            } catch (e) {
                                setLocalError(e.response?.data?.error || 'Failed to remove override');
                            } finally {
                                setIsRemovingOverride(false);
                            }
                        }}
                    >
                        {isRemovingOverride ? 'Removing...' : 'Remove Override'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    );
};

export default LogDetailModal;