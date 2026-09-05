// frontend/src/components/ProbationTracker.jsx

import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Alert,
  Tooltip,
  IconButton,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Stack,
  OutlinedInput,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider
} from '@mui/material';
import {
  Refresh,
  Info,
  Search,
  Visibility,
  People,
  HourglassEmpty,
  Clear,
  EventNote,
  PersonOff,
  Close
} from '@mui/icons-material';
import axios from '../api/axios';
import PageHeroHeader from './PageHeroHeader';
import { SkeletonBox } from './SkeletonLoaders';
import '../styles/ProbationTracker.css';

const ProbationMonthBreakdown = ({
  monthSummary,
  variant,
  formatDateIST,
  formatDayLabel,
  emptyMessage
}) => {
  if (!monthSummary?.length) {
    return (
      <Box className="probation-period-empty">
        <Typography component="p">{emptyMessage}</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1.5} className={`probation-month-list probation-${variant}-months`}>
      {monthSummary.map((monthRow) => (
        <Box key={monthRow.month} className={`probation-month-card probation-${variant}-month-card`}>
          <Box className="probation-month-card-header">
            <Typography component="h4" className="probation-month-title">
              {monthRow.monthLabel}
            </Typography>
            <Box className="probation-month-stats" role="list" aria-label={`${monthRow.monthLabel} summary`}>
              {monthRow.fullDays > 0 && (
                <span className={`probation-${variant}-stat full`}>{monthRow.fullDays} full</span>
              )}
              {monthRow.halfDays > 0 && (
                <span className={`probation-${variant}-stat half`}>{monthRow.halfDays} half</span>
              )}
              <span className={`probation-${variant}-stat total`}>
                {monthRow.totalExtensionDays?.toFixed(1)} ext. days
              </span>
            </Box>
          </Box>
          <Box className="probation-month-card-body">
            <Typography className="probation-dates-label">Dates</Typography>
            <Box className={`probation-month-dates probation-${variant}-dates`}>
              {(monthRow.dates || []).map((dayEntry) => (
                <Tooltip
                  key={`${monthRow.month}-${dayEntry.date}-${dayEntry.type}-${dayEntry.category || ''}`}
                  title={`Extends probation by ${dayEntry.extensionDays} day${dayEntry.extensionDays === 1 ? '' : 's'}`}
                >
                  <Box component="span" className={`probation-date-chip probation-${variant}-date-chip ${dayEntry.type}`}>
                    <span className="probation-date-text">{formatDateIST(dayEntry.date)}</span>
                    <span className="probation-date-type">{formatDayLabel(dayEntry)}</span>
                  </Box>
                </Tooltip>
              ))}
            </Box>
          </Box>
        </Box>
      ))}
    </Stack>
  );
};

const ProbationPeriodBreakdown = ({
  emp,
  formatDateIST,
  formatMonthLabel,
  formatLeaveTypeLabel,
  formatAbsentDayLabel
}) => {
  if (!emp) return null;

  const periodSummary = emp.periodSummary || {};
  const periodLeaveTotal = periodSummary.leaveExtensionDays ?? (emp.leaveDetails || []).reduce(
    (sum, d) => sum + (d.extensionDays || 0),
    0
  );
  const periodAbsentTotal = periodSummary.absentExtensionDays ?? (emp.absentDetails || []).reduce(
    (sum, d) => sum + (d.extensionDays || 0),
    0
  );
  const periodCombinedTotal = periodSummary.totalExtensionDays ?? (periodLeaveTotal + periodAbsentTotal);
  const hasActivityOutsideProbationWindow =
    Math.abs(periodLeaveTotal - (emp.leaveExtensionDays || 0)) > 0.05
    || Math.abs(periodAbsentTotal - (emp.absentExtensionDays || 0)) > 0.05;

  const enrichMonthSummary = (monthSummary) =>
    (monthSummary || []).map((row) => ({
      ...row,
      monthLabel: formatMonthLabel(row.month)
    }));

  const baseProbationEnd = emp.probationPeriodEnd || emp.baseProbationEndDate;
  const finalProbationEnd = emp.finalProbationEndDate;
  const finalEndDiffersFromBase =
    finalProbationEnd && baseProbationEnd && finalProbationEnd !== baseProbationEnd;

  return (
    <Box className="probation-breakdown-content">
      {/* Level 1 — Period context */}
      <Box className="probation-breakdown-period-bar">
        <Box className="probation-breakdown-period-split">
          <Box className="probation-breakdown-period-part base">
            <Typography className="probation-breakdown-period-part-label">Probation window</Typography>
            <Typography className="probation-breakdown-period-range">
              {formatDateIST(emp.joiningDate)}
              <span className="probation-breakdown-period-sep">→</span>
              {formatDateIST(baseProbationEnd)}
            </Typography>
            <Typography className="probation-breakdown-period-part-hint">6-month base period</Typography>
          </Box>
          <Box className="probation-breakdown-period-divider" aria-hidden="true" />
          <Box className="probation-breakdown-period-part final">
            <Typography className="probation-breakdown-period-part-label">Final end date</Typography>
            <Typography
              className={`probation-breakdown-final-end ${finalEndDiffersFromBase ? 'extended' : ''}`}
            >
              {formatDateIST(finalProbationEnd || baseProbationEnd)}
            </Typography>
          </Box>
        </Box>
        <Typography className="probation-breakdown-period-note">
          {finalEndDiffersFromBase
            ? 'Includes leave and absence extensions shown below'
            : '6-month base period · no extensions applied yet'}
        </Typography>
      </Box>

      {/* Level 2 — KPI summary */}
      <Box className="probation-breakdown-kpi-section">
        <Typography className="probation-breakdown-section-eyebrow">Extension summary</Typography>
        <Grid container spacing={2} className="probation-period-summary-grid">
          <Grid item xs={12} sm={4}>
            <Box className="probation-summary-card leave">
              <Typography className="probation-summary-label">Leave extension</Typography>
              <Typography className="probation-summary-value">
                {periodLeaveTotal.toFixed(1)}
                <span className="probation-summary-unit">days</span>
              </Typography>
              <Typography className="probation-summary-meta">
                {periodSummary.fullDayLeaves ?? emp.fullDayLeaves ?? 0} full · {periodSummary.halfDayLeaves ?? emp.halfDayLeaves ?? 0} half · {periodSummary.leaveInstanceCount ?? (emp.leaveDetails || []).length} instances
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box className="probation-summary-card absent">
              <Typography className="probation-summary-label">Absent extension</Typography>
              <Typography className="probation-summary-value">
                {periodAbsentTotal.toFixed(1)}
                <span className="probation-summary-unit">days</span>
              </Typography>
              <Typography className="probation-summary-meta">
                {periodSummary.fullDayAbsents ?? emp.fullDayAbsents ?? 0} full · {periodSummary.halfDayAbsents ?? emp.halfDayAbsents ?? 0} half · {periodSummary.absentInstanceCount ?? (emp.absentDetails || []).length} instances
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box className="probation-summary-card combined">
              <Typography className="probation-summary-label">Combined total</Typography>
              <Typography className="probation-summary-value">
                {periodCombinedTotal.toFixed(1)}
                <span className="probation-summary-unit">days</span>
              </Typography>
              <Typography className="probation-summary-meta">
                Leaves {periodLeaveTotal.toFixed(1)} + absents {periodAbsentTotal.toFixed(1)}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Box>

      <Divider className="probation-breakdown-divider" />

      {/* Level 3 — Leaves & absences side by side */}
      <Box className="probation-breakdown-detail-row">
        <Box className="probation-breakdown-detail-panel leave">
          <Box className="probation-breakdown-panel-header">
            <Box className="probation-breakdown-panel-title-group">
              <EventNote className="probation-breakdown-panel-icon" aria-hidden />
              <Box>
                <Typography component="h3" className="probation-breakdown-panel-title">Leaves</Typography>
                <Typography className="probation-breakdown-panel-subtitle">Approved leave days</Typography>
              </Box>
            </Box>
            <Typography className="probation-section-badge leave">
              {(emp.leaveMonthSummary || []).length} mo · {(emp.leaveDetails || []).length} days
            </Typography>
          </Box>
          <Box className="probation-breakdown-panel-body">
            <ProbationMonthBreakdown
              monthSummary={enrichMonthSummary(emp.leaveMonthSummary)}
              variant="leave"
              formatDateIST={formatDateIST}
              formatDayLabel={(day) => formatLeaveTypeLabel(day.type)}
              emptyMessage="No approved leaves in probation window."
            />
          </Box>
        </Box>

        <Box className="probation-breakdown-detail-panel absent">
          <Box className="probation-breakdown-panel-header">
            <Box className="probation-breakdown-panel-title-group">
              <PersonOff className="probation-breakdown-panel-icon" aria-hidden />
              <Box>
                <Typography component="h3" className="probation-breakdown-panel-title">Absences</Typography>
                <Typography className="probation-breakdown-panel-subtitle">Absent & half-days</Typography>
              </Box>
            </Box>
            <Typography className="probation-section-badge absent">
              {(emp.absentMonthSummary || []).length} mo · {(emp.absentDetails || []).length} days
            </Typography>
          </Box>
          <Box className="probation-breakdown-panel-body">
            <ProbationMonthBreakdown
              monthSummary={enrichMonthSummary(emp.absentMonthSummary)}
              variant="absent"
              formatDateIST={formatDateIST}
              formatDayLabel={formatAbsentDayLabel}
              emptyMessage="No absences in probation window."
            />
          </Box>
        </Box>
      </Box>

      {hasActivityOutsideProbationWindow && (
        <Box className="probation-breakdown-alert">
          <Info fontSize="small" aria-hidden />
          <Typography>
            Table totals may include activity after the 6-month window. This breakdown covers only joining through the base probation end date.
          </Typography>
        </Box>
      )}

      {/* Level 4 — Policy footnote */}
      <Box className="probation-breakdown-footnote">
        <Typography className="probation-breakdown-footnote-title">Calculation notes</Typography>
        <Typography>Probation end date = Joining date + 6 months + leave extensions + absence extensions</Typography>
        <Typography>
          Exclusions: {emp.holidaysExcluded || 0} holidays, {emp.weeklyOffsExcluded || 0} weekly offs (Sundays + Saturday policy: {emp.saturdayPolicy || 'N/A'})
        </Typography>
        <Typography>
          Present days: {emp.presentDays || 0} · Policy: Before Jan 30, 2025 (≥8 hrs = full day), After Jan 30, 2025 (≥9 hrs = full day)
        </Typography>
      </Box>
    </Box>
  );
};

const ProbationTracker = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [breakdownEmployee, setBreakdownEmployee] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    fetchProbationData();
  }, []);

  const fetchProbationData = async () => {
    setLoading(true);
    setError(null);
    setBreakdownEmployee(null);
    
    try {
      const response = await axios.get('/probation/tracker');
      setEmployees(response.data.employees || []);
    } catch (err) {
      console.error('Error fetching probation tracker data:', err);
      setError(err.response?.data?.error || 'Failed to fetch probation tracker data');
    } finally {
      setLoading(false);
    }
  };

  // Filter employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Search filter
      const matchesSearch = !searchQuery || 
        emp.employeeName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employeeCode?.toLowerCase().includes(searchQuery.toLowerCase());

      // Department filter (if available in response)
      const matchesDepartment = !selectedDepartment || !emp.department || emp.department === selectedDepartment;

      // Status filter
      let matchesStatus = true;
      if (selectedStatus === 'on-track') {
        matchesStatus = emp.daysLeft >= 0 && emp.daysLeft > 7;
      } else if (selectedStatus === 'extended') {
        matchesStatus = (emp.leaveExtensionDays > 0 || emp.absentExtensionDays > 0);
      } else if (selectedStatus === 'overdue') {
        matchesStatus = emp.daysLeft < 0;
      } else if (selectedStatus === 'ending-soon') {
        matchesStatus = emp.daysLeft >= 0 && emp.daysLeft <= 7;
      }

      return matchesSearch && matchesDepartment && matchesStatus;
    });
  }, [employees, searchQuery, selectedDepartment, selectedStatus]);

  // Paginated employees
  const paginatedEmployees = useMemo(() => {
    const startIndex = page * rowsPerPage;
    return filteredEmployees.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredEmployees, page, rowsPerPage]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, selectedDepartment, selectedStatus]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const formatMonthLabel = (monthKey) => {
    if (!monthKey || typeof monthKey !== 'string') return 'Unknown';
    try {
      const [year, month] = monthKey.split('-').map(Number);
      const date = new Date(year, month - 1, 1);
      return date.toLocaleDateString('en-IN', {
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
      });
    } catch {
      return monthKey;
    }
  };

  const formatLeaveTypeLabel = (type) => (type === 'half' ? 'Half Day' : 'Full Day');

  const formatAbsentDayLabel = (dayEntry) => {
    if (dayEntry?.category === 'half-day') return 'Half Day';
    return dayEntry?.type === 'half' ? 'Half Absent' : 'Full Absent';
  };

  // Format date to IST display (DD MMM YYYY)
  const formatDateIST = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr + 'T00:00:00+05:30');
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata'
      });
    } catch (err) {
      return dateStr;
    }
  };

  const openBreakdownModal = (emp) => {
    setBreakdownEmployee(emp);
  };

  const closeBreakdownModal = () => {
    setBreakdownEmployee(null);
  };

  // Action area for header
  const actionArea = useMemo(() => (
    <Stack
      direction="row"
      spacing={1.5}
      flexWrap="wrap"
      alignItems="center"
      className="header-actions"
    >
      <OutlinedInput
        size="small"
        placeholder="Search by name or ID..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        startAdornment={
          <InputAdornment position="start">
            <Search sx={{ color: '#6c757d', fontSize: '1.2rem' }} />
          </InputAdornment>
        }
        endAdornment={
          searchQuery && (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={() => setSearchQuery('')}
                edge="end"
                sx={{ padding: '4px' }}
              >
                <Clear sx={{ fontSize: '1rem' }} />
              </IconButton>
            </InputAdornment>
          )
        }
        sx={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          minWidth: '280px',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#dee2e6',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#adb5bd',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#D32F2F',
            borderWidth: '2px',
          },
          '& input': {
            padding: '8px 8px 8px 0',
            fontSize: '0.9rem',
          }
        }}
      />
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <InputLabel sx={{ color: '#6B7280' }}>Status</InputLabel>
        <Select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          label="Status"
          sx={{
            backgroundColor: 'white',
            borderRadius: '8px',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: '#dee2e6',
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: '#adb5bd',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#D32F2F',
              borderWidth: '2px',
            }
          }}
        >
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="on-track">On Track</MenuItem>
          <MenuItem value="ending-soon">Ending Soon (≤7 days)</MenuItem>
          <MenuItem value="extended">Extended</MenuItem>
          <MenuItem value="overdue">Overdue</MenuItem>
        </Select>
      </FormControl>
      <IconButton 
        onClick={fetchProbationData} 
        size="medium"
        sx={{ 
          backgroundColor: 'white',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          padding: '8px',
          '&:hover': { 
            backgroundColor: '#f8f9fa',
            borderColor: '#adb5bd',
          }
        }}
        aria-label="Refresh probation data"
      >
        <Refresh sx={{ fontSize: '1.2rem', color: '#495057' }} />
      </IconButton>
    </Stack>
  ), [searchQuery, selectedStatus]);

  // Loading skeleton
  if (loading) {
    return (
      <Box className="probation-tracker">
        <PageHeroHeader
          eyebrow="Employee Management"
          title={<SkeletonBox width="200px" height="32px" />}
          description={<SkeletonBox width="400px" height="20px" />}
          icon={<HourglassEmpty />}
          actionArea={
            <Stack direction="row" spacing={1.5} alignItems="center">
              <SkeletonBox width="280px" height="40px" borderRadius="8px" />
              <SkeletonBox width="180px" height="40px" borderRadius="8px" />
              <SkeletonBox width="40px" height="40px" borderRadius="8px" />
            </Stack>
          }
        />

        {/* Table Skeleton */}
        <Box sx={{ mb: 3 }}>
          <Card sx={{ borderRadius: '8px', backgroundColor: 'white', border: '1px solid #E5E7EB' }}>
            <CardContent sx={{ p: 0 }}>
              <Skeleton variant="rectangular" height={56} sx={{ mb: 2, borderRadius: 1 }} />
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} variant="rectangular" height={52} sx={{ mb: 1, borderRadius: 1 }} />
              ))}
            </CardContent>
          </Card>
        </Box>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <PageHeroHeader
          eyebrow="Employee Management"
          title="Probation Tracker"
          description="Monitor probation progress, extensions, and completion status"
          icon={<HourglassEmpty />}
        />
        <Alert 
          severity="error" 
          action={
            <IconButton 
              color="inherit" 
              size="small" 
              onClick={fetchProbationData}
              aria-label="retry"
            >
              <Refresh />
            </IconButton>
          }
          sx={{ mb: 3 }}
        >
          {error}
        </Alert>
      </>
    );
  }

  return (
    <Box className="probation-tracker">
      <PageHeroHeader
        eyebrow="Employee Management"
        title="Probation Tracker"
        description="Monitor probation progress, extensions, and completion status"
        icon={<HourglassEmpty />}
        actionArea={actionArea}
      />

      {/* Empty State */}
      {filteredEmployees.length === 0 && !loading && (
        <Box sx={{ mb: 3 }}>
          <Card sx={{ borderRadius: '8px', backgroundColor: 'white', border: '1px solid #E5E7EB' }}>
            <CardContent sx={{ textAlign: 'center', py: 8 }}>
              <People sx={{ fontSize: 64, color: '#9CA3AF', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#6B7280', mb: 1 }}>
                {employees.length === 0
                  ? 'No employees currently on probation'
                  : 'No employees found for the selected filters'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#9CA3AF' }}>
                Try adjusting your search or filter criteria
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Table */}
      {filteredEmployees.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Card sx={{ borderRadius: '8px', backgroundColor: 'white', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
            <TableContainer 
              component={Paper} 
              elevation={0}
              sx={{ 
                borderRadius: '8px',
                overflow: 'auto',
                '&::-webkit-scrollbar': {
                  width: '6px',
                  height: '6px'
                },
                '&::-webkit-scrollbar-track': {
                  background: '#F3F4F6',
                  borderRadius: '3px'
                },
                '&::-webkit-scrollbar-thumb': {
                  background: '#D1D5DB',
                  borderRadius: '3px',
                  '&:hover': {
                    background: '#9CA3AF'
                  }
                }
              }}
            >
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#F9FAFB' }}>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      minWidth: 200, 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Employee
                    </TableCell>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      minWidth: 120, 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Joining Date
                    </TableCell>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      minWidth: 140, 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Base End Date
                    </TableCell>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      minWidth: 140, 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Final End Date
                    </TableCell>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      minWidth: 130, 
                      textAlign: 'center', 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Days Left
                    </TableCell>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      minWidth: 120, 
                      textAlign: 'center', 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Leave Ext.
                    </TableCell>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      minWidth: 120, 
                      textAlign: 'center', 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Absent Ext.
                    </TableCell>
                    <TableCell sx={{ 
                      color: '#374151', 
                      fontWeight: 600, 
                      width: 50, 
                      borderBottom: '1px solid #E5E7EB',
                      backgroundColor: '#F9FAFB',
                      fontSize: '0.875rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      <Tooltip title="View probation breakdown">
                        <Info fontSize="small" />
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                </TableHead>
              <TableBody>
                {paginatedEmployees.map((emp, index) => {
                const hasExtensions = (emp.leaveExtensionDays > 0 || emp.absentExtensionDays > 0);
                
                return (
                    <TableRow
                      key={emp.employeeId}
                      sx={{
                        '&:hover': { backgroundColor: '#F9FAFB' },
                        backgroundColor: emp.daysLeft < 0 ? '#FEF2F2' : index % 2 === 0 ? 'white' : '#FAFAFA',
                        borderLeft: emp.daysLeft < 0 ? '3px solid #EF4444' : '3px solid transparent',
                        transition: 'all 0.2s ease',
                        borderBottom: '1px solid #F3F4F6'
                      }}
                    >
                      {/* Employee Info */}
                      <TableCell sx={{ py: 1 }}>
                        <Box display="flex" alignItems="center" gap={1.5}>
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              backgroundColor: '#F3F4F6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#6B7280',
                              fontWeight: 600,
                              fontSize: '0.875rem'
                            }}
                          >
                            {emp.employeeName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </Box>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                              {emp.employeeName}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280' }}>
                              {emp.employeeCode}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      {/* Dates */}
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ color: '#374151' }}>
                          {formatDateIST(emp.joiningDate)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography variant="body2" sx={{ color: '#374151' }}>
                          {formatDateIST(emp.baseProbationEndDate)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ py: 1 }}>
                        <Typography 
                          variant="body2" 
                          sx={{ 
                            fontWeight: hasExtensions ? 600 : 'normal',
                            color: hasExtensions ? '#DC2626' : '#374151'
                          }}
                        >
                          {formatDateIST(emp.finalProbationEndDate)}
                        </Typography>
                      </TableCell>

                      {/* Days Left */}
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            px: 2,
                            py: 1,
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: 
                              emp.daysLeft < 0 ? '#FEE2E2' :
                              emp.daysLeft <= 30 ? '#FEF3C7' :
                              emp.daysLeft <= 60 ? '#DBEAFE' :
                              '#D1FAE5',
                            color: 
                              emp.daysLeft < 0 ? '#DC2626' :
                              emp.daysLeft <= 30 ? '#D97706' :
                              emp.daysLeft <= 60 ? '#2563EB' :
                              '#059669'
                          }}
                        >
                          {emp.daysLeft < 0 
                            ? `${Math.abs(emp.daysLeft)} overdue`
                            : `${emp.daysLeft} days`
                          }
                        </Box>
                      </TableCell>

                      {/* Extensions */}
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Tooltip title="Leave extension days">
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                              {emp.leaveExtensionDays?.toFixed(1) || '0.0'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280' }}>
                              days
                            </Typography>
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Tooltip title="Absent extension days">
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1F2937' }}>
                              {emp.absentExtensionDays?.toFixed(1) || '0.0'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280' }}>
                              days
                            </Typography>
                          </Box>
                        </Tooltip>
                      </TableCell>

                      {/* View breakdown */}
                      <TableCell align="center" sx={{ py: 1 }}>
                        <Tooltip title="View probation breakdown">
                          <IconButton
                            size="small"
                            onClick={() => openBreakdownModal(emp)}
                            aria-label={`View probation breakdown for ${emp.employeeName}`}
                            sx={{
                              color: '#6B7280',
                              '&:hover': { backgroundColor: '#F3F4F6', color: '#374151' }
                            }}
                          >
                            <Visibility fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredEmployees.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, 50]}
            sx={{
              borderTop: '1px solid #E5E7EB',
              backgroundColor: '#FAFAFA',
              '& .MuiTablePagination-toolbar': {
                padding: '16px'
              },
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                color: '#374151',
                fontWeight: 500
              },
              '& .MuiIconButton-root': {
                color: '#6B7280',
                '&:hover': {
                  backgroundColor: '#F3F4F6',
                  color: '#374151'
                },
                '&.Mui-disabled': {
                  color: '#D1D5DB'
                }
              }
            }}
          />
          </Card>
        </Box>
      )}

      <Dialog
        open={Boolean(breakdownEmployee)}
        onClose={closeBreakdownModal}
        maxWidth={false}
        fullWidth
        scroll="paper"
        className="probation-breakdown-dialog"
        aria-labelledby="probation-breakdown-dialog-title"
      >
        <DialogTitle
          id="probation-breakdown-dialog-title"
          className="probation-breakdown-dialog-title"
          component="div"
        >
          <Box className="probation-breakdown-dialog-title-text">
            <Typography component="h2" className="probation-breakdown-employee-name">
              {breakdownEmployee?.employeeName}
            </Typography>
            <Typography className="probation-breakdown-employee-meta">
              {breakdownEmployee?.employeeCode}
              {breakdownEmployee?.department ? ` · ${breakdownEmployee.department}` : ''}
            </Typography>
            <Typography className="probation-breakdown-dialog-subtitle">
              Probation period breakdown
            </Typography>
          </Box>
          <IconButton
            onClick={closeBreakdownModal}
            aria-label="Close probation breakdown"
            size="small"
            sx={{ color: '#6B7280' }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers className="probation-breakdown-dialog-content">
          <ProbationPeriodBreakdown
            emp={breakdownEmployee}
            formatDateIST={formatDateIST}
            formatMonthLabel={formatMonthLabel}
            formatLeaveTypeLabel={formatLeaveTypeLabel}
            formatAbsentDayLabel={formatAbsentDayLabel}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeBreakdownModal} variant="contained" color="inherit" sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default ProbationTracker;
