import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  Box,
  Typography
} from '@mui/material';
import api from '../../api/axios';
import { STATUS_TRANSITIONS, STATUS_LABELS } from '../../constants/cifConstants';

const StatusChangeModal = ({ open, onClose, cif, onSuccess }) => {
  const [newStatus, setNewStatus] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const allowedStatuses = STATUS_TRANSITIONS[cif?.status] || [];

  const requiresReason = (status) => {
    return status === 'escalated' || status === 'closed';
  };

  const handleSubmit = async () => {
    if (!newStatus) {
      setError('Please select a status');
      return;
    }

    if (requiresReason(newStatus) && !reason.trim()) {
      setError(`Reason is required when changing status to ${STATUS_LABELS[newStatus]}`);
      return;
    }

    // Resolution notes are recommended but not required if reason is provided
    if (newStatus === 'closed' && !cif.resolutionNotes && !reason.trim()) {
      setError('Resolution notes or reason are required before closing the case');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await api.patch(`/admin/cif/${cif._id}/status`, {
        status: newStatus,
        reason: reason.trim() || undefined
      });
      onSuccess();
      handleClose();
    } catch (err) {
      console.error('Error changing status:', err);
      setError(err.response?.data?.error || 'Failed to change status');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setNewStatus('');
    setReason('');
    setError(null);
    onClose();
  };

  if (!cif) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Change Status</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="textSecondary">
            Current Status: <strong>{STATUS_LABELS[cif.status]}</strong>
          </Typography>
        </Box>

        <TextField
          select
          label="New Status"
          fullWidth
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          disabled={saving || allowedStatuses.length === 0}
          sx={{ mb: 2 }}
        >
          {allowedStatuses.length === 0 ? (
            <MenuItem disabled>No transitions available</MenuItem>
          ) : (
            allowedStatuses.map((status) => (
              <MenuItem key={status} value={status}>
                {STATUS_LABELS[status]}
              </MenuItem>
            ))
          )}
        </TextField>

        <TextField
          label="Reason"
          fullWidth
          multiline
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={saving}
          required={requiresReason(newStatus)}
          helperText={
            requiresReason(newStatus)
              ? 'Reason is required for this status change'
              : 'Optional'
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={saving || !newStatus}
        >
          {saving ? <CircularProgress size={24} /> : 'Confirm'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StatusChangeModal;
