// src/components/DailyTimelineRow.jsx - IST-ENFORCED, BACKEND-DRIVEN
import React, { Fragment, useState, useEffect, useRef, useMemo, memo } from 'react';
import { Typography, Box, Chip } from '@mui/material';
import { 
    getISTNow, 
    getISTDateString, 
    parseISTDate,
    formatISTTime
} from '../utils/istTime';
import {
    formatTimeForDisplay,
    formatDuration,
    formatDurationWithSeconds,
    isTodayIST,
    timeToTimelinePercentage
} from '../utils/attendanceRenderUtils';

/**
 * End-of-row reference for open breaks/sessions on past days (never use "now" for history).
 */
const getRowEndReference = (log, checkOutTime, isToday, hasActiveSession, nowIST) => {
    if (checkOutTime) return checkOutTime;
    if (isToday && hasActiveSession) return nowIST;

    const sessions = log?.sessions || [];
    const lastSession = sessions[sessions.length - 1];
    return lastSession?.endTime || log?.lastOut || sessions[0]?.startTime || null;
};

const resolveBreakEndTime = (breakItem, rowEndReference, isToday, hasActiveSession, nowIST) => {
    if (breakItem.endTime) return breakItem.endTime;
    if (isToday && hasActiveSession) return nowIST;
    return rowEndReference;
};

/**
 * Get duration info from backend computed fields or calculate from sessions.
 */
const getDurationInfo = (log, nowIST) => {
    // Use backend computed totalWorkedMinutes if available
    if (log?.totalWorkedMinutes !== undefined) {
        const totalMinutes = log.totalWorkedMinutes;
        return {
            formatted: formatDurationWithSeconds(totalMinutes),
            totalMinutes: Math.round(totalMinutes)
        };
    }
    
    // Fallback calculation for legacy records
    if (!log || !log.sessions?.length) {
        return { formatted: '00:00:00', totalMinutes: 0 };
    }
    
    const totalSessionMs = log.sessions.reduce((acc, s) => {
        const start = new Date(s.startTime);
        const end = s.endTime ? new Date(s.endTime) : nowIST;
        return acc + (end - start);
    }, 0);

    const totalBreakMs = (log.breaks || []).reduce((acc, b) => {
        const start = new Date(b.startTime);
        const end = b.endTime ? new Date(b.endTime) : nowIST;
        return acc + (end - start);
    }, 0);

    const netMs = Math.max(0, totalSessionMs - totalBreakMs);
    const totalMinutes = Math.floor(netMs / 60000);
    
    return { 
        formatted: formatDurationWithSeconds(totalMinutes),
        totalMinutes 
    };
};

const DailyTimelineRow = ({ dayData, onClick }) => {
    const { date, log, status, leave } = dayData;
    const [nowIST, setNowIST] = useState(getISTNow());
    const intervalRef = useRef(null);
    const rafRef = useRef(null);
    const lastTimeStringRef = useRef('');
    
    // Check if this is today in IST
    const isToday = useMemo(() => {
        return isTodayIST(date);
    }, [date]);
    
    const hasActiveSession = useMemo(() => {
        return log?.sessions?.some(s => !s.endTime);
    }, [log]);
    
    // Update now in IST if today and has active session
    useEffect(() => {
        if (!isToday || !hasActiveSession) {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }
        
        const updateTime = () => {
            const currentNow = getISTNow();
            const timeString = currentNow.toISOString();
            
            if (lastTimeStringRef.current !== timeString) {
                lastTimeStringRef.current = timeString;
                setNowIST(currentNow);
            }
        };
        
        updateTime();
        
        intervalRef.current = setInterval(() => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            rafRef.current = requestAnimationFrame(updateTime);
        }, 1000);
        
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [isToday, hasActiveSession]);
    
    // Format day name and number in IST
    const dayOfWeek = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short'
    }).format(date);
    
    const dayOfMonth = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric'
    }).format(date));
    
    // Check if this day should be clickable in IST
    const todayIST = getISTNow();
    const todayStr = getISTDateString(todayIST);
    const dateStr = getISTDateString(date);
    const isFutureDate = dateStr > todayStr;
    const hasNoAttendanceData = !log || !log.sessions || log.sessions.length === 0;
    const isNotHolidayOrLeave = !status || (!status.startsWith('Holiday -') && !status.startsWith('Leave -') && status !== 'Comp Off' && status !== 'Swap Leave');
    // CRITICAL FIX: Prevent opening modal for absent/week-off/weekend when there's no log
    const isAbsentWeekOffOrWeekend = status === 'Absent' || status === 'Weekly Off' || status === 'Week Off' || status === 'Weekend';
    const shouldPreventClick = isAbsentWeekOffOrWeekend && hasNoAttendanceData && !leave && !dayData.holiday;
    const isClickable = !(isFutureDate && hasNoAttendanceData && isNotHolidayOrLeave) && !shouldPreventClick;

    const durationInfo = getDurationInfo(log, nowIST);
    
    // Use backend computed fields for half-day - NO RECALCULATION
    const hasClockOut = log?.clockOutTime || (log?.sessions && log.sessions.length > 0 && log.sessions.every(s => s.endTime));
    
    // Backend is single source of truth for half-day
    const isHalfDayMarked = log?.isHalfDay || log?.attendanceStatus === 'Half-day';
    
    // Check if there's a half day leave
    const isHalfDayLeave = leave?.leaveType && leave.leaveType.startsWith('Half Day');

    const renderTimelineContent = () => {
        if (log && log.sessions && log.sessions.length > 0) {
            const sessions = log.sessions;
            const checkInTime = log.firstIn || sessions[0]?.startTime;
            const checkOutTime = log.lastOut || (sessions[sessions.length - 1]?.endTime);
            const rowEndReference = getRowEndReference(log, checkOutTime, isToday, hasActiveSession, nowIST);

            const maxEndTime = rowEndReference;
            const maxEndPercentage = timeToTimelinePercentage(maxEndTime);
            const timelineWidth = Math.max(100, maxEndPercentage);
            
            return (
                <div className="timeline-content" style={{ position: 'relative', width: `${timelineWidth}%` }}>
                    {isHalfDayLeave && (
                        <div style={{ 
                            position: 'absolute',
                            top: '-20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: '#fff3cd',
                            color: '#856404',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            border: '1px solid #ffc107',
                            zIndex: 10,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            {leave.leaveType}
                        </div>
                    )}
                    {isHalfDayMarked && !isHalfDayLeave && (
                        <div style={{ 
                            position: 'absolute',
                            top: '-20px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: '#ffebee',
                            color: '#c62828',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            border: '1px solid #d32f2f',
                            zIndex: 10,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            Half Day
                        </div>
                    )}
                    {(() => {
                        const overrideNote = log?.overrideReason;
                        const hasValidOverride = log?.overriddenByAdmin === true
                            && typeof overrideNote === 'string'
                            && overrideNote.trim().length > 0;
                        if (!hasValidOverride) return null;
                        const note = overrideNote.trim();
                        return (
                            <div
                                title={note}
                                style={{
                                    position: 'absolute',
                                    top: '-20px',
                                    right: '4px',
                                    backgroundColor: '#fff8e1',
                                    color: '#856404',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    border: '1px solid #ffc107',
                                    zIndex: 10,
                                    whiteSpace: 'nowrap',
                                    maxWidth: '120px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                }}
                            >
                                {note.length > 20 ? `${note.slice(0, 20)}…` : note}
                            </div>
                        );
                    })()}
                    <div className="timeline-line" style={
                        isHalfDayLeave ? { borderTop: '2px dashed #ffc107' } : 
                        isHalfDayMarked ? { borderTop: '2px dashed #d32f2f' } : {}
                    }>
                        {checkInTime && (
                            <div className="timeline-marker check-in-marker" style={{ left: `${timeToTimelinePercentage(checkInTime)}%` }}>
                                <div className="marker-dot"></div>
                            </div>
                        )}
                        
                        {(() => {
                            const workSegments = [];
                            const checkInPos = timeToTimelinePercentage(checkInTime);
                            let currentStart = checkInPos;
                            
                            // Ensure breaks is an array (backend provides both breaks array and breaksSummary object)
                            const breaksArray = Array.isArray(log.breaks) ? log.breaks : [];
                            const sortedBreaks = breaksArray.sort((a, b) => 
                                new Date(a.startTime) - new Date(b.startTime)
                            );
                            
                            sortedBreaks.forEach(breakItem => {
                                const breakEndTime = resolveBreakEndTime(breakItem, rowEndReference, isToday, hasActiveSession, nowIST);
                                const breakStartPos = timeToTimelinePercentage(breakItem.startTime);
                                const breakEndPos = timeToTimelinePercentage(breakEndTime);
                                
                                if (breakStartPos > currentStart) {
                                    workSegments.push({
                                        left: currentStart,
                                        width: breakStartPos - currentStart
                                    });
                                }
                                
                                currentStart = Math.max(currentStart, breakEndPos);
                            });
                            
                            const finalEndPos = timeToTimelinePercentage(rowEndReference);
                            
                            if (currentStart < finalEndPos) {
                                workSegments.push({
                                    left: currentStart,
                                    width: finalEndPos - currentStart
                                });
                            }
                            
                            return workSegments.map((segment, index) => (
                                <div 
                                    key={`work-segment-${index}`}
                                    className="work-period-line"
                                    style={{ 
                                        left: `${segment.left}%`, 
                                        width: `${segment.width}%` 
                                    }}
                                ></div>
                            ));
                        })()}
                        
                        {Array.isArray(log.breaks) && log.breaks.length > 0 && log.breaks.map((br, index) => {
                            const breakEndTime = resolveBreakEndTime(br, rowEndReference, isToday, hasActiveSession, nowIST);
                            const breakStartPercentage = timeToTimelinePercentage(br.startTime);
                            const breakEndPercentage = timeToTimelinePercentage(breakEndTime);
                            const breakWidth = breakEndPercentage - breakStartPercentage;
                            
                            return (
                                <Fragment key={`break-${index}`}>
                                    <div 
                                        className="timeline-marker break-start-marker" 
                                        style={{ left: `${breakStartPercentage}%` }}
                                    >
                                        <div className="marker-dot"></div>
                                    </div>
                                    
                                    <div 
                                        className={`break-bar ${!br.endTime ? 'active-break' : ''}`}
                                        style={{ 
                                            left: `${breakStartPercentage}%`, 
                                            width: `${breakWidth}%` 
                                        }}
                                        title={`Break: ${formatTimeForDisplay(br.startTime)} - ${br.endTime ? formatTimeForDisplay(br.endTime) : 'Ongoing'}`}
                                    ></div>
                                    
                                    {br.endTime && (
                                        <div 
                                            className="timeline-marker break-end-marker" 
                                            style={{ left: `${breakEndPercentage}%` }}
                                        >
                                            <div className="marker-dot"></div>
                                        </div>
                                    )}
                                </Fragment>
                            );
                        })}
                        
                        {checkOutTime && (
                            <div className="timeline-marker check-out-marker" style={{ left: `${timeToTimelinePercentage(checkOutTime)}%` }}>
                                <div className="marker-dot"></div>
                            </div>
                        )}
                        
                        {isToday && !checkOutTime && (
                            <div className="current-time-indicator" style={{ left: `${timeToTimelinePercentage(nowIST)}%` }}>
                                <div className="current-time-line"></div>
                                <div className="current-time-dot"></div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // Handle different status types - use backend statusReason if available
        if (status && (status.startsWith('Holiday') || status === 'Holiday')) {
            const holidayName = log?.holidayInfo?.name || status.replace('Holiday - ', '') || 'Holiday';
            const statusReason = log?.statusReason || `Holiday - ${holidayName}`;
            return (
                <div className="timeline-content">
                    <div className="timeline-line">
                        <div className="status-line holiday-line"></div>
                        <div className="status-label holiday-label">Holiday</div>
                        <div className="holiday-name">{holidayName}</div>
                    </div>
                </div>
            );
        }
        
        // Weekly Off
        if (status === 'Weekly Off' || log?.isWeeklyOff) {
            const statusReason = log?.statusReason || 'Weekly Off';
            return (
                <div className="timeline-content">
                    <div className="timeline-line">
                        <div className="status-line week-off-line"></div>
                        <div className="status-label week-off-label">Weekly Off</div>
                        {statusReason && statusReason !== 'Weekly Off' && (
                            <div className="weekly-off-reason" style={{ 
                                fontSize: '0.7rem', 
                                color: '#666',
                                marginTop: '4px'
                            }}>
                                {statusReason.replace('Weekly Off', '').trim()}
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        
        if (status && status.startsWith('Leave -')) {
            const leaveType = status.replace('Leave - ', '');
            const leaveTypeInfo = leave?.leaveType || '';
            const isHalfDay = leaveTypeInfo && (leaveTypeInfo.startsWith('Half Day') || leaveTypeInfo.includes('Half'));
            const halfDayInfo = isHalfDay ? leaveTypeInfo : '';
            // Use backend-provided leaveReason if available
            const leaveReason = log?.leaveReason || leave?.reason || null;
            
            return (
                <div className="timeline-content">
                    <div className="timeline-line">
                        <div className="status-line leave-line"></div>
                        <div className="status-label leave-label">Leave</div>
                        <div className="leave-type">{leaveType}</div>
                        {isHalfDay && (
                            <div className="leave-half-day-info" style={{ 
                                fontSize: '0.75rem', 
                                color: '#f57c00', 
                                fontWeight: 600,
                                marginTop: '4px'
                            }}>
                                {halfDayInfo}
                            </div>
                        )}
                        {leaveReason && (
                            <div className="leave-reason-info" style={{ 
                                fontSize: '0.7rem', 
                                color: '#666', 
                                fontStyle: 'italic',
                                marginTop: '4px',
                                maxWidth: '200px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }} title={leaveReason}>
                                {leaveReason}
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        
        if (status === 'Comp Off') {
            return (
                <div className="timeline-content">
                    <div className="timeline-line">
                        <div className="status-line comp-off-line"></div>
                        <div className="status-label comp-off-label">⚙️ Comp Off</div>
                        <div className="comp-off-type">Comp Off</div>
                    </div>
                </div>
            );
        }
        
        if (status === 'Swap Leave') {
            return (
                <div className="timeline-content">
                    <div className="timeline-line">
                        <div className="status-line swap-leave-line"></div>
                        <div className="status-label swap-leave-label">🔁 Swap Leave</div>
                        <div className="swap-leave-type">Swap Leave</div>
                    </div>
                </div>
            );
        }
        
        if (status === 'Day Off') {
            return (
                <div className="timeline-content">
                    <div className="timeline-line">
                        <div className="status-line weekend-line"></div>
                        <div className="status-label weekend-label">Day Off</div>
                    </div>
                </div>
            );
        }
        
        switch (status) {
            case 'Weekend':
                return (
                    <div className="timeline-content">
                        <div className="timeline-line">
                            <div className="status-line weekend-line"></div>
                            <div className="status-label weekend-label">Weekend</div>
                        </div>
                    </div>
                );
            case 'Absent':
                return (
                    <div className="timeline-content">
                        <div className="timeline-line">
                            <div className="status-line absent-line"></div>
                            <div className="status-label absent-label">Absent</div>
                        </div>
                    </div>
                );
            default:
                return (
                    <div className="timeline-content">
                        <div className="timeline-line">
                            <div className="status-line working-day-line"></div>
                            <div className="status-label working-day-label">Working Day</div>
                        </div>
                    </div>
                );
        }
    };

    // Get check-in and check-out times for display (IST)
    const getCheckInTime = () => {
        if (log?.firstIn) {
            return formatTimeForDisplay(log.firstIn);
        }
        if (log && log.sessions && log.sessions.length > 0) {
            return formatTimeForDisplay(log.sessions[0]?.startTime);
        }
        return '--:--';
    };

    const getCheckOutTime = () => {
        if (log?.lastOut) {
            return formatTimeForDisplay(log.lastOut);
        }
        if (log && log.sessions && log.sessions.length > 0) {
            const lastSession = log.sessions[log.sessions.length - 1];
            return formatTimeForDisplay(lastSession?.endTime);
        }
        return '--:--';
    };

    return (
        <div 
            className={`daily-card ${isToday ? 'today' : ''} ${!isClickable ? 'non-clickable' : ''}`} 
            onClick={isClickable ? onClick : undefined}
        >
            <div className="date-section">
                <div className="day-name">{isToday ? 'Today' : dayOfWeek}</div>
                <div className={`day-number ${isToday ? 'today-highlight' : ''}`}>{dayOfMonth}</div>
            </div>
            
            <div className="timeline-section">
                <div className="check-time-display check-in-time">
                    {getCheckInTime()}
                </div>
                
                <div className="timeline-content-wrapper">
                    {renderTimelineContent()}
                </div>
                
                <div className="check-time-display check-out-time">
                    {getCheckOutTime()}
                </div>
            </div>
            
            <div className="hours-section">
                <div className="hours-worked">
                    {isToday && log && !log.clockOutTime ? durationInfo.formatted : durationInfo.formatted.slice(0, 5)} Hrs worked
                </div>
                {leave?.leaveType && leave.leaveType.startsWith('Half Day') && (
                    <div style={{ 
                        fontSize: '0.7rem',
                        color: '#f57c00',
                        fontWeight: 600,
                        marginTop: '4px',
                        textAlign: 'center'
                    }}>
                        {leave.leaveType}
                    </div>
                )}
                {log && isHalfDayMarked && !leave?.leaveType?.startsWith('Half Day') && (
                    <div style={{ 
                        fontSize: '0.7rem',
                        color: '#d32f2f',
                        fontWeight: 600,
                        marginTop: '4px',
                        textAlign: 'center',
                        backgroundColor: '#ffebee',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid #d32f2f'
                    }}>
                        Half Day
                    </div>
                )}
            </div>
        </div>
    );
};

// PERFORMANCE OPTIMIZATION: Memoize component to prevent unnecessary re-renders
export default memo(DailyTimelineRow);
