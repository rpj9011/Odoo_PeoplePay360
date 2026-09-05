/**
 * EMPLOYEE KPI CARDS COMPONENT
 * 
 * Displays individual employee KPI metrics in a responsive grid.
 * Shows 9 KPI cards specific to employee performance.
 */

import React, { useMemo } from 'react';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import CancelIcon from '@mui/icons-material/Cancel';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AvTimerIcon from '@mui/icons-material/AvTimer';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { formatNumber, formatInt, formatHoursToHHMM } from '../../utils/analyticsFormatters';
import './KPISummaryCards.css';

function EmployeeKPICards({ summary }) {
    const kpiCards = useMemo(() => [
        {
            title: 'Present Days',
            value: formatNumber(summary?.presentDays),
            icon: <CheckCircleIcon />,
            color: 'green'
        },
        {
            title: 'Leave Days',
            value: formatNumber(summary?.leaveDays),
            icon: <BeachAccessIcon />,
            color: 'orange'
        },
        {
            title: 'Absent Days',
            value: formatNumber(summary?.absentDays),
            icon: <CancelIcon />,
            color: 'red'
        },
        {
            title: 'Total Non-Working Days',
            value: formatNumber(summary?.nonWorkingDays),
            icon: <EventBusyIcon />,
            color: 'purple'
        },
        {
            title: 'Total Net Working Hours',
            value: summary?.totalNetHoursFormatted || formatHoursToHHMM(summary?.totalNetHours),
            icon: <AccessTimeIcon />,
            color: 'indigo'
        },
        {
            title: 'Average Working Hours',
            value: formatHoursToHHMM(summary?.avgWorkingHours),
            icon: <AvTimerIcon />,
            color: 'cyan'
        },
        {
            title: 'Overtime Hours',
            value: summary?.overtimeHoursFormatted || formatHoursToHHMM(summary?.overtimeHours),
            icon: <WhatshotIcon />,
            color: 'pink'
        },
        {
            title: 'Half Days',
            value: formatNumber(summary?.halfDays),
            icon: <HourglassEmptyIcon />,
            color: 'teal'
        },
        {
            title: 'Full Days',
            value: formatNumber(summary?.fullDays),
            icon: <EventAvailableIcon />,
            color: 'blue'
        }
    ], [summary]);
    
    return (
        <div className="kpi-summary-cards">
            {kpiCards.map((card, index) => (
                <div key={index} className={`kpi-card kpi-card-${card.color}`}>
                    <div className="kpi-icon">{card.icon}</div>
                    <div className="kpi-content">
                        <div className="kpi-title">{card.title}</div>
                        <div className="kpi-value">{card.value}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default EmployeeKPICards;
