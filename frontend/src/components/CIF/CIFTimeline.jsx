import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Paper,
  Stack
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  ChangeCircle as ChangeCircleIcon,
  Visibility as VisibilityIcon,
  Circle as CircleIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import api from '../../api/axios';

const CIFTimeline = ({ cifId }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cifId) {
      fetchAuditLogs();
    }
  }, [cifId]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/admin/cif/${cifId}/audit`);
      setLogs(response.data);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
      setError('Failed to load timeline');
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType) => {
    const icons = {
      create: <AddIcon sx={{ fontSize: '1rem' }} />,
      update: <EditIcon sx={{ fontSize: '1rem' }} />,
      status_change: <ChangeCircleIcon sx={{ fontSize: '1rem' }} />,
      view: <VisibilityIcon sx={{ fontSize: '1rem' }} />
    };
    return icons[actionType] || <EditIcon sx={{ fontSize: '1rem' }} />;
  };

  const getActionColor = (actionType) => {
    const colors = {
      create: '#10B981',
      update: '#3B82F6',
      status_change: '#F59E0B',
      view: '#9CA3AF'
    };
    return colors[actionType] || '#9CA3AF';
  };

  const getActionLabel = (log) => {
    switch (log.actionType) {
      case 'create':
        return 'Created';
      case 'update':
        return 'Updated';
      case 'status_change':
        return `Status changed to ${log.newValue?.status?.replace(/_/g, ' ')}`;
      case 'view':
        return 'Viewed';
      default:
        return log.actionType;
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Memoize timeline items for performance
  const timelineItems = useMemo(() => {
    return logs.map((log) => ({
      id: log._id,
      label: getActionLabel(log),
      icon: getActionIcon(log.actionType),
      color: getActionColor(log.actionType),
      performedBy: log.performedBy?.fullName || 'Unknown',
      timestamp: formatTime(log.createdAt),
      reason: log.reason
    }));
  }, [logs]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={32} sx={{ color: '#DC2626' }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert 
        severity="error" 
        sx={{ 
          borderRadius: '8px',
          fontSize: '0.8125rem',
          py: 1
        }}
      >
        {error}
      </Alert>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          flexDirection: 'column',
          alignItems: 'center', 
          justifyContent: 'center',
          py: 8,
          px: 2
        }}
      >
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: '#F3F4F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2
          }}
        >
          <TimelineIcon sx={{ fontSize: '2rem', color: '#D1D5DB' }} />
        </Box>
        <Typography 
          variant="body2" 
          sx={{ 
            color: '#9CA3AF', 
            textAlign: 'center',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          No activity recorded yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Vertical line */}
      <Box
        sx={{
          position: 'absolute',
          left: 16,
          top: 8,
          bottom: 8,
          width: 2,
          bgcolor: '#E5E7EB',
          borderRadius: '1px'
        }}
      />

      {/* Timeline items */}
      <Stack spacing={2.5}>
        {timelineItems.map((item, index) => (
          <Box 
            key={item.id} 
            sx={{ 
              position: 'relative', 
              pl: 5,
              animation: 'slideIn 0.3s ease-out',
              animationDelay: `${index * 0.05}s`,
              animationFillMode: 'both',
              '@keyframes slideIn': {
                from: {
                  opacity: 0,
                  transform: 'translateX(-10px)'
                },
                to: {
                  opacity: 1,
                  transform: 'translateX(0)'
                }
              }
            }}
          >
            {/* Dot with icon */}
            <Box
              sx={{
                position: 'absolute',
                left: 8,
                top: 6,
                width: 18,
                height: 18,
                borderRadius: '50%',
                bgcolor: 'white',
                border: 2,
                borderColor: item.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1,
                boxShadow: `0 0 0 4px ${item.color}15`
              }}
            >
              <CircleIcon
                sx={{
                  fontSize: 8,
                  color: item.color
                }}
              />
            </Box>

            {/* Content Card */}
            <Paper
              elevation={0}
              sx={{
                p: 2,
                bgcolor: 'white',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                transition: 'all 0.2s ease',
                '&:hover': {
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  borderColor: '#D1D5DB'
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '6px',
                    bgcolor: `${item.color}15`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {React.cloneElement(item.icon, { 
                    sx: { fontSize: '1rem', color: item.color } 
                  })}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontWeight: 600,
                      color: '#111827',
                      fontSize: '0.875rem',
                      mb: 0.5,
                      lineHeight: 1.4
                    }}
                  >
                    {item.label}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: '#6B7280',
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 500
                    }}
                  >
                    by {item.performedBy}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: '#9CA3AF',
                      display: 'block',
                      fontSize: '0.6875rem',
                      mt: 0.25
                    }}
                  >
                    {item.timestamp}
                  </Typography>
                </Box>
              </Box>
              
              {item.reason && (
                <Box 
                  sx={{ 
                    mt: 1.5, 
                    pt: 1.5, 
                    borderTop: '1px solid #F3F4F6'
                  }}
                >
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      fontStyle: 'italic',
                      color: '#6B7280',
                      fontSize: '0.8125rem',
                      lineHeight: 1.5,
                      display: 'block'
                    }}
                  >
                    "{item.reason}"
                  </Typography>
                </Box>
              )}
            </Paper>
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

export default CIFTimeline;
