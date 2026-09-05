// src/components/AttendanceTimeline.jsx - IST-ENFORCED, BACKEND-DRIVEN
import React, { useMemo, memo } from 'react';
import { Typography, Box, Paper } from '@mui/material';
import DailyTimelineRow from './DailyTimelineRow';
import { 
    getISTNow, 
    getISTDateString, 
    parseISTDate, 
    getISTWeekRange,
    isSameISTDay,
    formatISTTime
} from '../utils/istTime';
import {
    formatDuration,
    getDisplayStatus
} from '../utils/attendanceRenderUtils';
import { getExpectedWeeklyWorkingHours } from '../utils/saturdayUtils';
import '../styles/AttendanceTimeline.css';

// Format shift time "HH:mm" as IST display (hh:mm AM/PM)
const formatShiftTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = String(time).split(':');
    const todayStr = getISTDateString(getISTNow());
    const date = parseISTDate(`${todayStr}T${hours.padStart(2, '0')}:${(minutes || '00').padStart(2, '0')}:00+05:30`);
    return formatISTTime(date, { hour: '2-digit', minute: '2-digit', hour12: true });
};

// Optimized: Calculate 'now' internally using IST
const AttendanceTimeline = ({ logs, currentDate, onDayClick, saturdayPolicy = 'All Saturdays Working', shiftInfo, isAdminView, holidays = [], summary = null }) => {
    
    const weekDays = useMemo(() => {
        // Generate week days in IST
        const weekRange = getISTWeekRange(currentDate);
        const todayIST = getISTNow();
        const todayStr = getISTDateString(todayIST);
        
        const days = [];
        const logMap = new Map((logs || []).map(log => [log.attendanceDate, log]));
        
        // Generate 7 days starting from Sunday
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekRange.startDate);
            date.setDate(date.getDate() + i);
            const dateIST = parseISTDate(getISTDateString(date));
            const dateStr = getISTDateString(dateIST);
            const log = logMap.get(dateStr);
            
            // Use backend computed fields - holidayInfo and leaveInfo come from backend
            const holidayInfo = log?.holidayInfo || null;
            const leaveInfo = log?.leaveInfo || null;
            
            // CRITICAL: Backend has already resolved status with proper precedence
            // Frontend MUST use backend status - NO RECALCULATION
            const statusInfo = getDisplayStatus(log, holidayInfo, leaveInfo);
            const status = statusInfo.status;
            
            // Defensive check: If backend says it's a holiday/weekly off but status is Absent, log warning
            if (process.env.NODE_ENV === 'development' && log) {
                if ((log.isHoliday || log.isWeeklyOff) && log.attendanceStatus === 'Absent') {
                    console.warn(`[STATUS MISMATCH] Date ${dateStr}: Backend flags indicate holiday/weekly off but status is Absent`, {
                        isHoliday: log.isHoliday,
                        isWeeklyOff: log.isWeeklyOff,
                        attendanceStatus: log.attendanceStatus
                    });
                }
            }
            
            days.push({ 
                date: dateIST, 
                log: log,
                status: status,
                leave: leaveInfo || null,
                holiday: holidayInfo || null
            });
        }
        return days;
    }, [logs, currentDate]); // Removed saturdayPolicy and holidays - backend handles all

    const summaryStats = useMemo(() => {
        const stats = { present: 0 };
        weekDays.forEach(day => {
            if (day.log && day.log.attendanceStatus && ['On-time', 'Late', 'Half-day'].includes(day.log.attendanceStatus)) {
                stats.present++;
            }
        });
        stats.payable = stats.present;
        return stats;
    }, [weekDays]);

    const summaryHours = useMemo(() => {
        // FIXED: Use backend summary if available (includes all dates in range)
        if (summary && summary.totalWorkedMinutes !== undefined) {
            return formatDuration(summary.totalWorkedMinutes);
        }
        // Fallback: Calculate from weekDays (only for backward compatibility)
        let totalMinutes = 0;
        weekDays.forEach(day => {
            if (day.log && day.log.totalWorkedMinutes) {
                // Use backend computed totalWorkedMinutes
                totalMinutes += day.log.totalWorkedMinutes;
            }
        });
        return formatDuration(totalMinutes);
    }, [weekDays, summary]);
    
    const payableHours = useMemo(() => {
        // Dynamic expected weekly hours from employee Saturday schedule: 6 working days → 54 hrs, 5 → 45 hrs
        const saturdayDate = weekDays.length > 6 ? weekDays[6].date : null;
        if (saturdayDate) {
            const { expectedMinutes } = getExpectedWeeklyWorkingHours(saturdayPolicy, saturdayDate);
            return formatDuration(expectedMinutes);
        }
        return formatDuration(54 * 60); // default 54 hrs if week not ready
    }, [weekDays, saturdayPolicy]);

    const timeAxisLabels = ['10AM', '11AM', '12PM', '01PM', '02PM', '03PM', '04PM', '05PM', '06PM', '07PM'];

    return (
        <div className="attendance-timeline-container">
            {/* Daily Attendance Cards */}
            <div className="daily-cards-container">
                {weekDays.map(day => (
                    <DailyTimelineRow 
                        key={day.date.toISOString()} 
                        dayData={day}
                        onClick={() => onDayClick(day)}
                        shiftInfo={shiftInfo}
                    />
                ))}
            </div>

            {/* Time Axis — aligned with the timeline track in each daily row */}
            <div className="time-axis-container">
                <div className="time-axis-date-spacer" aria-hidden="true" />
                <div className="time-axis-track">
                    <div className="time-axis-check-spacer" aria-hidden="true" />
                    <div className="time-axis">
                        {timeAxisLabels.map(label => <span key={label} className="time-label">{label}</span>)}
                    </div>
                    <div className="time-axis-check-spacer" aria-hidden="true" />
                </div>
                <div className="time-axis-hours-spacer" aria-hidden="true" />
            </div>
            
            {/* Summary Section */}
            <div className="summary-section">
                <div className="summary-header-card">
                    <div className="summary-header-text">
                        <span>Days</span>
                        <span>Hours</span>
                    </div>
                </div>
                <div className="summary-cards">
                    <div className="summary-card total-hours">
                        <div className="summary-card-indicator"></div>
                        <div className="summary-card-content">
                            <span className="summary-card-label">Total Hours</span>
                            <span className="summary-card-value">{summaryHours}</span>
                        </div>
                    </div>
                    <div className="summary-card payable-hours">
                        <div className="summary-card-indicator"></div>
                        <div className="summary-card-content">
                            <span className="summary-card-label">Payable Hours</span>
                            <span className="summary-card-value">{payableHours}</span>
                        </div>
                    </div>
                    <div className="summary-card present-hours">
                        <div className="summary-card-indicator"></div>
                        <div className="summary-card-content">
                            <span className="summary-card-label">Present Days</span>
                            <span className="summary-card-value">{summaryStats.present}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// PERFORMANCE OPTIMIZATION: Memoize component to prevent unnecessary re-renders
export default memo(AttendanceTimeline);
