/**
 * EMPLOYEE DETAILED ANALYTICS COMPONENT
 * 
 * Displays comprehensive attendance analytics for a single employee.
 * Includes KPI cards, filters, and detailed daily attendance log table.
 * Updated to support PDF export instead of CSV.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import DescriptionIcon from '@mui/icons-material/Description';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { fetchEmployeeDetailedAnalytics } from '../../services/employeeAnalyticsService';
import { exportEmployeeAnalytics } from '../../services/employeeAnalyticsService';
import { getISTNow } from '../../utils/istTime';
import PageHeroHeader from '../PageHeroHeader';
import EmployeeKPICards from './EmployeeKPICards';
import EmployeeFilterControls from './EmployeeFilterControls';
import DailyAttendanceLogTable from './DailyAttendanceLogTable';
import './EmployeeDetailedAnalytics.css';

function EmployeeDetailedAnalytics() {
    const { employeeId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
    const [exporting, setExporting] = useState(false);
    const debounceRef = useRef(null);
    
    // Initialize filters from URL params or current month
    const [filters, setFilters] = useState(() => {
        const now = getISTNow();
        const urlMonth = searchParams.get('month');
        const urlYear = searchParams.get('year');
        
        return {
            month: urlMonth ? parseInt(urlMonth) : now.getMonth() + 1,
            year: urlYear ? parseInt(urlYear) : now.getFullYear()
        };
    });
    
    // Fetch employee analytics data
    const fetchData = async () => {
        try {
            // First load: show full spinner. Subsequent loads: show subtle refreshing indicator.
            if (data === null) {
                setLoading(true);
            } else {
                setRefreshing(true);
            }
            setError(null);
            const result = await fetchEmployeeDetailedAnalytics(
                employeeId,
                filters.month,
                filters.year
            );
            setData(result);
        } catch (err) {
            console.error('Error fetching employee analytics:', err);
            setError(err.message || 'Failed to fetch employee analytics');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };
    
    // Fetch data when filters change (debounced)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetchData();
        }, 400);
        return () => clearTimeout(debounceRef.current);
    }, [employeeId, filters]);
    
    // Handle filter changes
    const handleFilterChange = (newFilters) => {
        setFilters(prev => ({
            ...prev,
            ...newFilters
        }));
    };
    
    // Handle back navigation
    const handleBack = () => {
        navigate('/analytics/attendance');
    };
    
    // Handle toggle filters
    const handleToggleFilters = () => {
        setShowFilters(prev => !prev);
    };
    
    // Handle export menu
    const handleExportClick = (event) => {
        setExportMenuAnchor(event.currentTarget);
    };
    
    const handleExportClose = () => {
        setExportMenuAnchor(null);
    };
    
    // Handle export to format
    const handleExport = async (format) => {
        handleExportClose();
        setExporting(true);
        
        try {
            await exportEmployeeAnalytics(employeeId, filters.month, filters.year, format);
        } catch (err) {
            console.error('Error exporting analytics:', err);
            alert('Failed to export analytics. Please try again.');
        } finally {
            setExporting(false);
        }
    };
    
    // Get month name
    const getMonthName = (month) => {
        const months = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return months[month - 1] || '';
    };
    
    return (
        <Box className="employee-detailed-analytics">
            <PageHeroHeader
                eyebrow="Employee Analytics"
                title={
                    <Box>
                        <Box sx={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.2 }}>
                            {data?.employeeInfo?.fullName || 'Loading...'}
                        </Box>
                        {data && (
                            <Box sx={{ 
                                fontSize: '0.875rem', 
                                opacity: 0.9, 
                                mt: 0.5,
                                fontWeight: 400
                            }}>
                                {data.employeeInfo.employeeCode} • {data.employeeInfo.department} • {getMonthName(filters.month)} {filters.year}
                            </Box>
                        )}
                    </Box>
                }
                description={null}
                actionArea={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <IconButton
                            onClick={handleBack}
                            size="small"
                            sx={{
                                color: 'white',
                                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                '&:hover': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.25)',
                                },
                                width: 36,
                                height: 36
                            }}
                        >
                            <ArrowBackIcon fontSize="small" />
                        </IconButton>
                        <Button
                            variant="contained"
                            startIcon={<DownloadIcon />}
                            onClick={handleExportClick}
                            disabled={!data || exporting}
                            size="medium"
                            sx={{
                                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                color: 'white',
                                textTransform: 'none',
                                fontWeight: 600,
                                px: 2.5,
                                py: 0.75,
                                borderRadius: '8px',
                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                                fontSize: '0.875rem',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                    boxShadow: '0 6px 20px rgba(16, 185, 129, 0.5)',
                                },
                                '&:disabled': {
                                    background: '#9CA3AF',
                                    color: 'white',
                                    opacity: 0.6
                                }
                            }}
                        >
                            {exporting ? 'Exporting...' : 'Export'}
                        </Button>
                        <Menu
                            anchorEl={exportMenuAnchor}
                            open={Boolean(exportMenuAnchor)}
                            onClose={handleExportClose}
                            anchorOrigin={{
                                vertical: 'bottom',
                                horizontal: 'right',
                            }}
                            transformOrigin={{
                                vertical: 'top',
                                horizontal: 'right',
                            }}
                            PaperProps={{
                                sx: {
                                    mt: 1,
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                                    minWidth: 180
                                }
                            }}
                        >
                            <MenuItem onClick={() => handleExport('xlsx')}>
                                <ListItemIcon>
                                    <DescriptionIcon fontSize="small" sx={{ color: '#10B981' }} />
                                </ListItemIcon>
                                <ListItemText>Excel (.xlsx)</ListItemText>
                            </MenuItem>
                            <MenuItem onClick={() => handleExport('pdf')}>
                                <ListItemIcon>
                                    <PictureAsPdfIcon fontSize="small" sx={{ color: '#EF4444' }} />
                                </ListItemIcon>
                                <ListItemText>PDF (.pdf)</ListItemText>
                            </MenuItem>
                        </Menu>
                        <Button
                            variant="contained"
                            startIcon={<FilterListIcon />}
                            onClick={handleToggleFilters}
                            size="medium"
                            sx={{
                                background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                                color: 'white',
                                textTransform: 'none',
                                fontWeight: 600,
                                px: 2.5,
                                py: 0.75,
                                borderRadius: '8px',
                                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                                fontSize: '0.875rem',
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
                    <EmployeeFilterControls filters={filters} onFilterChange={handleFilterChange} />
                )}
                
                {/* Only show full-page spinner when there's no data yet */}
                {loading && (
                    <Box className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading employee analytics...</p>
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
                        <EmployeeKPICards 
                            summary={data.summary}
                            employeeInfo={data.employeeInfo}
                        />
                        <DailyAttendanceLogTable
                            dailyLogs={data.dailyLogs}
                            employeeId={employeeId}
                        />
                    </>
                )}
            </Box>
        </Box>
    );
}

export default EmployeeDetailedAnalytics;
