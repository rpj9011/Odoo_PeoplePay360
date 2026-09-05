// frontend/src/components/payroll/EmployeeSalaryDetail.jsx

import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Grid, Paper, Chip, IconButton, Divider, Alert, Select, MenuItem, FormControl, InputLabel, Card, CardContent, Avatar, LinearProgress, Tabs, Tab } from '@mui/material';
import {
  Close,
  CheckCircle,
  Cancel,
  Schedule,
  Person,
  AccessTime,
  CalendarToday,
  TrendingDown,
} from '@mui/icons-material';
import axios from '../../api/axios';
import jsPDF from 'jspdf';
import AttendanceCalendar from '../AttendanceCalendar';
import {
  parseISTDate,
} from '../../utils/istTime';

import { SkeletonBox } from '../SkeletonLoaders';
const EmployeeSalaryDetail = ({ open, onClose, employee, settings }) => {
  const currentDate = new Date();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [loading, setLoading] = useState(false);
  const [attendanceData, setAttendanceData] = useState([]);
  // Raw logs in the format AttendanceCalendar expects (attendanceDate string, sessions, status fields)
  const [calendarLogs, setCalendarLogs] = useState([]);
  const [salaryBreakdown, setSalaryBreakdown] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && employee) {
      fetchEmployeeAttendance();
    }
  }, [open, employee, selectedMonth, selectedYear]);

  const fetchEmployeeAttendance = async () => {
    if (!employee) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Fetch attendance data for the employee for the full month
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      // Use the attendance summary endpoint (same as AdminAttendanceSummaryPage)
      // which returns logs with all resolved fields (holidayInfo, leaveInfo, status, etc.)
      let attendanceLogs = [];
      try {
        const summaryRes = await axios.get(
          `/attendance/summary?startDate=${startStr}&endDate=${endStr}&userId=${employee.id}&includeHolidays=true`
        );
        if (Array.isArray(summaryRes.data)) {
          attendanceLogs = summaryRes.data;
        } else {
          attendanceLogs = Array.isArray(summaryRes.data.logs) ? summaryRes.data.logs : [];
        }
      } catch (_) {
        // Fallback: try the admin per-user attendance endpoint
        const fallbackRes = await axios.get(`/admin/attendance/user/${employee.id}`, {
          params: { startDate: startStr, endDate: endStr }
        });
        attendanceLogs = fallbackRes.data || [];
      }

      // ── Calendar logs (raw, for AttendanceCalendar component) ──────────────
      // AttendanceCalendar.jsx reads: log.attendanceDate, log.clockInTime,
      // log.clockOutTime, log.holidayInfo, log.leaveInfo, log.sessions,
      // log.overriddenByAdmin, log.overrideReason, log.lateMinutes, etc.
      setCalendarLogs(attendanceLogs);
      
      // ── Day-wise breakdown for salary computation ──────────────────────────
      const transformedAttendance = attendanceLogs.map(log => {
        const sessions = log.sessions || [];
        const workingHours = sessions.reduce((total, session) => {
          if (session.startTime && session.endTime) {
            const duration = (new Date(session.endTime) - new Date(session.startTime)) / (1000 * 60 * 60);
            return total + duration;
          }
          return total;
        }, 0);

        let status = 'absent';
        const s = (log.attendanceStatus || log.status || '').toLowerCase();
        if (s === 'present' || log.clockInTime) {
          status = log.payableMinutes != null && log.payableMinutes < 240 ? 'half-day' : 'present';
        } else if (s.includes('half') || s === 'half-day') {
          status = 'half-day';
        } else if (s === 'late') {
          status = 'late';
        } else if (log.leaveInfo || s.includes('leave')) {
          status = 'leave';
        } else if (log.holidayInfo || s.includes('holiday')) {
          status = 'holiday';
        }

        return {
          date: log.attendanceDate,
          status,
          workingHours: Math.round(workingHours * 10) / 10,
          overtimeHours: workingHours > 9 ? Math.round((workingHours - 9) * 10) / 10 : 0,
          isHoliday: !!(log.holidayInfo),
          isLeave: !!(log.leaveInfo),
          leaveType: log.leaveInfo?.requestType || log.leaveInfo?.leaveType || null,
        };
      });

      // Fill in all days of the month (same as existing logic)
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      const allDaysData = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(selectedYear, selectedMonth - 1, day);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();
        const existingRecord = transformedAttendance.find(rec => rec.date === dateStr);

        if (existingRecord) {
          allDaysData.push(existingRecord);
        } else {
          allDaysData.push({
            date: dateStr,
            status: dayOfWeek === 0 ? 'holiday' : 'absent',
            workingHours: 0,
            overtimeHours: 0,
            isHoliday: dayOfWeek === 0,
            isLeave: false,
          });
        }
      }

      setAttendanceData(allDaysData);
      calculateSalaryBreakdown(allDaysData);
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setError('Failed to fetch attendance data. Showing estimated data.');
      generateMockAttendanceData();
    } finally {
      setLoading(false);
    }
  };

  const generateMockAttendanceData = () => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const mockData = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(selectedYear, selectedMonth - 1, day);
      const dayOfWeek = date.getDay();
      
      // Skip Sundays
      if (dayOfWeek === 0) continue;
      
      // Mock attendance status
      let status = 'present';
      if (Math.random() < 0.1) status = 'absent';
      else if (Math.random() < 0.05) status = 'half-day';
      else if (Math.random() < 0.15) status = 'late';
      
      mockData.push({
        date: date.toISOString().split('T')[0],
        status,
        workingHours: status === 'present' ? 8 : status === 'half-day' ? 4 : 0,
        overtimeHours: status === 'present' && Math.random() < 0.2 ? Math.floor(Math.random() * 3) : 0,
        isHoliday: false,
        isLeave: status === 'absent' && Math.random() < 0.5
      });
    }
    
    setCalendarLogs([]); // no raw logs available in mock mode
    setAttendanceData(mockData);
    calculateSalaryBreakdown(mockData);
  };

  const calculateSalaryBreakdown = (attendance) => {
    if (!employee || !settings) return;

    const dailySalary = employee.netPay / 30; // Assuming 30 working days
    const hourlyRate = dailySalary / 8;
    const overtimeRate = settings.overtimeRate || 0; // Use settings overtime rate or default to 0
    
    let totalPresentDays = 0;
    let totalHalfDays = 0;
    let totalAbsentDays = 0;
    let totalOvertimeHours = 0;
    let totalWorkingHours = 0;
    let totalSalary = 0;
    let totalDeductions = 0;

    const dayWiseBreakdown = attendance.map(day => {
      let daySalary = 0;
      let dayDeduction = 0;
      let statusColor = 'default';
      let statusIcon = null;

      switch (day.status) {
        case 'present':
          daySalary = dailySalary;
          totalPresentDays++;
          totalWorkingHours += day.workingHours;
          statusColor = 'success';
          statusIcon = <CheckCircle />;
          break;
        case 'half-day':
          daySalary = dailySalary / 2;
          dayDeduction = dailySalary / 2;
          totalHalfDays++;
          totalWorkingHours += day.workingHours;
          statusColor = 'warning';
          statusIcon = <Schedule />;
          break;
        case 'holiday':
          daySalary = 0;
          dayDeduction = 0; // No deduction for holidays
          statusColor = 'default';
          statusIcon = <Cancel />;
          break;
        case 'absent':
          daySalary = 0;
          dayDeduction = dailySalary;
          totalAbsentDays++;
          statusColor = 'error';
          statusIcon = <Cancel />;
          break;
        case 'late':
          daySalary = dailySalary * 0.9; // 10% deduction for late
          dayDeduction = dailySalary * 0.1;
          totalPresentDays++;
          totalWorkingHours += day.workingHours;
          statusColor = 'warning';
          statusIcon = <TrendingDown />;
          break;
      }

      // Add overtime
      if (day.overtimeHours > 0) {
        const overtimePay = day.overtimeHours * overtimeRate;
        daySalary += overtimePay;
        totalOvertimeHours += day.overtimeHours;
      }

      totalSalary += daySalary;
      totalDeductions += dayDeduction;

      return {
        ...day,
        daySalary: Math.round(daySalary),
        dayDeduction: Math.round(dayDeduction),
        statusColor,
        statusIcon
      };
    });

    setSalaryBreakdown({
      dayWiseBreakdown,
      summary: {
        totalPresentDays,
        totalHalfDays,
        totalAbsentDays,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        totalWorkingHours,
        totalSalary: Math.round(totalSalary),
        totalDeductions: Math.round(totalDeductions),
        netSalary: Math.round(totalSalary - totalDeductions)
      }
    });
  };

  const getStatusChip = (day) => {
    const statusConfig = {
      present: { label: 'Present', color: 'success', icon: <CheckCircle /> },
      'half-day': { label: 'Half Day', color: 'warning', icon: <Schedule /> },
      holiday: { label: 'Holiday', color: 'default', icon: <CalendarToday /> },
      absent: { label: 'Absent', color: 'error', icon: <Cancel /> },
      late: { label: 'Late', color: 'warning', icon: <TrendingDown /> }
    };

    const config = statusConfig[day.status] || statusConfig.absent;
    
    return (
      <Chip
        icon={config.icon}
        label={config.label}
        color={config.color}
        size="small"
        sx={{ minWidth: 100 }}
      />
    );
  };

  const formatCurrency = (amount) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const generatePayslip = async () => {
    if (!salaryBreakdown) return;
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginL = 14;
      const marginR = 14;
      const contentWidth = pageWidth - marginL - marginR;

      const periodLabel = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric',
      });
      const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

      // ── Colours ────────────────────────────────────────────────────────────
      const colorPrimary  = [44, 62, 80];   // #2C3E50 dark blue-grey
      const colorAccent   = [52, 73, 94];   // slightly lighter header
      const colorRed      = [192, 57, 43];  // deductions / net banner
      const colorGreen    = [39, 174, 96];
      const colorWhite    = [255, 255, 255];
      const colorLightBg  = [245, 246, 250];
      const colorLineSep  = [220, 220, 225];
      const colorTextDark = [30, 30, 40];
      const colorTextGray = [100, 100, 115];

      // ── Header banner ──────────────────────────────────────────────────────
      pdf.setFillColor(...colorPrimary);
      pdf.rect(0, 0, pageWidth, 36, 'F');

      pdf.setTextColor(...colorWhite);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('SALARY SLIP', pageWidth / 2, 14, { align: 'center' });

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Attendance Management System  •  Confidential', pageWidth / 2, 21, { align: 'center' });

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(periodLabel.toUpperCase(), pageWidth / 2, 30, { align: 'center' });

      // ── Employee info card ──────────────────────────────────────────────────
      let y = 44;
      pdf.setFillColor(...colorLightBg);
      pdf.roundedRect(marginL, y, contentWidth, 36, 3, 3, 'F');
      pdf.setDrawColor(...colorLineSep);
      pdf.roundedRect(marginL, y, contentWidth, 36, 3, 3, 'S');

      const col1x = marginL + 5;
      const col2x = marginL + contentWidth / 2 + 5;

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colorPrimary);
      pdf.text('EMPLOYEE DETAILS', col1x, y + 7);
      pdf.text('PAY PERIOD INFORMATION', col2x, y + 7);

      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...colorTextDark);
      pdf.setFontSize(9);

      const infoL = [
        ['Employee Name', employee.name || '—'],
        ['Department',    employee.department || '—'],
        ['Designation',   employee.designation || '—'],
      ];
      const infoR = [
        ['Pay Period',      periodLabel],
        ['Date of Issue',   today],
        ['Employee Email',  employee.email || '—'],
      ];
      infoL.forEach(([lbl, val], i) => {
        const iy = y + 14 + i * 7;
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...colorTextGray);
        pdf.text(lbl + ':', col1x, iy);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...colorTextDark);
        pdf.text(String(val), col1x + 32, iy);
      });
      infoR.forEach(([lbl, val], i) => {
        const iy = y + 14 + i * 7;
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...colorTextGray);
        pdf.text(lbl + ':', col2x, iy);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...colorTextDark);
        pdf.text(String(val), col2x + 30, iy);
      });

      y += 42;

      // ── Attendance summary bar ─────────────────────────────────────────────
      pdf.setFillColor(...colorPrimary);
      pdf.rect(marginL, y, contentWidth, 7, 'F');
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colorWhite);
      pdf.text('ATTENDANCE SUMMARY', col1x, y + 5);
      y += 7;

      pdf.setFillColor(...colorLightBg);
      pdf.rect(marginL, y, contentWidth, 18, 'F');
      pdf.setDrawColor(...colorLineSep);
      pdf.rect(marginL, y, contentWidth, 18, 'S');

      const attCols = [
        ['Working Days',  String(salaryBreakdown.summary.totalPresentDays + salaryBreakdown.summary.totalHalfDays)],
        ['Present Days',  String(salaryBreakdown.summary.totalPresentDays)],
        ['Half Days',     String(salaryBreakdown.summary.totalHalfDays)],
        ['Absent Days',   String(salaryBreakdown.summary.totalAbsentDays)],
        ['LOP Days',      String(salaryBreakdown.summary.totalAbsentDays)],
        ['Overtime Hrs',  String(salaryBreakdown.summary.totalOvertimeHours) + 'h'],
      ];
      const attColW = contentWidth / attCols.length;
      attCols.forEach(([lbl, val], i) => {
        const ax = marginL + i * attColW + attColW / 2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.setTextColor(...colorPrimary);
        pdf.text(val, ax, y + 8, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...colorTextGray);
        pdf.text(lbl, ax, y + 14, { align: 'center' });
      });
      y += 23;

      // ── Earnings & Deductions header ───────────────────────────────────────
      const halfW = (contentWidth - 4) / 2;

      // Earnings column header
      pdf.setFillColor(...colorGreen);
      pdf.rect(marginL, y, halfW, 7, 'F');
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colorWhite);
      pdf.text('EARNINGS', marginL + halfW / 2, y + 5, { align: 'center' });

      // Deductions column header
      pdf.setFillColor(...colorRed);
      pdf.rect(marginL + halfW + 4, y, halfW, 7, 'F');
      pdf.text('DEDUCTIONS', marginL + halfW + 4 + halfW / 2, y + 5, { align: 'center' });
      y += 7;

      // Table data
      const basic        = Math.round(employee.basic || (employee.ctc * (settings.basicPercentage || 40)) / 100 / 12);
      const hra          = Math.round(employee.hra   || (employee.ctc * (settings.hraPercentage || 20)) / 100 / 12);
      const allowances   = Math.round(employee.allowances || (employee.ctc * (settings.allowancesPercentage || 15)) / 100 / 12);
      const overtimePay  = Math.round((salaryBreakdown.summary.totalOvertimeHours || 0) * (settings.overtimeRate || 0));
      const grossSalary  = basic + hra + allowances + overtimePay;

      const pf           = Math.round(basic * (settings.pfPercentage || 12) / 100);
      const esi          = Math.round(grossSalary * (settings.esiPercentage || 0.75) / 100);
      const profTax      = settings.professionalTax || 200;
      const tds          = Math.round(grossSalary * (settings.tdsPercentage || 5) / 100);
      const lopDeduction = salaryBreakdown.summary.totalAbsentDays > 0
        ? Math.round((grossSalary / 26) * salaryBreakdown.summary.totalAbsentDays)
        : 0;
      const totalDeductions = pf + esi + profTax + tds + lopDeduction;
      const netPay          = grossSalary - totalDeductions;

      const earnRows = [
        ['Basic Salary',    basic],
        ['House Rent Allowance (HRA)', hra],
        ['Special Allowances', allowances],
        ['Overtime Pay',    overtimePay],
        ['Performance Bonus', 0],
        ['Other Earnings',   0],
      ];
      const deductRows = [
        ['Provident Fund (PF)',    pf],
        ['ESI',                    esi],
        ['Professional Tax',       profTax],
        ['Tax Deducted (TDS)',      tds],
        ['Loss of Pay (LOP)',       lopDeduction],
        ['Other Deductions',        0],
      ];

      const rowH = 7;
      const maxRows = Math.max(earnRows.length, deductRows.length);

      for (let i = 0; i < maxRows; i++) {
        const ry = y + i * rowH;
        // Alternate row background
        if (i % 2 === 0) {
          pdf.setFillColor(252, 252, 255);
          pdf.rect(marginL, ry, halfW, rowH, 'F');
          pdf.rect(marginL + halfW + 4, ry, halfW, rowH, 'F');
        }

        pdf.setFontSize(8.5);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...colorTextDark);

        if (earnRows[i]) {
          pdf.text(earnRows[i][0], marginL + 3, ry + 5);
          pdf.setFont('helvetica', 'bold');
          pdf.text(formatCurrency(earnRows[i][1]), marginL + halfW - 3, ry + 5, { align: 'right' });
        }
        if (deductRows[i]) {
          pdf.setFont('helvetica', 'normal');
          pdf.text(deductRows[i][0], marginL + halfW + 7, ry + 5);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colorRed);
          pdf.text(formatCurrency(deductRows[i][1]), marginL + halfW + 4 + halfW - 3, ry + 5, { align: 'right' });
          pdf.setTextColor(...colorTextDark);
        }
      }
      y += maxRows * rowH;

      // Totals row
      pdf.setFillColor(...colorLightBg);
      pdf.rect(marginL, y, halfW, 8, 'F');
      pdf.rect(marginL + halfW + 4, y, halfW, 8, 'F');
      pdf.setDrawColor(...colorLineSep);
      pdf.rect(marginL, y, halfW, 8, 'S');
      pdf.rect(marginL + halfW + 4, y, halfW, 8, 'S');

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colorGreen);
      pdf.text('Gross Earnings', marginL + 3, y + 5.5);
      pdf.text(formatCurrency(grossSalary), marginL + halfW - 3, y + 5.5, { align: 'right' });

      pdf.setTextColor(...colorRed);
      pdf.text('Total Deductions', marginL + halfW + 7, y + 5.5);
      pdf.text(formatCurrency(totalDeductions), marginL + halfW + 4 + halfW - 3, y + 5.5, { align: 'right' });
      y += 13;

      // ── Net pay banner ──────────────────────────────────────────────────────
      pdf.setFillColor(...colorPrimary);
      pdf.roundedRect(marginL, y, contentWidth, 14, 3, 3, 'F');
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...colorWhite);
      pdf.text('NET PAY (Take Home)', marginL + 6, y + 9);
      pdf.setFontSize(14);
      pdf.text(formatCurrency(netPay), marginL + contentWidth - 4, y + 9, { align: 'right' });
      y += 19;

      // ── CTC breakdown (compact, one row) ──────────────────────────────────
      pdf.setFillColor(...colorLightBg);
      pdf.rect(marginL, y, contentWidth, 12, 'F');
      pdf.setDrawColor(...colorLineSep);
      pdf.rect(marginL, y, contentWidth, 12, 'S');

      const ctcItems = [
        ['Annual CTC',    formatCurrency(employee.ctc || 0)],
        ['Monthly CTC',   formatCurrency(Math.round((employee.ctc || 0) / 12))],
        ['Gross Monthly', formatCurrency(grossSalary)],
        ['Monthly Net',   formatCurrency(netPay)],
      ];
      const ctcColW = contentWidth / ctcItems.length;
      ctcItems.forEach(([lbl, val], i) => {
        const cx = marginL + i * ctcColW + ctcColW / 2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...colorPrimary);
        pdf.text(val, cx, y + 5.5, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...colorTextGray);
        pdf.text(lbl, cx, y + 10, { align: 'center' });
      });
      y += 16;

      // ── Day-wise summary (compact table, top 10 entries) ──────────────────
      if (salaryBreakdown.dayWiseBreakdown && salaryBreakdown.dayWiseBreakdown.length > 0) {
        pdf.setFillColor(...colorAccent);
        pdf.rect(marginL, y, contentWidth, 7, 'F');
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...colorWhite);
        pdf.text('DAY-WISE ATTENDANCE & EARNINGS SUMMARY', marginL + 3, y + 5);
        y += 7;

        // Table header
        const cols = [
          { label: 'Date',      w: 28 },
          { label: 'Day',       w: 16 },
          { label: 'Status',    w: 28 },
          { label: 'Hrs',       w: 14 },
          { label: 'Earnings',  w: 30 },
          { label: 'Deduction', w: 30 },
          { label: 'Net',       w: 36 },
        ];
        let cx2 = marginL;
        pdf.setFillColor(230, 232, 238);
        pdf.rect(marginL, y, contentWidth, 6, 'F');
        cols.forEach(col => {
          pdf.setFontSize(7);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(...colorPrimary);
          pdf.text(col.label, cx2 + col.w / 2, y + 4.5, { align: 'center' });
          cx2 += col.w;
        });
        y += 6;

        const rows = salaryBreakdown.dayWiseBreakdown.slice(0, 20);
        rows.forEach((day, i) => {
          const ry = y + i * 6;
          if (ry > pageHeight - 30) return; // don't overflow page

          if (i % 2 === 0) {
            pdf.setFillColor(252, 252, 255);
            pdf.rect(marginL, ry, contentWidth, 6, 'F');
          }

          const dayDate  = new Date(day.date);
          const dayName  = dayDate.toLocaleDateString('en-IN', { weekday: 'short' });
          const dateDisp = dayDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

          const statusColors = {
            present:  [39, 174, 96],
            'half-day': [230, 81, 0],
            absent:   [192, 57, 43],
            holiday:  [142, 68, 173],
            leave:    [41, 128, 185],
            late:     [211, 84, 0],
          };
          const sc = statusColors[day.status] || colorTextGray;

          let cx3 = marginL;
          const cellData = [
            { val: dateDisp,                       w: 28, color: colorTextDark,  bold: false },
            { val: dayName,                         w: 16, color: colorTextGray,  bold: false },
            { val: (day.status || '').toUpperCase().slice(0,8), w: 28, color: sc, bold: true  },
            { val: day.workingHours + 'h',          w: 14, color: colorTextDark,  bold: false },
            { val: formatCurrency(day.daySalary),   w: 30, color: colorGreen,     bold: true  },
            { val: day.dayDeduction > 0 ? '-' + formatCurrency(day.dayDeduction) : '—', w: 30, color: colorRed, bold: false },
            { val: formatCurrency(day.daySalary - day.dayDeduction), w: 36, color: colorPrimary, bold: true },
          ];
          cellData.forEach(cell => {
            pdf.setFont('helvetica', cell.bold ? 'bold' : 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(...cell.color);
            pdf.text(cell.val, cx3 + cell.w / 2, ry + 4.2, { align: 'center' });
            cx3 += cell.w;
          });
        });
        y += rows.length * 6 + 4;
      }

      // ── Footer ─────────────────────────────────────────────────────────────
      const footerY = pageHeight - 14;
      pdf.setDrawColor(...colorLineSep);
      pdf.line(marginL, footerY - 2, marginL + contentWidth, footerY - 2);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(...colorTextGray);
      pdf.text(
        'This is a computer-generated salary slip. No signature required. For queries contact HR.',
        pageWidth / 2,
        footerY + 1,
        { align: 'center' }
      );
      pdf.text(`Generated on ${today}  •  Payroll Period: ${periodLabel}`, pageWidth / 2, footerY + 6, {
        align: 'center',
      });

      // ── Save ──────────────────────────────────────────────────────────────
      const safeName = (employee.name || 'Employee').replace(/\s+/g, '_');
      pdf.save(`Salary_Slip_${safeName}_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.pdf`);
    } catch (err) {
      console.error('Error generating payslip:', err);
      alert('Error generating payslip. Please try again.');
    }
  };

  if (!employee) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: '16px', 
          height: 'calc(100vh - 40px)',
          width: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 40px)',
          maxWidth: 'calc(100vw - 40px)',
          background: '#ffffff',
          margin: '20px',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)'
        }
      }}
    >
      <DialogTitle sx={{ 
        background: 'linear-gradient(135deg, #2C3E50 0%, #34495e 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '16px 16px 0px 0px'
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.2)', width: 56, height: 56 }}>
              <Person sx={{ fontSize: 32 }} />
            </Avatar>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, color: 'white' }}>
                {employee.name}
              </Typography>
              <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                {employee.department} • {employee.designation}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                {new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-IN', { 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </Typography>
            </Box>
          </Box>
          
          {/* Month and Year Selectors */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 150, bgcolor: 'white', borderRadius: '8px' }}>
              <InputLabel>Month</InputLabel>
              <Select
                value={selectedMonth}
                label="Month"
                onChange={(e) => setSelectedMonth(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                <MenuItem value={1}>January</MenuItem>
                <MenuItem value={2}>February</MenuItem>
                <MenuItem value={3}>March</MenuItem>
                <MenuItem value={4}>April</MenuItem>
                <MenuItem value={5}>May</MenuItem>
                <MenuItem value={6}>June</MenuItem>
                <MenuItem value={7}>July</MenuItem>
                <MenuItem value={8}>August</MenuItem>
                <MenuItem value={9}>September</MenuItem>
                <MenuItem value={10}>October</MenuItem>
                <MenuItem value={11}>November</MenuItem>
                <MenuItem value={12}>December</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl size="small" sx={{ minWidth: 120, bgcolor: 'white', borderRadius: '8px' }}>
              <InputLabel>Year</InputLabel>
              <Select
                value={selectedYear}
                label="Year"
                onChange={(e) => setSelectedYear(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                {Array.from({ length: 5 }, (_, i) => {
                  const year = new Date().getFullYear() - i;
                  return <MenuItem key={year} value={year}>{year}</MenuItem>;
                })}
              </Select>
            </FormControl>
          </Box>
          
          <IconButton onClick={onClose} size="large" sx={{ color: 'white' }}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <SkeletonBox width="60px" height="60px" borderRadius="50%" />
            <Typography variant="h6" sx={{ color: '#666' }}>Loading attendance data...</Typography>
            <LinearProgress sx={{ width: '200px', mt: 2, borderRadius: '4px' }} />
          </Box>
        ) : error ? (
          <Alert severity="warning" sx={{ m: 3, borderRadius: '12px' }}>
            {error}
          </Alert>
        ) : (
          <Box>
            {/* ── Tabs ── */}
            <Box sx={{ borderBottom: '1px solid #e9ecef', px: 3, pt: 2 }}>
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                sx={{
                  '& .MuiTab-root': { fontWeight: 600, textTransform: 'none', fontSize: '0.95rem' },
                  '& .Mui-selected': { color: '#2C3E50 !important' },
                  '& .MuiTabs-indicator': { backgroundColor: '#2C3E50', height: 3, borderRadius: 2 },
                }}
              >
                <Tab label="📅 Attendance Calendar" />
                <Tab label="📊 Day-wise Salary Breakdown" />
              </Tabs>
            </Box>

            {/* ── Tab 0: Attendance Calendar ─────────────────────────────────── */}
            {activeTab === 0 && (
              <Box sx={{ p: 3 }}>
                {/* Summary cards */}
                {salaryBreakdown && (
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    {[
                      { label: 'Present Days', value: salaryBreakdown.summary.totalPresentDays, icon: '✅', bg: '#e8f5e8', color: '#2e7d32' },
                      { label: 'Half Days',    value: salaryBreakdown.summary.totalHalfDays,    icon: '⏱️', bg: '#fff3e0', color: '#ef6c00' },
                      { label: 'Absent Days',  value: salaryBreakdown.summary.totalAbsentDays,  icon: '❌', bg: '#ffebee', color: '#c62828' },
                      { label: 'Overtime Hrs', value: salaryBreakdown.summary.totalOvertimeHours + 'h', icon: '🕐', bg: '#e3f2fd', color: '#1565c0' },
                    ].map(({ label, value, icon, bg, color }) => (
                      <Grid item xs={6} sm={3} key={label}>
                        <Card sx={{ background: bg, border: `1px solid ${color}33`, borderRadius: '12px', boxShadow: 'none' }}>
                          <CardContent sx={{ textAlign: 'center', py: '12px !important', px: 1 }}>
                            <Typography sx={{ fontSize: '1.5rem' }}>{icon}</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700, color }}>{value}</Typography>
                            <Typography variant="caption" sx={{ color, opacity: 0.85 }}>{label}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                )}

                {/* Calendar — same component used in AdminAttendanceSummaryPage */}
                <Box sx={{ '& .attendance-calendar-container': { margin: 0, boxShadow: 'none', border: '1px solid #e9ecef' } }}>
                  <AttendanceCalendar
                    logs={calendarLogs}
                    currentDate={parseISTDate(`${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`)}
                    onDayClick={() => {}}
                  />
                </Box>

                {/* Legend */}
                <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                  {[
                    { label: 'Present',  bg: '#d4edda', border: '#c3e6cb',  text: '#155724' },
                    { label: 'Absent',   bg: '#f8d7da', border: '#f5c6cb',  text: '#721c24' },
                    { label: 'Half Day', bg: '#ffe0b2', border: '#ff9800',  text: '#e65100' },
                    { label: 'Holiday',  bg: '#e1bee7', border: '#ce93d8',  text: '#4a148c' },
                    { label: 'Leave',    bg: '#bbdefb', border: '#90caf9',  text: '#0d47a1' },
                    { label: 'Weekend',  bg: '#fff3cd', border: '#ffeaa7',  text: '#856404' },
                    { label: 'Week Off', bg: '#fff8e1', border: '#ffd54f',  text: '#b8860b' },
                  ].map(({ label, bg, border, text }) => (
                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 14, height: 14, borderRadius: '3px', background: bg, border: `1px solid ${border}` }} />
                      <Typography variant="caption" sx={{ color: text, fontWeight: 600 }}>{label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* ── Tab 1: Day-wise Salary Breakdown ──────────────────────────── */}
            {activeTab === 1 && (
              <Box>
                {/* Summary Cards */}
                {salaryBreakdown && (
                  <Box sx={{ p: 3, background: '#ffffff' }}>
                    <Grid container spacing={3}>
                      {[
                        { label: 'Present Days', value: salaryBreakdown.summary.totalPresentDays, bg: 'linear-gradient(135deg,#e8f5e8,#f1f8e9)', color: '#2e7d32', border: '#c8e6c9', icon: <CheckCircle sx={{ fontSize: 40, mb: 1 }} /> },
                        { label: 'Half Days',    value: salaryBreakdown.summary.totalHalfDays,    bg: 'linear-gradient(135deg,#fff3e0,#fff8e1)', color: '#ef6c00', border: '#ffcc80', icon: <Schedule    sx={{ fontSize: 40, mb: 1 }} /> },
                        { label: 'Absent Days',  value: salaryBreakdown.summary.totalAbsentDays,  bg: 'linear-gradient(135deg,#ffebee,#fce4ec)', color: '#c62828', border: '#ffcdd2', icon: <Cancel      sx={{ fontSize: 40, mb: 1 }} /> },
                        { label: 'Overtime Hrs', value: salaryBreakdown.summary.totalOvertimeHours + 'h', bg: 'linear-gradient(135deg,#e3f2fd,#f3e5f5)', color: '#1565c0', border: '#bbdefb', icon: <AccessTime sx={{ fontSize: 40, mb: 1 }} /> },
                      ].map(({ label, value, bg, color, border, icon }) => (
                        <Grid item xs={12} sm={6} md={3} key={label}>
                          <Card sx={{ background: bg, color, borderRadius: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', border: `1px solid ${border}`, transition: 'transform 0.3s ease', '&:hover': { transform: 'translateY(-2px)' } }}>
                            <CardContent sx={{ textAlign: 'center', p: 3 }}>
                              {icon}
                              <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>{value}</Typography>
                              <Typography variant="body1" sx={{ opacity: 0.9 }}>{label}</Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}

                {/* Day-wise table */}
                <Box sx={{ px: 3 }}>
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, color: '#2C3E50' }}>Day-wise Salary Breakdown</Typography>

                  <Paper sx={{ p: 2, mb: 2, background: 'linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%)', border: '1px solid #e9ecef', borderRadius: '12px' }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={1}><Typography variant="body2" sx={{ fontWeight: 700 }}>Sr No</Typography></Grid>
                      <Grid item xs={2}><Typography variant="body2" sx={{ fontWeight: 700 }}>Date</Typography></Grid>
                      <Grid item xs={2}><Typography variant="body2" sx={{ fontWeight: 700 }}>Status</Typography></Grid>
                      <Grid item xs={2}><Typography variant="body2" sx={{ fontWeight: 700 }}>Hours</Typography></Grid>
                      <Grid item xs={2}><Typography variant="body2" sx={{ fontWeight: 700 }}>Amount</Typography></Grid>
                      <Grid item xs={2}><Typography variant="body2" sx={{ fontWeight: 700 }}>Deduction Reason</Typography></Grid>
                      <Grid item xs={1}><Typography variant="body2" sx={{ fontWeight: 700 }}>Net</Typography></Grid>
                    </Grid>
                  </Paper>

                  <Box sx={{ maxHeight: '500px', overflowY: 'auto', borderRadius: '12px', border: '1px solid #e9ecef' }}>
                    {salaryBreakdown?.dayWiseBreakdown.map((day, index) => (
                      <Paper
                        key={index}
                        sx={{
                          p: 2, mb: 1, mx: 1, mt: index === 0 ? 1 : 0,
                          border: '1px solid #e9ecef', borderRadius: '12px',
                          background: day.status === 'present' ? 'linear-gradient(135deg, #f8fff8 0%, #ffffff 100%)' :
                                      day.status === 'absent'  ? 'linear-gradient(135deg, #ffebee 0%, #ffffff 100%)' :
                                      day.status === 'holiday' ? 'linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)' :
                                      'linear-gradient(135deg, #fff3e0 0%, #ffffff 100%)',
                          borderLeft: `4px solid ${day.status === 'present' ? '#4caf50' : day.status === 'absent' ? '#f44336' : day.status === 'holiday' ? '#9e9e9e' : '#ff9800'}`,
                          transition: 'all 0.3s ease',
                          '&:hover': { transform: 'translateX(2px)', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
                        }}
                      >
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={1}><Typography variant="body2" sx={{ fontWeight: 600, color: '#666' }}>{index + 1}</Typography></Grid>
                          <Grid item xs={2}><Typography variant="body2" sx={{ fontWeight: 600, color: '#333' }}>{formatDate(day.date)}</Typography></Grid>
                          <Grid item xs={2}>{getStatusChip(day)}</Grid>
                          <Grid item xs={2}>
                            <Typography variant="body2" color="text.secondary">{day.workingHours}h</Typography>
                            {day.overtimeHours > 0 && <Typography variant="body2" sx={{ color: '#2196f3' }}>+{day.overtimeHours}h OT</Typography>}
                          </Grid>
                          <Grid item xs={2}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: day.daySalary > 0 ? '#4caf50' : '#f44336' }}>
                              {day.daySalary > 0 ? '+' : ''}{formatCurrency(day.daySalary)}
                            </Typography>
                          </Grid>
                          <Grid item xs={2}>
                            <Typography variant="body2" sx={{ color: '#666' }}>
                              {day.dayDeduction > 0 ? (day.status === 'absent' ? 'Absent' : day.status === 'half-day' ? 'Half Day' : day.status === 'late' ? 'Late Arrival' : day.status === 'holiday' ? 'Holiday' : 'Leave') : '-'}
                            </Typography>
                          </Grid>
                          <Grid item xs={1}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: day.daySalary > day.dayDeduction ? '#4caf50' : '#f44336' }}>
                              {formatCurrency(day.daySalary - day.dayDeduction)}
                            </Typography>
                          </Grid>
                        </Grid>
                      </Paper>
                    ))}
                  </Box>
                </Box>

                {/* Total Summary */}
                {salaryBreakdown && (
                  <Box sx={{ background: 'linear-gradient(135deg, #2C3E50 0%, #34495e 100%)', color: 'white', p: 4, borderRadius: '12px', margin: '24px' }}>
                    <Grid container spacing={3} alignItems="center">
                      <Grid item xs={12} md={6}>
                        <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>📊 Monthly Summary</Typography>
                        <Typography variant="body1" sx={{ opacity: 0.9, lineHeight: 1.6 }}>
                          <strong>Working Days:</strong> {salaryBreakdown.summary.totalPresentDays + salaryBreakdown.summary.totalHalfDays} |{' '}
                          <strong>Absent Days:</strong> {salaryBreakdown.summary.totalAbsentDays} |{' '}
                          <strong>Overtime:</strong> {salaryBreakdown.summary.totalOvertimeHours}h
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                            {formatCurrency(salaryBreakdown.summary.netSalary)}
                          </Typography>
                          <Typography variant="body1" sx={{ opacity: 0.9 }}>
                            Net Salary for {new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3, background: '#ffffff', borderTop: '1px solid #e9ecef', borderRadius: '0px 0px 16px 16px' }}>
        <Button 
          onClick={onClose} 
          variant="outlined"
          sx={{ 
            borderRadius: '12px',
            px: 3,
            py: 1,
            borderColor: '#2C3E50',
            color: '#2C3E50',
            '&:hover': {
              borderColor: '#34495e',
              backgroundColor: 'rgba(44, 62, 80, 0.04)'
            }
          }}
        >
          Close
        </Button>
        <Button 
          onClick={generatePayslip}
          variant="contained"
          sx={{ 
            borderRadius: '12px',
            px: 3,
            py: 1,
            background: 'linear-gradient(135deg, #2C3E50 0%, #34495e 100%)',
            boxShadow: '0 4px 16px rgba(44, 62, 80, 0.3)',
            '&:hover': {
              background: 'linear-gradient(135deg, #34495e 0%, #2C3E50 100%)',
              boxShadow: '0 6px 20px rgba(44, 62, 80, 0.4)'
            }
          }}
        >
          📄 Generate Payslip
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EmployeeSalaryDetail;