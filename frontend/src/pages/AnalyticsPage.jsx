/**
 * ANALYTICS PAGE
 * 
 * Page wrapper for the Attendance Analytics Dashboard.
 * Provides layout and access control.
 */

import React from 'react';
import { Box } from '@mui/material';
import AttendanceDashboard from '../components/Analytics/AttendanceDashboard';
import './AnalyticsPage.css';

function AnalyticsPage() {
    return (
        <Box className="analytics-page" sx={{ width: '100%', minHeight: '100vh', background: '#f5f6fb' }}>
            <AttendanceDashboard />
        </Box>
    );
}

export default AnalyticsPage;
