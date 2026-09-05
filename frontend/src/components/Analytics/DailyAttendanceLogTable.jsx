/**
 * DAILY ATTENDANCE LOG TABLE COMPONENT
 * 
 * Displays detailed daily attendance records for an employee.
 * Includes clock in/out times, worked hours, break time, and status.
 */

import React, { useState, useMemo } from 'react';
import { formatHoursToHHMM } from '../../utils/analyticsFormatters';
import './DailyAttendanceLogTable.css';

function DailyAttendanceLogTable({ dailyLogs }) {
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'asc' });
    
    // Get status color class
    const getStatusClass = (status) => {
        const statusLower = status?.toLowerCase() || '';
        if (statusLower.includes('on-time') || statusLower.includes('late') || statusLower.includes('present')) {
            return 'status-present';
        }
        if (statusLower.includes('absent')) {
            return 'status-absent';
        }
        if (statusLower.includes('leave')) {
            return 'status-leave';
        }
        if (statusLower.includes('holiday') || statusLower.includes('weekly off') || statusLower.includes('weekend')) {
            return 'status-holiday';
        }
        return 'status-default';
    };
    
    // Handle sorting
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    // Pre-compute all derived display values once per data change
    const processedLogs = useMemo(() => {
        return dailyLogs
            .filter(log => {
                const status = log.status?.toLowerCase() || '';
                return !status.includes('holiday') &&
                       !status.includes('weekly off') &&
                       !status.includes('weekend');
            })
            .map(log => {
                // Parse date once per log entry
                const dateObj = log.date ? new Date(log.date) : null;
                const clockInObj = log.clockIn ? new Date(log.clockIn) : null;
                const clockOutObj = log.clockOut ? new Date(log.clockOut) : null;
                
                const isLeave = log.status === 'Leave' || log.status === 'Approved Leave';
                const isAbsent = log.status === 'Absent';
                
                return {
                    ...log,
                    _formatted: {
                        date: dateObj ? dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
                        day: dateObj ? dateObj.toLocaleDateString('en-US', { weekday: 'short' }) : '-',
                        clockIn: isLeave ? 'Leave' : isAbsent ? 'Absent' : (clockInObj ? clockInObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-'),
                        clockOut: isLeave ? 'Leave' : isAbsent ? 'Absent' : (clockOutObj ? clockOutObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-'),
                        workedTime: isLeave || isAbsent ? '-' : formatHoursToHHMM(log.workedTime),
                        breakTime: isLeave || isAbsent ? '-' : formatHoursToHHMM(log.breakTime),
                        totalTime: isLeave || isAbsent ? '-' : formatHoursToHHMM(log.totalTime),
                        overtimeHours: isLeave || isAbsent ? '-' : (log.overtimeHours > 0 ? formatHoursToHHMM(log.overtimeHours) : '00:00'),
                    }
                };
            });
    }, [dailyLogs]);
    
    // Sort logs
    const sortedLogs = useMemo(() => {
        if (!sortConfig.key) return processedLogs;
        
        return [...processedLogs].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];
            
            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;
            
            if (typeof aValue === 'string') {
                return sortConfig.direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }
            
            return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
        });
    }, [processedLogs, sortConfig]);
    
    // Empty state
    if (!dailyLogs || dailyLogs.length === 0) {
        return (
            <div className="daily-log-table-container">
                <div className="empty-state">
                    <div className="empty-icon">📅</div>
                    <h3>No Attendance Data</h3>
                    <p>No daily attendance records found for the selected period.</p>
                </div>
            </div>
        );
    }
    
    // Empty state after filtering
    if (sortedLogs.length === 0) {
        return (
            <div className="daily-log-table-container">
                <div className="empty-state">
                    <div className="empty-icon">📅</div>
                    <h3>No Working Days</h3>
                    <p>All days in the selected period are weekends or holidays.</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="daily-log-table-container">
            <div className="table-wrapper">
                <table className="daily-log-table">
                    <thead>
                        <tr>
                            <th>Sr No</th>
                            <th onClick={() => handleSort('date')} className="sortable">
                                Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th>Day</th>
                            <th>Clock In</th>
                            <th>Clock Out</th>
                            <th onClick={() => handleSort('workedTime')} className="sortable">
                                Worked Time {sortConfig.key === 'workedTime' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('breakTime')} className="sortable">
                                Break Time {sortConfig.key === 'breakTime' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('totalTime')} className="sortable">
                                Total Time {sortConfig.key === 'totalTime' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('overtimeHours')} className="sortable">
                                Overtime {sortConfig.key === 'overtimeHours' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('dayType')} className="sortable">
                                Day Type {sortConfig.key === 'dayType' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => handleSort('status')} className="sortable">
                                Status {sortConfig.key === 'status' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedLogs.map((log, index) => {
                            const isLeave = log.status === 'Leave' || log.status === 'Approved Leave';
                            const isAbsent = log.status === 'Absent';
                            
                            return (
                                <tr key={index} className={log.overriddenByAdmin ? 'admin-override' : ''}>
                                    <td className="number-cell">{index + 1}</td>
                                    <td className="date-cell">{log._formatted.date}</td>
                                    <td className="day-cell">{log._formatted.day}</td>
                                    <td className="time-cell">{log._formatted.clockIn}</td>
                                    <td className="time-cell">{log._formatted.clockOut}</td>
                                    <td className="number-cell">{log._formatted.workedTime}</td>
                                    <td className="number-cell">{log._formatted.breakTime}</td>
                                    <td className="number-cell">{log._formatted.totalTime}</td>
                                    <td className={`number-cell ${log.overtimeHours > 0 ? 'overtime-positive' : ''}`}>
                                        {log._formatted.overtimeHours}
                                    </td>
                                    <td className="day-type-cell">
                                        {log.dayType}
                                        {log.isHalfDay && log.workedTime > 0 && (
                                            <div className="half-day-reason">{formatHoursToHHMM(log.workedTime)} hrs</div>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`status-badge ${getStatusClass(log.status)}`}>
                                            {log.status}
                                        </span>
                                        {log.overriddenByAdmin && (
                                            <span className="admin-badge">Admin Modified</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default DailyAttendanceLogTable;
