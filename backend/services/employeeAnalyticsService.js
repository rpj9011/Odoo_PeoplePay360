/**
 * EMPLOYEE ANALYTICS SERVICE
 * 
 * API service for fetching individual employee detailed analytics.
 * Updated to support PDF export instead of CSV.
 */

import api from '../api/axios';
import { cachedApiCall } from '../utils/apiCache';

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
 * Export employee analytics to Excel or PDF format
 * 
 * @param {string} employeeId - Employee ID
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (YYYY)
 * @param {string} format - Export format ('xlsx' or 'pdf')
 * @returns {Promise<void>}
 */
export async function exportEmployeeAnalytics(employeeId, month, year, format = 'xlsx') {
    try {
        // Build query params
        const params = new URLSearchParams();
        params.append('month', String(month).padStart(2, '0'));
        params.append('year', String(year));
        params.append('format', format);
        
        // Make API request
        const response = await api.get(
            `/analytics/export/employee/${employeeId}?${params.toString()}`,
            {
                responseType: 'blob', // Important for binary data
            }
        );
        
        // Create blob from response
        const blob = new Blob([response.data], {
            type: format === 'pdf' 
                ? 'application/pdf' 
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Generate filename
        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
        link.download = `Employee_Analytics_${monthName}_${year}.${format}`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('[EmployeeAnalyticsService] Export error:', error);
        
        if (error.response) {
            // Try to parse error message if it's JSON
            if (error.response.data instanceof Blob) {
                const text = await error.response.data.text();
                try {
                    const json = JSON.parse(text);
                    throw new Error(json.message || 'Failed to export analytics');
                } catch (e) {
                    throw new Error('Failed to export analytics');
                }
            }
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
