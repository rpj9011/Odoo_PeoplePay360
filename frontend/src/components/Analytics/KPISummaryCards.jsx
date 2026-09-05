/**
 * KPI SUMMARY CARDS COMPONENT
 * 
 * Displays key performance indicators for attendance analytics.
 * Shows 10 KPI cards in a responsive grid layout.
 */

import React, { useMemo } from 'react';
import GroupIcon from '@mui/icons-material/Group';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import CancelIcon from '@mui/icons-material/Cancel';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import BarChartIcon from '@mui/icons-material/BarChart';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AvTimerIcon from '@mui/icons-material/AvTimer';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { formatNumber, formatInt, formatHoursToHHMM } from '../../utils/analyticsFormatters';
import './KPISummaryCards.css';

function KPISummaryCards({ summary }) {
    const kpiCards = useMemo(() => [
        {
            title: 'Total Employees',
            value: formatInt(summary?.totalEmployees),
            icon: <GroupIcon />,
            color: 'blue'
        },
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
            title: 'Attendance %',
            value: `${formatNumber(summary?.attendancePercentage)}%`,
            icon: <BarChartIcon />,
            color: 'teal'
        },
        {
            title: 'Total Net Working Hours',
            value: summary?.totalNetHoursFormatted || formatHoursToHHMM(summary?.totalNetHours),
            icon: <AccessTimeIcon />,
            color: 'indigo'
        },
        {
            title: 'Average Working Hours',
            value: formatHoursToHHMM(summary?.averageWorkingHours),
            icon: <AvTimerIcon />,
            color: 'cyan'
        },
        {
            title: 'Overtime Hours',
            value: summary?.overtimeHoursFormatted || formatHoursToHHMM(summary?.overtimeHours),
            icon: <WhatshotIcon />,
            color: 'pink'
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

export default KPISummaryCards;
