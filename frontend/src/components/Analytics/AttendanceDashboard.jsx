/**
 * ATTENDANCE DASHBOARD COMPONENT
 * 
 * Main container for the attendance analytics dashboard.
 * Manages state, data fetching, and renders all sub-components.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, TextField, InputAdornment, IconButton } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { fetchAttendanceAnalytics } from '../../services/analyticsService';
import { getISTDateString, getISTNow } from '../../utils/istTime';
import PageHeroHeader from '../PageHeroHeader';
import KPISummaryCards from './KPISummaryCards';
import EmployeeAnalyticsTable from './EmployeeAnalyticsTable';
import FilterControls from './FilterControls';
import './AttendanceDashboard.css';

function AttendanceDashboard() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const debounceRef = useRef(null);
    const searchDebounceRef = useRef(null);
    const [filters, setFilters] = useState(() => {
        // Initialize with current month
        const now = getISTNow();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return {
            startDate: `${year}-${month}-01`,
            endDate: getISTDateString(now),
            department: '',
            location: '',
            shiftType: '',
            employmentStatus: '',
            search: '',
            page: 1,
            limit: 50
        };
    });
    
    // Update URL params when filters change
    useEffect(() => {
        const params = new URLSearchParams();
        
        // Extract month and year from startDate for URL params
        if (filters.startDate) {
            const [year, month] = filters.startDate.split('-');
            params.set('month', month);
            params.set('year', year);
        }
        
        setSearchParams(params);
    }, [filters.startDate, setSearchParams]);
    
    // Fetch analytics data
    const fetchData = async () => {
        try {
            // First load: show full spinner. Subsequent loads: show subtle refreshing indicator.
            if (data === null) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }
            setError(null);
            const result = await fetchAttendanceAnalytics(filters);
            setData(result);
        } catch (err) {
            console.error('Error fetching analytics:', err);
            setError(err.message || 'Failed to fetch analytics data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };
    
    // Fetch data on mount and when filters change (debounced)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchData();
        }, 400);
        return () => clearTimeout(debounceRef.current);
    }, [filters]);
    
    // Handle filter changes from FilterControls panel
    // KEY FIX: if FilterControls sends a 'search' field (e.g. from Clear Filters),
    // we must also update the searchQuery state so the search box reflects the reset.
    const handleFilterChange = (newFilters) => {
        // If the incoming filters explicitly include 'search', sync the search box
        if ('search' in newFilters) {
            setSearchQuery(newFilters.search || '');
        }
        setFilters(prev => ({
            ...prev,
            ...newFilters,
            page: 1 // Reset to first page when filters change
        }));
    };
    
    // Handle pagination
    const handlePageChange = (newPage) => {
        setFilters(prev => ({
            ...prev,
            page: newPage
        }));
    };
    
    // Handle toggle filters
    const handleToggleFilters = () => {
        setShowFilters(prev => !prev);
    };
    
    // Handle search input change
    const handleSearchChange = (event) => {
        const value = event.target.value;
        setSearchQuery(value);
        
        // Debounce search to avoid too many API calls
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            console.log('[AttendanceDashboard] Search query:', value);
            setFilters(prev => ({
                ...prev,
                search: value,
                page: 1, // Reset to first page when search changes
                _searchTs: Date.now() // force new cache key so cached stale results are skipped
            }));
        }, 500);
    };
    
    // Handle clear search
    const handleClearSearch = () => {
        setSearchQuery('');
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        setFilters(prev => ({
            ...prev,
            search: '',
            page: 1,
            _searchTs: Date.now() // force cache bypass
        }));
    };
    
    return (
        <Box className="attendance-dashboard">
            <PageHeroHeader
                eyebrow="Workforce Insights"
                title="Attendance Analytics"
                description="Workforce attendance metrics and performance insights."
                actionArea={
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <TextField
                            placeholder="Search employees..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            size="small"
                            sx={{
                                minWidth: '280px',
                                '& .MuiOutlinedInput-root': {
                                    background: 'white',
                                    borderRadius: '10px',
                                    '& fieldset': {
                                        borderColor: 'rgba(15, 23, 42, 0.12)',
                                    },
                                    '&:hover fieldset': {
                                        borderColor: 'rgba(15, 23, 42, 0.24)',
                                    },
                                    '&.Mui-focused fieldset': {
                                        borderColor: '#3b82f6',
                                    },
                                },
                            }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ color: '#64748b' }} />
                                    </InputAdornment>
                                ),
                                endAdornment: searchQuery && (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={handleClearSearch}
                                            edge="end"
                                            sx={{ color: '#64748b' }}
                                        >
                                            <ClearIcon fontSize="small" />
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <Button
                            variant="contained"
                            startIcon={<FilterListIcon />}
                            onClick={handleToggleFilters}
                            sx={{
                                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                color: 'white',
                                textTransform: 'none',
                                fontWeight: 600,
                                px: 3,
                                py: 1,
                                borderRadius: '10px',
                                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)',
                                    boxShadow: '0 6px 20px rgba(239, 68, 68, 0.5)',
                                }
                            }}
                        >
                            Filter
                        </Button>
                    </Box>
                }
            />
            
            <Box sx={{ py: 0, px: 0, maxWidth: '100%' }}>
                {showFilters && (
                    <FilterControls filters={filters} onFilterChange={handleFilterChange} />
                )}
                
                {/* Only show full-page spinner when there's no data yet */}
                {loading && (
                    <Box className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading analytics data...</p>
                    </Box>
                )}
                
                {/* Show subtle indicator when refreshing existing data */}
                {refreshing && data && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0, pb: 1, opacity: 0.6 }}>
                        <div className="spinner" style={{ width: 16, height: 16 }} />
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Updating...</span>
                    </Box>
                )}
                
                {error && (
                    <Box className="error-state">
                        <div className="error-icon">⚠️</div>
                        <h3>Error Loading Data</h3>
                        <p>{error}</p>
                        <Button
                            variant="contained"
                            onClick={fetchData}
                            sx={{
                                background: '#3b82f6',
                                textTransform: 'none',
                                '&:hover': {
                                    background: '#2563eb',
                                }
                            }}
                        >
                            Try Again
                        </Button>
                    </Box>
                )}
                
                {/* Always show data if we have it, even during refresh */}
                {!loading && !error && data && (
                    <>
                        <KPISummaryCards summary={data.summary} />
                        <EmployeeAnalyticsTable
                            employees={data.employeeAnalytics}
                            pagination={data.pagination}
                            onPageChange={handlePageChange}
                        />
                    </>
                )}
            </Box>
        </Box>
    );
}

export default AttendanceDashboard;
