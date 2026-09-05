import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Avatar,
  Divider
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  ManageAccounts as ManageAccountsIcon,
  Gavel as GavelIcon,
  LockClock as LockClockIcon,
  CalendarToday as CalendarIcon,
  Person as PersonIcon,
  Shield as ShieldIcon,
  Category as CategoryIcon
} from '@mui/icons-material';
import api from '../../api/axios';
import CIFTimeline from './CIFTimeline';
import StatusChangeModal from './StatusChangeModal';
import CIFAttachments from './CIFAttachments';

// Subcomponents
const CIFDetailHeader = ({ cif, onEdit, onManageStatus, onClose, canEdit, loading }) => {
  const getSeverityColor = (severity) => {
    const colors = {
      critical: '#DC2626',
      high: '#EF4444',
      medium: '#F59E0B',
      low: '#6B7280'
    };
    return colors[severity] || '#E5E7EB';
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: '#9CA3AF',
      open: '#10B981',
      under_review: '#F59E0B',
      escalated: '#DC2626',
      resolved: '#10B981',
      closed: '#10B981',
      archived: '#6B7280'
    };
    return colors[status] || '#9CA3AF';
  };

  const getSeverityBorderColor = (severity) => {
    const colors = {
      critical: '#DC2626',
      high: '#EF4444',
      medium: '#F59E0B',
      low: '#D1D5DB'
    };
    return colors[severity] || '#E5E7EB';
  };

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'white',
        borderBottom: '1px solid #E5E7EB',
        borderLeft: `4px solid ${cif ? getSeverityBorderColor(cif.severity) : '#E5E7EB'}`
      }}
    >
      <Box sx={{ px: 3, py: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Left: CIF ID & Employee Info */}
          <Box>
            <Typography 
              variant="h5" 
              sx={{ 
                fontWeight: 700, 
                color: '#111827', 
                fontSize: '1.5rem',
                mb: 0.5,
                letterSpacing: '-0.01em'
              }}
            >
              CIF-{cif?.cifId || cif?._id}
            </Typography>
            {cif && (
              <Typography 
                variant="body2" 
                sx={{ 
                  color: '#6B7280', 
                  fontSize: '0.875rem',
                  fontWeight: 500
                }}
              >
                {cif.employeeId?.fullName} • {cif.employeeId?.department}
              </Typography>
            )}
          </Box>

          {/* Center: Status & Severity Badges */}
          {cif && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mx: 3 }}>
              <Chip
                label={(cif.status || 'open').replace(/_/g, ' ').toUpperCase()}
                sx={{
                  bgcolor: getStatusColor(cif.status),
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  height: '32px',
                  borderRadius: '16px',
                  px: 2,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              />
              <Chip
                label={(cif.severity || 'low').toUpperCase()}
                sx={{
                  bgcolor: getSeverityColor(cif.severity),
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  height: '32px',
                  borderRadius: '16px',
                  px: 2,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  boxShadow: cif.severity === 'critical' || cif.severity === 'high' 
                    ? '0 4px 12px rgba(220, 38, 38, 0.3)' 
                    : 'none'
                }}
              />
            </Box>
          )}

          {/* Right: Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Button
              variant="outlined"
              startIcon={<EditIcon sx={{ fontSize: '1.1rem' }} />}
              onClick={() => onEdit(cif)}
              disabled={!canEdit || loading}
              sx={{
                borderColor: '#D1D5DB',
                color: '#374151',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                px: 2.5,
                py: 0.875,
                borderRadius: '8px',
                '&:hover': {
                  borderColor: '#9CA3AF',
                  bgcolor: '#F9FAFB'
                },
                '&:disabled': {
                  borderColor: '#E5E7EB',
                  color: '#9CA3AF'
                }
              }}
            >
              Edit
            </Button>
            <Button
              variant="contained"
              startIcon={<ManageAccountsIcon sx={{ fontSize: '1.1rem' }} />}
              onClick={onManageStatus}
              disabled={!canEdit || loading}
              sx={{
                bgcolor: '#DC2626',
                color: 'white',
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.875rem',
                px: 2.5,
                py: 0.875,
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                '&:hover': {
                  bgcolor: '#B91C1C',
                  boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
                },
                '&:disabled': {
                  bgcolor: '#E5E7EB',
                  color: '#9CA3AF'
                }
              }}
            >
              Manage Status
            </Button>
            <IconButton
              onClick={onClose}
              sx={{
                color: '#6B7280',
                '&:hover': {
                  bgcolor: '#F3F4F6',
                  color: '#374151'
                }
              }}
            >
              <CloseIcon fontSize="medium" />
            </IconButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

const CIFEmployeeCard = ({ employee }) => {
  return (
    <Box
      sx={{
        bgcolor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        p: 3,
        border: '1px solid #F3F4F6'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5 }}>
        <Avatar
          sx={{
            width: 64,
            height: 64,
            bgcolor: '#DC2626',
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: 700,
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.2)'
          }}
        >
          {employee?.fullName?.charAt(0) || 'U'}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography 
            variant="h6" 
            sx={{ 
              fontWeight: 700, 
              color: '#111827', 
              fontSize: '1.125rem',
              mb: 0.5,
              letterSpacing: '-0.01em'
            }}
          >
            {employee?.fullName || 'N/A'}
          </Typography>
          <Typography 
            variant="body2" 
            sx={{ 
              color: '#6B7280', 
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            {employee?.employeeCode}
          </Typography>
          <Typography 
            variant="body2" 
            sx={{ 
              color: '#9CA3AF', 
              fontSize: '0.8125rem',
              mt: 0.25
            }}
          >
            {employee?.department}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

const CIFIncidentCard = ({ cif, formatDate }) => {
  const getSeverityColor = (severity) => {
    const colors = {
      critical: '#DC2626',
      high: '#EF4444',
      medium: '#F59E0B',
      low: '#6B7280'
    };
    return colors[severity] || '#E5E7EB';
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: '#9CA3AF',
      open: '#10B981',
      under_review: '#F59E0B',
      escalated: '#DC2626',
      resolved: '#10B981',
      closed: '#10B981',
      archived: '#6B7280'
    };
    return colors[status] || '#9CA3AF';
  };

  const InfoField = ({ icon: Icon, label, value, fullWidth = false }) => (
    <Box sx={{ gridColumn: fullWidth ? 'span 2' : 'span 1' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <Icon sx={{ fontSize: '0.875rem', color: '#9CA3AF' }} />
        <Typography
          variant="caption"
          sx={{
            color: '#9CA3AF',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontSize: '0.6875rem'
          }}
        >
          {label}
        </Typography>
      </Box>
      {value}
    </Box>
  );

  return (
    <Box
      sx={{
        bgcolor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        p: 3,
        border: '1px solid #F3F4F6'
      }}
    >
      <Typography
        variant="overline"
        sx={{
          color: '#9CA3AF',
          fontWeight: 700,
          letterSpacing: '0.1em',
          fontSize: '0.6875rem',
          mb: 2.5,
          display: 'block'
        }}
      >
        INCIDENT OVERVIEW
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3, mb: 3 }}>
        <InfoField
          icon={CalendarIcon}
          label="Incident Date"
          value={
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>
              {formatDate(cif.incidentDate)}
            </Typography>
          }
        />
        <InfoField
          icon={PersonIcon}
          label="Assigned HR"
          value={
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', fontSize: '0.9375rem' }}>
              {cif.assignedTo?.fullName || 'Unassigned'}
            </Typography>
          }
        />
        <InfoField
          icon={ShieldIcon}
          label="Confidential Level"
          value={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {cif.confidentialLevel === 'legal_hold' && (
                <LockClockIcon sx={{ fontSize: '1rem', color: '#DC2626' }} />
              )}
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: 600, 
                  color: cif.confidentialLevel === 'legal_hold' ? '#DC2626' : '#111827',
                  fontSize: '0.9375rem',
                  textTransform: 'capitalize'
                }}
              >
                {cif.confidentialLevel ? cif.confidentialLevel.replace(/_/g, ' ') : 'Internal'}
              </Typography>
            </Box>
          }
        />
        <InfoField
          icon={CategoryIcon}
          label="Category"
          value={
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827', fontSize: '0.9375rem', textTransform: 'capitalize' }}>
              {cif.category ? cif.category.replace(/_/g, ' ') : 'N/A'}
            </Typography>
          }
        />
      </Box>

      <Divider sx={{ my: 2.5 }} />

      <Box>
        <Typography
          variant="overline"
          sx={{
            color: '#9CA3AF',
            fontWeight: 700,
            letterSpacing: '0.1em',
            fontSize: '0.6875rem',
            mb: 1.5,
            display: 'block'
          }}
        >
          TITLE
        </Typography>
        <Typography 
          variant="body1" 
          sx={{ 
            fontWeight: 700, 
            color: '#111827', 
            fontSize: '1.0625rem',
            lineHeight: 1.5,
            letterSpacing: '-0.01em'
          }}
        >
          {cif.title}
        </Typography>
      </Box>
    </Box>
  );
};

const CIFDescriptionCard = ({ cif, formatDate }) => {
  return (
    <Box
      sx={{
        bgcolor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        p: 3,
        border: '1px solid #F3F4F6'
      }}
    >
      <Typography
        variant="overline"
        sx={{
          color: '#9CA3AF',
          fontWeight: 700,
          letterSpacing: '0.1em',
          fontSize: '0.6875rem',
          mb: 2,
          display: 'block'
        }}
      >
        DESCRIPTION
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: '#374151',
          lineHeight: 1.8,
          whiteSpace: 'pre-wrap',
          fontSize: '0.9375rem',
          fontWeight: 400
        }}
      >
        {cif.description}
      </Typography>

      {cif.resolutionNotes && (
        <>
          <Divider sx={{ my: 3 }} />
          <Typography
            variant="overline"
            sx={{
              color: '#9CA3AF',
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontSize: '0.6875rem',
              mb: 2,
              display: 'block'
            }}
          >
            RESOLUTION NOTES
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: '#374151',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
              fontSize: '0.9375rem',
              fontWeight: 400
            }}
          >
            {cif.resolutionNotes}
          </Typography>
        </>
      )}

      <Divider sx={{ my: 3 }} />
      <Typography 
        variant="caption" 
        sx={{ 
          color: '#9CA3AF', 
          fontSize: '0.8125rem',
          fontWeight: 500
        }}
      >
        Created by {cif.createdBy?.fullName} on {formatDate(cif.createdAt)}
      </Typography>
    </Box>
  );
};

// Main Component
const CIFDetailModal = ({ open, onClose, cifId, onEdit, onStatusChanged }) => {
  const [cif, setCif] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);

  useEffect(() => {
    if (open && cifId) {
      fetchCIF();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open, cifId]);

  const fetchCIF = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/admin/cif/${cifId}`);
      setCif(response.data);
    } catch (err) {
      console.error('Error fetching CIF:', err);
      setError(err.response?.data?.error || 'Failed to fetch CIF details');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const canEdit = useMemo(() => {
    if (!cif) return false;
    return cif.status !== 'closed' && cif.status !== 'archived' && cif.confidentialLevel !== 'legal_hold';
  }, [cif]);

  const handleStatusChangeSuccess = () => {
    setStatusModalOpen(false);
    fetchCIF();
    if (onStatusChanged) onStatusChanged();
  };

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && open) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxHeight: '90vh',
            overflow: 'hidden',
            animation: 'modalFadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            '@keyframes modalFadeIn': {
              from: {
                opacity: 0,
                transform: 'scale(0.95) translateY(10px)'
              },
              to: {
                opacity: 1,
                transform: 'scale(1) translateY(0)'
              }
            }
          }
        }}
        BackdropProps={{
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)'
          }
        }}
      >
        {/* Header */}
        {cif && (
          <CIFDetailHeader
            cif={cif}
            onEdit={onEdit}
            onManageStatus={() => setStatusModalOpen(true)}
            onClose={handleClose}
            canEdit={canEdit}
            loading={loading}
          />
        )}

        <DialogContent 
          sx={{ 
            p: 3, 
            bgcolor: '#F9FAFB', 
            overflowY: 'auto',
            '&::-webkit-scrollbar': {
              width: '8px'
            },
            '&::-webkit-scrollbar-track': {
              bgcolor: '#F3F4F6'
            },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: '#D1D5DB',
              borderRadius: '4px',
              '&:hover': {
                bgcolor: '#9CA3AF'
              }
            }
          }}
        >
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
              <CircularProgress sx={{ color: '#DC2626' }} />
            </Box>
          ) : error ? (
            <Alert 
              severity="error" 
              sx={{ 
                borderRadius: '12px',
                border: '1px solid #FCA5A5',
                bgcolor: '#FEF2F2'
              }}
            >
              {error}
            </Alert>
          ) : cif ? (
            <Box sx={{ display: 'flex', gap: 3 }}>
              {/* Left Column - 65% */}
              <Box sx={{ flex: '0 0 65%', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* Legal Hold Warning */}
                {cif.confidentialLevel === 'legal_hold' && (
                  <Alert
                    severity="error"
                    icon={<GavelIcon />}
                    sx={{
                      borderRadius: '12px',
                      border: '1px solid #FCA5A5',
                      bgcolor: '#FEF2F2',
                      boxShadow: '0 1px 3px rgba(220, 38, 38, 0.1)',
                      '& .MuiAlert-icon': {
                        color: '#DC2626'
                      },
                      '& .MuiAlert-message': {
                        fontWeight: 600,
                        fontSize: '0.875rem'
                      }
                    }}
                  >
                    This case is under Legal Hold. Editing and deletion are disabled.
                  </Alert>
                )}

                {/* Employee Card */}
                <CIFEmployeeCard employee={cif.employeeId} />

                {/* Incident Card */}
                <CIFIncidentCard cif={cif} formatDate={formatDate} />

                {/* Description Card */}
                <CIFDescriptionCard cif={cif} formatDate={formatDate} />

                {/* Attachments Section */}
                <CIFAttachments cifId={cifId} canEdit={canEdit} />
              </Box>

              {/* Right Column - 35% */}
              <Box sx={{ flex: '0 0 35%' }}>
                <Box
                  sx={{
                    bgcolor: '#FAFAFA',
                    borderRadius: '12px',
                    border: '1px solid #E5E7EB',
                    p: 3,
                    position: 'sticky',
                    top: 16,
                    maxHeight: 'calc(90vh - 180px)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      color: '#9CA3AF',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      fontSize: '0.6875rem',
                      mb: 2.5,
                      display: 'block'
                    }}
                  >
                    ACTIVITY TIMELINE
                  </Typography>
                  <Box 
                    sx={{ 
                      flex: 1, 
                      overflowY: 'auto',
                      pr: 1,
                      '&::-webkit-scrollbar': {
                        width: '6px'
                      },
                      '&::-webkit-scrollbar-track': {
                        bgcolor: 'transparent'
                      },
                      '&::-webkit-scrollbar-thumb': {
                        bgcolor: '#D1D5DB',
                        borderRadius: '3px',
                        '&:hover': {
                          bgcolor: '#9CA3AF'
                        }
                      }
                    }}
                  >
                    <CIFTimeline cifId={cifId} />
                  </Box>
                </Box>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Status Change Modal */}
      {cif && (
        <StatusChangeModal
          open={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          cif={cif}
          onSuccess={handleStatusChangeSuccess}
        />
      )}
    </>
  );
};

export default CIFDetailModal;
