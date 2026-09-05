import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Grid,
  Typography,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Paper
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  FolderOpen as FolderOpenIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import api from '../../api/axios';

const SEVERITY_COLORS = {
  critical: '#DC2626',
  high: '#EA580C',
  medium: '#D97706',
  low: '#059669'
};

const RISK_LEVEL_COLORS = {
  Critical: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
  High: { bg: '#FED7AA', text: '#EA580C', border: '#FDBA74' },
  Medium: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  Low: { bg: '#D1FAE5', text: '#059669', border: '#A7F3D0' }
};

// Summary Card Component
const SummaryCard = ({ title, value, icon: Icon, color, subtitle }) => (
  <Card
    sx={{
      p: 3,
      borderRadius: '16px',
      border: '1px solid #E5E7EB',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      height: '100%'
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Box>
        <Typography variant="body2" sx={{ color: '#6B7280', mb: 1, fontWeight: 500 }}>
          {title}
        </Typography>
        <Typography variant="h4" sx={{ color: '#111827', fontWeight: 700, mb: 0.5 }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '12px',
          bgcolor: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Icon sx={{ color, fontSize: '1.5rem' }} />
      </Box>
    </Box>
  </Card>
);

const CIFAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [heatmap, setHeatmap] = useState([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const [analyticsRes, heatmapRes] = await Promise.all([
        api.get('/admin/cif/analytics'),
        api.get('/admin/cif/risk-heatmap')
      ]);

      setAnalytics(analyticsRes.data);
      setHeatmap(heatmapRes.data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError(err.response?.data?.error || 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress sx={{ color: '#DC2626' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: '12px' }}>
        {error}
      </Alert>
    );
  }

  if (!analytics) {
    return null;
  }

  // Prepare data for charts
  const severityData = [
    { name: 'Critical', value: analytics.severityDistribution.critical, color: SEVERITY_COLORS.critical },
    { name: 'High', value: analytics.severityDistribution.high, color: SEVERITY_COLORS.high },
    { name: 'Medium', value: analytics.severityDistribution.medium, color: SEVERITY_COLORS.medium },
    { name: 'Low', value: analytics.severityDistribution.low, color: SEVERITY_COLORS.low }
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Total CIF Records"
            value={analytics.totalCIF}
            icon={FolderOpenIcon}
            color="#DC2626"
            subtitle="All active records"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Open Cases"
            value={analytics.openCases}
            icon={TrendingUpIcon}
            color="#EA580C"
            subtitle="Requires attention"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="High Severity"
            value={analytics.highSeverityCount}
            icon={WarningIcon}
            color="#D97706"
            subtitle="Critical & High"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <SummaryCard
            title="Overdue Follow-ups"
            value={analytics.overdueFollowUps}
            icon={ScheduleIcon}
            color="#7C3AED"
            subtitle="Past due date"
          />
        </Grid>
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Monthly Trend */}
        <Grid item xs={12} md={8}>
          <Card
            sx={{
              p: 3,
              borderRadius: '16px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#111827' }}>
              Monthly Trend (Last 6 Months)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" stroke="#6B7280" style={{ fontSize: '0.875rem' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '0.875rem' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#DC2626"
                  strokeWidth={2}
                  dot={{ fill: '#DC2626', r: 4 }}
                  activeDot={{ r: 6 }}
                  name="CIF Records"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Grid>

        {/* Severity Distribution */}
        <Grid item xs={12} md={4}>
          <Card
            sx={{
              p: 3,
              borderRadius: '16px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              height: '100%'
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#111827' }}>
              Severity Distribution
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
      </Grid>

      {/* Department Distribution */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12}>
          <Card
            sx={{
              p: 3,
              borderRadius: '16px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
          >
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#111827' }}>
              Department Distribution (Top 10)
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.departmentDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="department" stroke="#6B7280" style={{ fontSize: '0.875rem' }} />
                <YAxis stroke="#6B7280" style={{ fontSize: '0.875rem' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                />
                <Legend />
                <Bar dataKey="count" fill="#DC2626" radius={[8, 8, 0, 0]} name="CIF Count" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
      </Grid>

      {/* Risk Heatmap */}
      <Card
        sx={{
          p: 3,
          borderRadius: '16px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}
      >
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600, color: '#111827' }}>
          Department Risk Heatmap
        </Typography>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #E5E7EB', borderRadius: '12px' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Department</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>Risk Score</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>Risk Level</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>Critical</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>High</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>Medium</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>Low</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {heatmap.map((row, index) => {
                const colors = RISK_LEVEL_COLORS[row.level] || RISK_LEVEL_COLORS.Low;
                return (
                  <TableRow key={index} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} sx={{ color: '#111827' }}>
                        {row.department}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" fontWeight={700} sx={{ color: '#111827' }}>
                        {row.riskScore}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={row.level}
                        sx={{
                          bgcolor: colors.bg,
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          height: '28px',
                          borderRadius: '14px'
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {row.breakdown.critical}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {row.breakdown.high}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {row.breakdown.medium}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {row.breakdown.low}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
};

export default CIFAnalytics;
