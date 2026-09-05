import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Typography,
  Avatar
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Visibility as ViewIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import api from '../api/axios';
import CIFDrawer from '../components/CIF/CIFDrawer';
import CIFDetailModal from '../components/CIF/CIFDetailModal';
import '../styles/CIFManagement.css';

const EmployeeCIFDetails = () => {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ total: 0, open: 0, highCount: 0, riskLevel: 'low' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [drawerMode, setDrawerMode] = useState('create');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCifId, setSelectedCifId] = useState(null);

  useEffect(() => {
    if (employeeId) {
      fetchEmployee();
      fetchRecords();
      fetchStats();
    }
  }, [employeeId]);

  const fetchEmployee = async () => {
    try {
      const response = await api.get(`/admin/cif/employee/${employeeId}`);
      setEmployee(response.data);
    } catch (err) {
      console.error('Error fetching employee:', err);
      // If employee fetch fails, try to get from CIF records
    }
  };

  const fetchRecords = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/cif', {
        params: { employeeId, limit: 100 }
      });
      setRecords(response.data.records);
      
      // Fallback: Get employee info from first record if not already set
      if (!employee && response.data.records.length > 0 && response.data.records[0].employeeId) {
        setEmployee(response.data.records[0].employeeId);
      }
    } catch (err) {
      console.error('Error fetching CIF records:', err);
      setError(err.response?.data?.error || 'Failed to fetch records');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get(`/admin/cif/employee-summary/${employeeId}`);
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleOpenDrawer = useCallback((mode, record = null) => {
    setDrawerMode(mode);
    // Pre-fill employeeId when creating new CIF
    if (mode === 'create') {
      setSelectedRecord({ employeeId: employeeId });
    } else {
      setSelectedRecord(record);
    }
    setDrawerOpen(true);
  }, [employeeId]);

  const handleOpenDetailModal = useCallback((record) => {
    setSelectedCifId(record._id);
    setDetailModalOpen(true);
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setDetailModalOpen(false);
    setSelectedCifId(null);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedRecord(null);
  }, []);

  const handleSaveSuccess = useCallback(() => {
    handleCloseDrawer();
    fetchRecords();
    fetchStats();
  }, [handleCloseDrawer]);

  const getSeverityColor = useCallback((severity) => {
    const colors = {
      critical: '#DC2626',
      high: '#DC2626',
      medium: '#F59E0B',
      low: '#FEF3C7'
    };
    return colors[severity] || '#E5E7EB';
  }, []);

  const getStatusColor = useCallback((status) => {
    const colors = {
      draft: '#9CA3AF',
      open: '#DC2626',
      under_review: '#F59E0B',
      escalated: '#DC2626',
      resolved: '#10B981',
      closed: '#10B981',
      archived: '#6B7280'
    };
    return colors[status] || '#9CA3AF';
  }, []);

  const getRiskLevelColor = (level) => {
    const colors = {
      critical: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
      high: { bg: '#FED7AA', text: '#EA580C', border: '#FDBA74' },
      medium: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
      low: { bg: '#D1FAE5', text: '#059669', border: '#A7F3D0' }
    };
    return colors[level] || colors.low;
  };

  const formatDate = useCallback((date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, []);

  const riskColors = getRiskLevelColor(stats.riskLevel);

  return (
    <Box className="cif-management-page">
      {/* Employee Header */}
      <Box sx={{ mb: 3 }}>

        {employee && (
          <Card
            elevation={0}
            sx={{
              borderRadius: '16px',
              border: '1px solid #E5E7EB',
              p: 3,
              bgcolor: 'white'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Avatar
                sx={{
                  width: 72,
                  height: 72,
                  bgcolor: '#DC2626',
                  fontSize: '2rem',
                  fontWeight: 600
                }}
              >
                {employee.fullName?.charAt(0) || 'U'}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
                  {employee.fullName}
                </Typography>
                <Typography variant="body2" sx={{ color: '#6B7280', mb: 1 }}>
                  {employee.employeeCode} • {employee.department} • {employee.email}
                </Typography>
                <Chip
                  label={`Risk Level: ${stats.riskLevel.toUpperCase()}`}
                  sx={{
                    bgcolor: riskColors.bg,
                    color: riskColors.text,
                    border: `1px solid ${riskColors.border}`,
                    fontWeight: 600,
                    fontSize: '0.75rem'
                  }}
                />
              </Box>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => handleOpenDrawer('create', { employeeId: employee._id })}
                sx={{
                  bgcolor: '#DC2626',
                  color: 'white',
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 3,
                  py: 1.25,
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                  '&:hover': {
                    bgcolor: '#B91C1C',
                    boxShadow: '0 6px 16px rgba(220, 38, 38, 0.4)'
                  }
                }}
              >
                New CIF
              </Button>
            </Box>
          </Card>
        )}
      </Box>

      {/* KPI Cards */}
      <Box 
        sx={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 3,
          mb: 4
        }}
      >
        <Card
          elevation={0}
          sx={{
            borderRadius: '16px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            p: 3
          }}
        >
          <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>
            Total CIF
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 700, color: '#111827', mt: 1 }}>
            {stats.total}
          </Typography>
          <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
            All records
          </Typography>
        </Card>

        <Card
          elevation={0}
          sx={{
            borderRadius: '16px',
            border: '1px solid #FEE2E2',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            p: 3,
            bgcolor: '#FEF2F2'
          }}
        >
          <Typography variant="caption" sx={{ color: '#DC2626', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>
            Open Cases
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 700, color: '#DC2626', mt: 1 }}>
            {stats.open}
          </Typography>
          <Typography variant="caption" sx={{ color: '#DC2626', opacity: 0.7 }}>
            Requires attention
          </Typography>
        </Card>

        <Card
          elevation={0}
          sx={{
            borderRadius: '16px',
            border: '1px solid #FED7AA',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
            p: 3,
            bgcolor: '#FFF7ED'
          }}
        >
          <Typography variant="caption" sx={{ color: '#F59E0B', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>
            High Severity
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 700, color: '#F59E0B', mt: 1 }}>
            {stats.highCount}
          </Typography>
          <Typography variant="caption" sx={{ color: '#F59E0B', opacity: 0.7 }}>
            Critical incidents
          </Typography>
        </Card>

        {stats.lastIncidentDate && (
          <Card
            elevation={0}
            sx={{
              borderRadius: '16px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              p: 3
            }}
          >
            <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem' }}>
              Last Incident
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827', mt: 1 }}>
              {formatDate(stats.lastIncidentDate)}
            </Typography>
            <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
              Most recent
            </Typography>
          </Card>
        )}
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: '16px' }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* CIF Records Table */}
      <Card 
        elevation={0}
        sx={{
          borderRadius: '20px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ p: 3, borderBottom: '1px solid #E5E7EB' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#111827' }}>
            CIF Records
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>CIF ID</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>Title</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>Category</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>Severity</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>Status</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>Incident Date</TableCell>
                <TableCell sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>Follow-up Date</TableCell>
                <TableCell align="right" sx={{ bgcolor: '#F9FAFB', fontWeight: 600, color: '#374151', textTransform: 'uppercase', fontSize: '0.75rem' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                    <CircularProgress sx={{ color: '#DC2626' }} size={40} />
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <PersonIcon sx={{ fontSize: 48, color: '#D1D5DB' }} />
                      <Typography variant="body1" color="textSecondary">
                        No CIF records found for this employee
                      </Typography>
                      <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDrawer('create', { employeeId: employee._id })}
                        sx={{
                          borderColor: '#DC2626',
                          color: '#DC2626',
                          '&:hover': {
                            borderColor: '#B91C1C',
                            bgcolor: '#FEF2F2'
                          }
                        }}
                      >
                        Create First CIF
                      </Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record._id} hover>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        fontWeight={600} 
                        sx={{ 
                          fontFamily: 'monospace',
                          color: '#DC2626',
                          bgcolor: '#FEF2F2',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: '8px',
                          display: 'inline-block'
                        }}
                      >
                        {record.cifId || record._id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500 }}>
                        {record.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ textTransform: 'capitalize', color: '#6B7280' }}>
                        {record.category.replace(/_/g, ' ')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={record.severity.toUpperCase()}
                        sx={{
                          bgcolor: getSeverityColor(record.severity),
                          color: record.severity === 'low' ? '#92400E' : 'white',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          height: '28px',
                          borderRadius: '14px'
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={record.status.replace(/_/g, ' ').toUpperCase()}
                        sx={{
                          bgcolor: getStatusColor(record.status),
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          height: '28px',
                          borderRadius: '14px'
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {formatDate(record.incidentDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#6B7280' }}>
                        {formatDate(record.followUpDate)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDetailModal(record)}
                          sx={{
                            color: '#6B7280',
                            '&:hover': {
                              bgcolor: '#F3F4F6',
                              color: '#DC2626'
                            }
                          }}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleOpenDrawer('edit', record)}
                          sx={{
                            color: '#6B7280',
                            '&:hover': {
                              bgcolor: '#F3F4F6',
                              color: '#DC2626'
                            }
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Drawer */}
      <CIFDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        mode={drawerMode}
        record={selectedRecord}
        onSaveSuccess={handleSaveSuccess}
        hideEmployeeField={true}
      />

      {/* Detail Modal */}
      <CIFDetailModal
        open={detailModalOpen}
        onClose={handleCloseDetailModal}
        cifId={selectedCifId}
        onEdit={(record) => {
          handleCloseDetailModal();
          handleOpenDrawer('edit', record);
        }}
        onStatusChanged={() => {
          fetchRecords();
          fetchStats();
        }}
      />
    </Box>
  );
};

export default EmployeeCIFDetails;
