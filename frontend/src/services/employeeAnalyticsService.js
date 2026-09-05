/**
 * EMPLOYEE ANALYTICS SERVICE
 * 
 * API service for fetching individual employee detailed analytics.
 */

import api from '../api/axios';
import { cachedApiCall } from '../utils/apiCache';
import * as XLSX from 'xlsx';

/**
 * Fetch detailed analytics for a single employee
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (YYYY)
 * @returns {Promise<Object>} Employee analytics data
 */
export async function fetchEmployeeDetailedAnalytics(employeeId, month, year) {
    try {
        // Build query params
        const params = new URLSearchParams();
        params.append('month', String(month).padStart(2, '0'));
        params.append('year', String(year));
        
        // Make API request using centralized axios instance with caching
        const response = await cachedApiCall(
            () => api.get(`/analytics/employee/${employeeId}?${params.toString()}`),
            { method: 'GET', url: `/analytics/employee/${employeeId}`, params: Object.fromEntries(params) },
            { ttl: 180000, staleWhileRevalidate: true }
        );
        
        if (response.data.success) {
            return response.data.data;
        } else {
            throw new Error(response.data.message || 'Failed to fetch employee analytics');
        }
    } catch (error) {
        console.error('[EmployeeAnalyticsService] Error:', error);
        
        if (error.response) {
            throw new Error(error.response.data.message || 'Server error');
        } else if (error.request) {
            throw new Error('Network error. Please check your connection.');
        } else {
            throw error;
        }
    }
}

/**
 * Export employee analytics to Excel, CSV, or PDF format
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (YYYY)
 * @param {string} format - Export format ('xlsx', 'csv', or 'pdf')
 * @returns {Promise<void>}
 */
export async function exportEmployeeAnalytics(employeeId, month, year, format = 'xlsx') {
    try {
        // For PDF format, use backend API endpoint
        if (format === 'pdf') {
            const params = new URLSearchParams();
            params.append('month', String(month).padStart(2, '0'));
            params.append('year', String(year));
            params.append('format', 'pdf');
            
            const response = await api.get(
                `/analytics/export/employee/${employeeId}?${params.toString()}`,
                { responseType: 'blob' }
            );
            
            // Create download link
            const blob = new Blob([response.data], { type: 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Generate filename
            const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
            link.download = `Employee_Analytics_${monthName}_${year}.pdf`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            return;
        }
        
        // For Excel and CSV, fetch the analytics data and generate client-side
        const data = await fetchEmployeeDetailedAnalytics(employeeId, month, year);
        
        if (format === 'xlsx') {
            // Generate Excel file client-side using xlsx library
            const wb = XLSX.utils.book_new();
            
            // Employee Info Sheet
            const employeeInfo = [
                ['Employee Analytics Report'],
                [],
                ['Employee Name:', data.employeeInfo.fullName],
                ['Employee Code:', data.employeeInfo.employeeCode],
                ['Department:', data.employeeInfo.department],
                ['Designation:', data.employeeInfo.designation],
                ['Shift Group:', data.employeeInfo.shiftGroup],
                ['Period:', `${month}/${year}`],
                [],
                ['Summary Metrics'],
                ['Total Days:', data.summary.totalDays],
                ['Working Days:', data.summary.workingDays],
                ['Present Days:', data.summary.presentDays],
                ['Absent Days:', data.summary.absentDays],
                ['Half Days:', data.summary.halfDays],
                ['Leave Days:', data.summary.leaveDays],
                ['Attendance Rate:', `${data.summary.attendanceRate}%`],
                ['Total Worked Hours:', data.summary.totalWorkedHours],
                ['Avg Working Hours:', data.summary.avgWorkingHours]
            ];
            
            const wsInfo = XLSX.utils.aoa_to_sheet(employeeInfo);
            wsInfo['!cols'] = [{ wch: 25 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, wsInfo, 'Summary');
            
            // Daily Logs Sheet
            const dailyLogsData = data.dailyLogs.map(log => ({
                'Date': log.date,
                'Clock In': log.clockIn || '-',
                'Clock Out': log.clockOut || '-',
                'Worked Time (hrs)': log.workedTime,
                'Break Time (hrs)': log.breakTime,
                'Total Time (hrs)': log.totalTime,
                'Day Type': log.dayType,
                'Status': log.status,
                'Half Day': log.isHalfDay ? 'Yes' : 'No',
                'Half Day Reason': log.halfDayReason || '-',
                'Admin Override': log.overriddenByAdmin ? 'Yes' : 'No'
            }));
            
            const wsLogs = XLSX.utils.json_to_sheet(dailyLogsData);
            wsLogs['!cols'] = [
                { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, 
                { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, 
                { wch: 10 }, { wch: 20 }, { wch: 15 }
            ];
            XLSX.utils.book_append_sheet(wb, wsLogs, 'Daily Logs');
            
            // Generate filename
            const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
            const filename = `${data.employeeInfo.fullName.replace(/\s+/g, '_')}_Analytics_${monthName}_${year}.xlsx`;
            
            // Download file
            XLSX.writeFile(wb, filename);
            
        } else {
            // CSV format - export daily logs only
            const wb = XLSX.utils.book_new();
            
            const dailyLogsData = data.dailyLogs.map(log => ({
                'Date': log.date,
                'Clock In': log.clockIn || '-',
                'Clock Out': log.clockOut || '-',
                'Worked Time (hrs)': log.workedTime,
                'Break Time (hrs)': log.breakTime,
                'Total Time (hrs)': log.totalTime,
                'Day Type': log.dayType,
                'Status': log.status,
                'Half Day': log.isHalfDay ? 'Yes' : 'No',
                'Half Day Reason': log.halfDayReason || '-',
                'Admin Override': log.overriddenByAdmin ? 'Yes' : 'No'
            }));
            
            const ws = XLSX.utils.json_to_sheet(dailyLogsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Daily Logs');
            
            // Generate filename
            const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
            const filename = `${data.employeeInfo.fullName.replace(/\s+/g, '_')}_Analytics_${monthName}_${year}.csv`;
            
            // Download as CSV
            XLSX.writeFile(wb, filename, { bookType: 'csv' });
        }
        
    } catch (error) {
        console.error('[EmployeeAnalyticsService] Export error:', error);
        
        if (error.response) {
            throw new Error(error.response.data.message || 'Failed to export analytics');
        } else if (error.request) {
            throw new Error('Network error. Please check your connection.');
        } else {
            throw error;
        }
    }
}

export default {
    fetchEmployeeDetailedAnalytics,
    exportEmployeeAnalytics
};
