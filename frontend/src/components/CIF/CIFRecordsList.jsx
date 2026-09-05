import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Typography,
  Avatar,
  Tooltip
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Edit as EditIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import api from '../../api/axios';
import CIFDetailModal from './CIFDetailModal';
import CIFDrawer from './CIFDrawer';

const CIFRecordsList = ({ filters }) => {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCifId, setSelectedCifId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);

  const fetchRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: page + 1,
        limit: rowsPerPage
      };

      // Add filters to params
      if (filters.severity?.length > 0) params.severity = filters.severity.join(',');
      if (filters.status?.length > 0) params.status = filters.status.join(',');
      if (filters.category?.length > 0) params.category = filters.category.join(',');
      if (filters.confidentialLevel?.length > 0) params.confidentialLevel = filters.confidentialLevel.join(',');
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.includeArchived) params.includeArchived = 'true';

      const response = await api.get('/admin/cif', { params });
      setRecords(response.data.records);
      setTotal(response.data.pagination.total);
    } catch (err) {
      console.error('Error fetching CIF records:', err);
      const errorMsg = err.code === 'ERR_NETWORK' || err.message.includes('Network Error')
        ? 'Backend server is not running. Please start the server.'
        : err.response?.data?.error || 'Failed to fetch CIF records';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, filters]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Listen for refresh events
  useEffect(() => {
    const handleRefresh = () => {
      fetchRecords();
    };
    window.addEventListener('cif-refresh', handleRefresh);
    return () => window.removeEventListener('cif-refresh', handleRefresh);
  }, [fetchRecords]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleViewDetails = (cifId) => {
    setSelectedCifId(cifId);
    setDetailModalOpen(true);
  };

  const handleEdit = (record) => {
    setSelectedRecord(record);
    setDrawerOpen(true);
  };

  const handleCloseDetailModal = () => {
    setDetailModalOpen(false);
    setSelectedCifId(null);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedRecord(null);
  };

  const handleSaveSuccess = () => {
    handleCloseDrawer();
    fetchRecords();
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
      high: { bg: '#FED7AA', text: '#EA580C', border: '#FDBA74' },
      medium: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
      low: { bg: '#D1FAE5', text: '#059669', border: '#A7F3D0' }
    };
    return colors[severity] || colors.low;
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB' },
      open: { bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
      under_review: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
      escalated: { bg: '#FED7AA', text: '#EA580C', border: '#FDBA74' },
      resolved: { bg: '#D1FAE5', text: '#059669', border: '#A7F3D0' },
      closed: { bg: '#E5E7EB', text: '#374151', border: '#D1D5DB' },
      archived: { bg: '#F3F4F6', text: '#9CA3AF', border: '#D1D5DB' }
    };
    return colors[status] || colors.draft;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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

  return (
    <Box>
      <Card
        sx={{
          borderRadius: '16px',
          border: '1px solid #E5E7EB',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}
      >
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 600, color: '#374151' }}>CIF ID</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Employee</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Category</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>Severity</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#374151' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#374151' }}>Incident Date</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: '#374151' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                    <Typography variant="body1" sx={{ color: '#6B7280' }}>
                      No CIF records found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => {
                  const severityColors = getSeverityColor(record.severity);
                  const statusColors = getStatusColor(record.status);

                  return (
                    <TableRow
                      key={record._id}
                      hover
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#F9FAFB' }
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#111827' }}>
                          {record.cifId || 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Avatar
                            sx={{
                              width: 32,
                              height: 32,
                              bgcolor: '#DC2626',
                              fontSize: '0.875rem',
                              fontWeight: 600
                            }}
                          >
                            {record.employeeId?.fullName?.charAt(0) || 'U'}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight={600} sx={{ color: '#111827' }}>
                              {record.employeeId?.fullName || 'Unknown'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6B7280' }}>
                              {record.employeeId?.employeeCode || 'N/A'}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            color: '#111827',
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {record.title}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#6B7280', fontSize: '0.875rem' }}>
                          {record.category?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={record.severity?.toUpperCase()}
                          sx={{
                            bgcolor: severityColors.bg,
                            color: severityColors.text,
                            border: `1px solid ${severityColors.border}`,
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            height: '28px',
                            borderRadius: '14px'
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={record.status?.replace(/_/g, ' ').toUpperCase()}
                          sx={{
                            bgcolor: statusColors.bg,
                            color: statusColors.text,
                            border: `1px solid ${statusColors.border}`,
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
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="View Details">
                            <IconButton
                              size="small"
                              onClick={() => handleViewDetails(record._id)}
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
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => handleEdit(record)}
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
                          </Tooltip>
                          <Tooltip title="View Employee">
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/admin/cif/employee/${record.employeeId?._id}`)}
                              sx={{
                                color: '#6B7280',
                                '&:hover': {
                                  bgcolor: '#F3F4F6',
                                  color: '#DC2626'
                                }
                              }}
                            >
                              <PersonIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          sx={{
            borderTop: '1px solid #E5E7EB',
            '.MuiTablePagination-toolbar': {
              px: 3
            }
          }}
        />
      </Card>

      {/* Detail Modal */}
      {detailModalOpen && (
        <CIFDetailModal
          open={detailModalOpen}
          onClose={handleCloseDetailModal}
          cifId={selectedCifId}
          onUpdate={fetchRecords}
        />
      )}

      {/* Edit Drawer */}
      {drawerOpen && (
        <CIFDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          onSaveSuccess={handleSaveSuccess}
          mode="edit"
          initialData={selectedRecord}
        />
      )}
    </Box>
  );
};

export default CIFRecordsList;
