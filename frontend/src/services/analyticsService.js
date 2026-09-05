/**
 * ANALYTICS SERVICE
 * 
 * Frontend service for fetching attendance analytics data.
 * Handles API communication and data formatting.
 */

import api from '../api/axios';
import { cachedApiCall } from '../utils/apiCache';

/**
 * Fetch attendance analytics with filters
 * 
 * @param {Object} filters - Filter criteria
 * @param {string} filters.startDate - Start date (YYYY-MM-DD)
 * @param {string} filters.endDate - End date (YYYY-MM-DD)
 * @param {string} [filters.department] - Department filter
 * @param {string} [filters.location] - Location filter
 * @param {string} [filters.shiftType] - Shift type filter
 * @param {string} [filters.employmentStatus] - Employment status filter
 * @param {string} [filters.search] - Search query for employee name/ID
 * @param {number} [filters.page] - Page number
 * @param {number} [filters.limit] - Records per page
 * 
 * @returns {Promise<Object>} Analytics data with summary and employee metrics
 */
export async function fetchAttendanceAnalytics(filters) {
    try {
        // Build query string from filters
        const params = new URLSearchParams();
        
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.department) params.append('department', filters.department);
        if (filters.location) params.append('location', filters.location);
        if (filters.shiftType) params.append('shiftType', filters.shiftType);
        if (filters.employmentStatus) params.append('employmentStatus', filters.employmentStatus);
        if (filters.search) params.append('search', filters.search);
        if (filters.page) params.append('page', filters.page);
        if (filters.limit) params.append('limit', filters.limit);
        
        console.log('[analyticsService] Fetching with filters:', Object.fromEntries(params));
        
        // Make API request using centralized axios instance with caching
        const response = await cachedApiCall(
            () => api.get(`/analytics/attendance?${params.toString()}`),
            { method: 'GET', url: `/analytics/attendance`, params: Object.fromEntries(params) },
            { ttl: 180000, staleWhileRevalidate: true }
        );
        
        if (response.data.success) {
            return response.data.data;
        } else {
            throw new Error(response.data.message || 'Failed to fetch analytics data');
        }
    } catch (error) {
        console.error('[analyticsService] Error fetching attendance analytics:', error);
        
        // Handle specific error cases
        if (error.response) {
            // Server responded with error status
            const message = error.response.data?.message || 'Failed to fetch analytics data';
            throw new Error(message);
        } else if (error.request) {
            // Request was made but no response received
            throw new Error('No response from server. Please check your connection.');
        } else {
            // Something else happened
            throw error;
        }
    }
}

export default {
    fetchAttendanceAnalytics
};
