import React, { useState, useEffect } from 'react';
import {
  Typography,
  Box,
  Chip,
  Grid,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  InfoOutlined as InfoIcon
} from '@mui/icons-material';
import api from '../../api/axios';

const RED = '#E53935';
const RED_DARK = '#C62828';
const RED_BG = '#FDECEC';
const TEXT = '#1A1A1A';
const MUTED = '#6B7280';

const CIFSummaryCard = ({ employeeId }) => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (employeeId) {
      fetchSummary();
    }
  }, [employeeId]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/admin/cif/employee-summary/${employeeId}`);
      setSummary(response.data);
    } catch (err) {
      console.error('Error fetching CIF summary:', err);
      setError('Failed to load CIF summary');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (riskLevel) => {
    const colors = {
      critical: 'error',
      high: 'warning',
      medium: 'info',
      low: 'success'
    };
    return colors[riskLevel] || 'default';
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const cardBase = {
    background: '#fff',
    borderRadius: '12px',
    padding: '16px 20px',
    border: '1px solid #e2e8f0',
  };

  if (loading) {
    return (
      <Box sx={cardBase}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} sx={{ color: RED }} />
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={cardBase}>
        <Alert severity="error" variant="outlined" sx={{ borderRadius: '12px' }}>
          {error}
        </Alert>
      </Box>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <Box sx={{ ...cardBase, display: 'flex', alignItems: 'center', gap: 1.5, borderLeft: `3px solid ${RED}` }}>
        <InfoIcon sx={{ fontSize: 20, color: RED }} />
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', color: TEXT }}>CIF Records</Typography>
          <Typography sx={{ fontSize: '0.8125rem', color: MUTED }}>
            No incident records on file for this employee.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ ...cardBase, borderLeft: `3px solid ${RED}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', color: TEXT }}>
          CIF Summary
        </Typography>
        <Chip
          label={`Risk: ${summary.riskLevel.toUpperCase()}`}
          size="small"
          color={getRiskColor(summary.riskLevel)}
          sx={{
            fontWeight: 700,
            fontSize: '11px',
            borderRadius: '8px',
            height: 26
          }}
        />
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={2}>
        <Grid item xs={6}>
          <Box
            sx={{
              background: '#fff',
              borderRadius: '12px',
              padding: '12px 14px',
              border: '1px solid #E5E7EB'
            }}
          >
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              Total Cases
            </Typography>
            <Typography sx={{ fontSize: '24px', fontWeight: 800, color: TEXT, lineHeight: 1 }}>
              {summary.total}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box
            sx={{
              background: '#fff',
              borderRadius: '12px',
              padding: '12px 14px',
              border: '1px solid #E5E7EB'
            }}
          >
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              Open Cases
            </Typography>
            <Typography sx={{ fontSize: '24px', fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>
              {summary.open}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box
            sx={{
              background: '#fff',
              borderRadius: '12px',
              padding: '12px 14px',
              border: '1px solid #E5E7EB'
            }}
          >
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              High Severity
            </Typography>
            <Typography sx={{ fontSize: '24px', fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>
              {summary.highCount}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box
            sx={{
              background: '#fff',
              borderRadius: '12px',
              padding: '12px 14px',
              border: '1px solid #E5E7EB'
            }}
          >
            <Typography sx={{ fontSize: '10px', fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
              Last Incident
            </Typography>
            <Typography sx={{ fontSize: '13px', fontWeight: 700, color: TEXT, lineHeight: 1.3, mt: 0.5 }}>
              {formatDate(summary.lastIncidentDate)}
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CIFSummaryCard;
