/**
 * EMPLOYEE FILTER CONTROLS COMPONENT
 * 
 * Filter controls for employee detailed analytics.
 * Allows filtering by month and year only.
 */

import React, { useState } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { getISTNow } from '../../utils/istTime';
import './FilterControls.css';

function EmployeeFilterControls({ filters, onFilterChange }) {
    const [localFilters, setLocalFilters] = useState(filters);
    const now = getISTNow();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    // Generate year options (current year and 2 years back)
    const yearOptions = [];
    for (let i = 0; i < 3; i++) {
        yearOptions.push(currentYear - i);
    }
    
    // Month options
    const monthOptions = [
        { value: 1, label: 'January' },
        { value: 2, label: 'February' },
        { value: 3, label: 'March' },
        { value: 4, label: 'April' },
        { value: 5, label: 'May' },
        { value: 6, label: 'June' },
        { value: 7, label: 'July' },
        { value: 8, label: 'August' },
        { value: 9, label: 'September' },
        { value: 10, label: 'October' },
        { value: 11, label: 'November' },
        { value: 12, label: 'December' }
    ];
    
    // Handle filter change
    const handleChange = (field, value) => {
        setLocalFilters(prev => ({ ...prev, [field]: value }));
    };
    
    // Handle apply
    const handleApply = () => {
        onFilterChange(localFilters);
    };
    
    // Handle reset
    const handleReset = () => {
        const reset = { month: currentMonth, year: currentYear };
        setLocalFilters(reset);
        onFilterChange(reset);
    };
    
    return (
        <Box className="filter-controls" sx={{ 
            background: 'white',
            borderRadius: '12px',
            padding: '16px 20px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            marginBottom: '20px'
        }}>
            <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 2,
                flexWrap: 'wrap'
            }}>
                <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Month</InputLabel>
                    <Select
                        value={localFilters.month}
                        label="Month"
                        onChange={(e) => handleChange('month', e.target.value)}
                    >
                        {monthOptions.map(option => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                
                <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel>Year</InputLabel>
                    <Select
                        value={localFilters.year}
                        label="Year"
                        onChange={(e) => handleChange('year', e.target.value)}
                    >
                        {yearOptions.map(year => (
                            <MenuItem key={year} value={year}>
                                {year}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                
                <Button
                    variant="contained"
                    onClick={handleApply}
                    size="small"
                    sx={{
                        textTransform: 'none',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        fontWeight: 500,
                        '&:hover': { backgroundColor: '#2563eb' }
                    }}
                >
                    Apply
                </Button>
                
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={handleReset}
                    size="small"
                    sx={{
                        textTransform: 'none',
                        borderColor: '#e5e7eb',
                        color: '#6b7280',
                        fontWeight: 500,
                        '&:hover': {
                            borderColor: '#d1d5db',
                            backgroundColor: '#f9fafb'
                        }
                    }}
                >
                    Reset
                </Button>
            </Box>
        </Box>
    );
}

export default EmployeeFilterControls;
