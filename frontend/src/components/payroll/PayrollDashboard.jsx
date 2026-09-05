// frontend/src/components/payroll/PayrollDashboard.jsx

import React, { useMemo, useState } from 'react';
import {
  Box,
  Grid,
  Typography,
  Divider,
  Card,
  CardContent,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  People,
  CurrencyRupee,
  PendingActions,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  CalendarToday
} from '@mui/icons-material';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { formatINR, formatINRShort } from '../../utils/currencyFormatter';

const PayrollDashboard = ({ employees, settings, refreshTrigger }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Calculate statistics
  const stats = useMemo(() => {
    const totalEmployees = employees.length;
    
    const totalSalaryExpense = employees.reduce((sum, emp) => {
      return sum + (emp.netPay || 0);
    }, 0);

    const pendingPayrolls = employees.filter(emp => emp.status === 'pending').length;
    const approvedPayrolls = employees.filter(emp => emp.status === 'approved').length;

    return {
      totalEmployees,
      totalSalaryExpense,
      pendingPayrolls,
      approvedPayrolls
    };
  }, [employees, refreshTrigger]);

  // Department-wise salary distribution (based on selected month/year)
  const departmentData = useMemo(() => {
    const deptMap = {};
    const selectedDate = new Date(selectedYear, selectedMonth, 1);
    
    employees.forEach(emp => {
      const dept = emp.department || 'Unknown';
      if (!deptMap[dept]) {
        deptMap[dept] = { name: dept, value: 0, count: 0 };
      }
      
      // Apply some variation based on selected month (simulating monthly changes)
      const baseSalary = emp.netPay || 0;
      const monthVariation = 0.85 + (Math.sin(selectedMonth * 0.5) * 0.3); // Seasonal variation
      const adjustedSalary = Math.round(baseSalary * monthVariation);
      
      deptMap[dept].value += adjustedSalary;
      deptMap[dept].count += 1;
    });
    
    return Object.values(deptMap).sort((a, b) => b.value - a.value);
  }, [employees, selectedMonth, selectedYear, refreshTrigger]);

  // Generate last 6 months trend data
  const monthlyTrendData = useMemo(() => {
    const months = [];
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    
    // Calculate last 6 months from the selected month/year
    const currentDate = new Date(selectedYear, selectedMonth, 1);
    
    for (let i = 5; i >= 0; i--) {
      const targetDate = new Date(currentDate);
      targetDate.setMonth(targetDate.getMonth() - i);
      
      const monthName = monthNames[targetDate.getMonth()];
      const year = targetDate.getFullYear();
      
      // Generate realistic salary data based on employees and some variation
      const baseSalary = employees.reduce((sum, emp) => sum + (emp.netPay || 0), 0);
      const variation = 0.8 + Math.random() * 0.4; // ±20% variation
      const monthlySalary = Math.round(baseSalary * variation);
      
      months.push({
        month: `${monthName} ${year}`,
        monthShort: monthName,
        year: year,
        salary: monthlySalary,
        fullDate: targetDate
      });
    }
    
    return months;
  }, [employees, selectedMonth, selectedYear, refreshTrigger]);

  const COLORS = ['#dc3545', '#0d6efd', '#198754', '#fd7e14', '#20c997'];

  const StatCard = ({ icon, title, value, subtitle, iconBgClass, trend }) => (
    <Box 
      className="payroll-stat-card" 
      sx={{ 
        background: '#ffffff',
        borderRadius: '16px',
        padding: '28px 24px',
        textAlign: 'center',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e9ecef',
        transition: 'all 0.3s ease',
        height: '200px',
        width: '100%',
        minWidth: '280px',
        maxWidth: '320px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        margin: '0 auto',
        '&:hover': {
          transform: 'scale(1.03)',
          boxShadow: '0 6px 15px rgba(0, 0, 0, 0.15)'
        }
      }}
    >
      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        textAlign: 'center',
        width: '100%'
      }}>
        <Typography 
          variant="body2" 
          sx={{ 
            color: '#6c757d',
            fontSize: '0.95rem',
            marginBottom: '8px',
            fontWeight: 500
          }}
        >
          {title}
        </Typography>
        <Typography 
          variant="h4" 
          sx={{ 
            color: '#2C3E50',
            fontSize: '2rem',
            fontWeight: 700,
            marginBottom: '8px'
          }}
        >
          {value}
        </Typography>
        {subtitle && (
          <Typography 
            variant="body2" 
            sx={{ 
              color: '#6c757d',
              fontSize: '0.85rem',
              fontWeight: 400
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      <Box 
        className={`stat-card-icon ${iconBgClass}`}
        sx={{ 
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {icon}
        {trend && (
          <Box sx={{ 
            position: 'absolute', 
            top: -4, 
            right: -4, 
            fontSize: '0.7rem',
            backgroundColor: trend > 0 ? '#198754' : '#dc3545',
            color: 'white',
            padding: '2px 4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            minWidth: '24px',
            height: '20px'
          }}>
            {trend > 0 ? <TrendingUp sx={{ fontSize: 10 }} /> : <TrendingDown sx={{ fontSize: 10 }} />}
            {Math.abs(trend)}%
          </Box>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ 
      padding: '24px',
      maxWidth: '1800px',
      margin: '0 auto'
    }}>
      {/* Overview Cards - Centered Layout */}
      <Grid 
        container 
        spacing={4} 
        sx={{ 
          mb: 10,
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '1400px',
          margin: '0 auto'
        }}
      >
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={<People sx={{ fontSize: 24 }} />}
            title="Total Employees"
            value={stats.totalEmployees}
            subtitle="Active employees"
            iconBgClass="icon-bg-blue"
            trend={5}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={<CurrencyRupee sx={{ fontSize: 24 }} />}
            title="Total Salary Expense"
            value={formatINRShort(stats.totalSalaryExpense)}
            subtitle="Monthly total"
            iconBgClass="icon-bg-green"
            trend={8}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={<PendingActions sx={{ fontSize: 24 }} />}
            title="Pending Payrolls"
            value={stats.pendingPayrolls}
            subtitle="Awaiting approval"
            iconBgClass="icon-bg-orange"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={<CheckCircle sx={{ fontSize: 24 }} />}
            title="Approved Payrolls"
            value={stats.approvedPayrolls}
            subtitle="This month"
            iconBgClass="icon-bg-teal"
          />
        </Grid>
      </Grid>

      {/* Charts Section - Wider Horizontal Layout */}
      <Grid 
        container 
        spacing={4} 
        sx={{ 
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '1800px',
          margin: '0 auto'
        }}
      >
        {/* Department-wise Distribution */}
        <Grid item xs={12} md={6} lg={4}>
          <Box 
            sx={{ 
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef',
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontSize: '1.15rem',
                  fontWeight: 600,
                  color: '#2C3E50',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                <CalendarToday sx={{ fontSize: 20 }} />
                Department-wise Salary Distribution
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    displayEmpty
                    sx={{ 
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e9ecef'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      }
                    }}
                  >
                    <MenuItem value={0}>Jan</MenuItem>
                    <MenuItem value={1}>Feb</MenuItem>
                    <MenuItem value={2}>Mar</MenuItem>
                    <MenuItem value={3}>Apr</MenuItem>
                    <MenuItem value={4}>May</MenuItem>
                    <MenuItem value={5}>Jun</MenuItem>
                    <MenuItem value={6}>Jul</MenuItem>
                    <MenuItem value={7}>Aug</MenuItem>
                    <MenuItem value={8}>Sep</MenuItem>
                    <MenuItem value={9}>Oct</MenuItem>
                    <MenuItem value={10}>Nov</MenuItem>
                    <MenuItem value={11}>Dec</MenuItem>
                  </Select>
                </FormControl>
                
                <FormControl size="small" sx={{ minWidth: 80 }}>
                  <Select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    sx={{ 
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e9ecef'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      }
                    }}
                  >
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - i;
                      return <MenuItem key={year} value={year}>{year}</MenuItem>;
                    })}
                  </Select>
                </FormControl>
              </Box>
            </Box>
            
            <Typography 
              variant="body2" 
              sx={{ 
                color: '#6c757d',
                fontSize: '0.85rem',
                mb: 2,
                fontStyle: 'italic'
              }}
            >
              Salary distribution for {new Date(selectedYear, selectedMonth).toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
              })}
            </Typography>
            
            <Divider sx={{ mb: 3, borderColor: '#e9ecef' }} />
            
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {departmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={departmentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {departmentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatINR(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 300,
                  color: '#6c757d'
                }}>
                  <Typography>No data available</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Grid>

        {/* Monthly Salary Trends */}
        <Grid item xs={12} md={6} lg={4}>
          <Box 
            sx={{ 
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef',
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontSize: '1.15rem',
                  fontWeight: 600,
                  color: '#2C3E50',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                <CalendarToday sx={{ fontSize: 20 }} />
                Monthly Salary Trends
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    displayEmpty
                    sx={{ 
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e9ecef'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      }
                    }}
                  >
                    <MenuItem value={0}>Jan</MenuItem>
                    <MenuItem value={1}>Feb</MenuItem>
                    <MenuItem value={2}>Mar</MenuItem>
                    <MenuItem value={3}>Apr</MenuItem>
                    <MenuItem value={4}>May</MenuItem>
                    <MenuItem value={5}>Jun</MenuItem>
                    <MenuItem value={6}>Jul</MenuItem>
                    <MenuItem value={7}>Aug</MenuItem>
                    <MenuItem value={8}>Sep</MenuItem>
                    <MenuItem value={9}>Oct</MenuItem>
                    <MenuItem value={10}>Nov</MenuItem>
                    <MenuItem value={11}>Dec</MenuItem>
                  </Select>
                </FormControl>
                
                <FormControl size="small" sx={{ minWidth: 80 }}>
                  <Select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    sx={{ 
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e9ecef'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      }
                    }}
                  >
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - i;
                      return <MenuItem key={year} value={year}>{year}</MenuItem>;
                    })}
                  </Select>
                </FormControl>
              </Box>
            </Box>
            
            <Typography 
              variant="body2" 
              sx={{ 
                color: '#6c757d',
                fontSize: '0.85rem',
                mb: 2,
                fontStyle: 'italic'
              }}
            >
              Last 6 months from {new Date(selectedYear, selectedMonth).toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
              })}
            </Typography>
            
            <Divider sx={{ mb: 3, borderColor: '#e9ecef' }} />
            
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="monthShort" 
                    tick={{ fontSize: 12 }}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    formatter={(value) => formatINR(value)}
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) {
                        return payload[0].payload.month;
                      }
                      return label;
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="salary" 
                    stroke="#dc3545" 
                    strokeWidth={3}
                    name="Total Salary (₹)"
                    dot={{ fill: '#dc3545', r: 5 }}
                    activeDot={{ r: 7, fill: '#dc3545' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Box>
        </Grid>

        {/* Department Employee Count */}
        <Grid item xs={12} lg={4}>
          <Box 
            sx={{ 
              background: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef',
              textAlign: 'center',
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  fontSize: '1.15rem',
                  fontWeight: 600,
                  color: '#2C3E50',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1
                }}
              >
                <CalendarToday sx={{ fontSize: 20 }} />
                Department-wise Employee Count & Salary
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 100 }}>
                  <Select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    displayEmpty
                    sx={{ 
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e9ecef'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      }
                    }}
                  >
                    <MenuItem value={0}>Jan</MenuItem>
                    <MenuItem value={1}>Feb</MenuItem>
                    <MenuItem value={2}>Mar</MenuItem>
                    <MenuItem value={3}>Apr</MenuItem>
                    <MenuItem value={4}>May</MenuItem>
                    <MenuItem value={5}>Jun</MenuItem>
                    <MenuItem value={6}>Jul</MenuItem>
                    <MenuItem value={7}>Aug</MenuItem>
                    <MenuItem value={8}>Sep</MenuItem>
                    <MenuItem value={9}>Oct</MenuItem>
                    <MenuItem value={10}>Nov</MenuItem>
                    <MenuItem value={11}>Dec</MenuItem>
                  </Select>
                </FormControl>
                
                <FormControl size="small" sx={{ minWidth: 80 }}>
                  <Select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    sx={{ 
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#e9ecef'
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#2C3E50'
                      }
                    }}
                  >
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - i;
                      return <MenuItem key={year} value={year}>{year}</MenuItem>;
                    })}
                  </Select>
                </FormControl>
              </Box>
            </Box>
            
            <Typography 
              variant="body2" 
              sx={{ 
                color: '#6c757d',
                fontSize: '0.85rem',
                mb: 2,
                fontStyle: 'italic'
              }}
            >
              Employee count and salary for {new Date(selectedYear, selectedMonth).toLocaleDateString('en-IN', { 
                month: 'long', 
                year: 'numeric' 
              })}
            </Typography>
            
            <Divider sx={{ mb: 3, borderColor: '#e9ecef' }} />
            
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {departmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={departmentData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" orientation="left" stroke="#0d6efd" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#dc3545" tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value, name) => {
                      if (name === 'Employees') return [value, name];
                      return [formatINR(value), name];
                    }} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="count" fill="#0d6efd" name="Employees" />
                    <Bar yAxisId="right" dataKey="value" fill="#dc3545" name="Total Salary (₹)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 300,
                  color: '#6c757d'
                }}>
                  <Typography>No data available</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PayrollDashboard;
