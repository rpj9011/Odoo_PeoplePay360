// frontend/src/pages/RequestsPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Typography, TextField, MenuItem, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Alert,
} from '@mui/material';
import { Add, Inventory2 } from '@mui/icons-material';
import api from '../api/axios';
import PageHeroHeader from '../components/PageHeroHeader';
import { TableSkeleton } from '../components/SkeletonLoaders';
import '../styles/RequestsPage.css';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const statusColor = (status) => {
  const map = {
    Pending: 'warning',
    'In Progress': 'info',
    Fulfilled: 'success',
    Rejected: 'error',
    Cancelled: 'default',
  };
  return map[status] || 'default';
};

const RequestsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [form, setForm] = useState({
    category: 'Stationery',
    customCategory: '',
    title: '',
    description: '',
    quantity: 1,
    priority: 'medium',
  });

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/resource-requests/mine');
      setRequests(data.requests || []);
      setCategories(data.categories || []);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to load requests.', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    const requestId = searchParams.get('requestId');
    if (!requestId || !requests.length) return;
    const match = requests.find((r) => r._id === requestId);
    if (match) {
      setSelected(match);
      setDetailOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [requests, searchParams, setSearchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/resource-requests', form);
      setSnackbar({ open: true, message: 'Request submitted successfully.', severity: 'success' });
      setFormOpen(false);
      setForm({
        category: 'Stationery',
        customCategory: '',
        title: '',
        description: '',
        quantity: 1,
        priority: 'medium',
      });
      fetchRequests();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to submit request.', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id) => {
    try {
      await api.patch(`/resource-requests/${id}/cancel`);
      setSnackbar({ open: true, message: 'Request cancelled.', severity: 'info' });
      setDetailOpen(false);
      fetchRequests();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Could not cancel request.', severity: 'error' });
    }
  };

  const categoryLabel = (req) => (req.category === 'Other' && req.customCategory ? req.customCategory : req.category);

  return (
    <Box className="requests-page">
      <PageHeroHeader
        eyebrow="Workplace"
        title="Resource Requests"
        description="Request stationery, IT hardware, or anything you need for work. Your admin team will review and update the status."
        icon={<Inventory2 />}
        actionArea={
          <Button variant="contained" startIcon={<Add />} onClick={() => setFormOpen(true)}>
            New Request
          </Button>
        }
      />

      <Paper className="requests-list-card" sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>My Requests</Typography>
        {loading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : requests.length === 0 ? (
          <Box className="requests-empty">
            <Inventory2 sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
            <Typography>No requests yet. Click &quot;New Request&quot; to get started.</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {requests.map((req) => (
                  <TableRow
                    key={req._id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => { setSelected(req); setDetailOpen(true); }}
                  >
                    <TableCell>{new Date(req.createdAt).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{categoryLabel(req)}</TableCell>
                    <TableCell>{req.title}</TableCell>
                    <TableCell>{req.quantity}</TableCell>
                    <TableCell>
                      <Chip size="small" label={req.status} color={statusColor(req.status)} className="requests-status-chip" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog
        open={formOpen}
        onClose={() => !submitting && setFormOpen(false)}
        maxWidth="sm"
        fullWidth
        className="resource-request-dialog"
      >
        <DialogTitle>
          New Resource Request
          <Typography component="span" className="resource-dialog-subtitle">
            Fill in the details below. All fields marked with * are required.
          </Typography>
        </DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <Typography className="resource-form-section-label">Request details</Typography>
            <div className="resource-form-grid">
              <TextField
                select
                fullWidth
                variant="outlined"
                label="Category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                required
                InputLabelProps={{ shrink: true }}
              >
                {(categories.length ? categories : ['Stationery', 'IT Hardware', 'Furniture', 'Office Supplies', 'Other']).map((c) => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
              {form.category === 'Other' && (
                <TextField
                  fullWidth
                  variant="outlined"
                  label="Specify request type"
                  value={form.customCategory}
                  onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                  required
                  placeholder="e.g. Access card, Training materials"
                  InputLabelProps={{ shrink: true }}
                />
              )}
              <TextField
                fullWidth
                variant="outlined"
                label="Title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                placeholder="Short summary of what you need"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                fullWidth
                variant="outlined"
                multiline
                minRows={4}
                maxRows={8}
                label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                required
                placeholder="Details, model numbers, urgency, etc."
                InputLabelProps={{ shrink: true }}
              />
              <div className="resource-form-row">
                <TextField
                  fullWidth
                  variant="outlined"
                  type="number"
                  label="Quantity"
                  inputProps={{ min: 1, max: 999 }}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  select
                  fullWidth
                  variant="outlined"
                  label="Priority"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                >
                  {PRIORITIES.map((p) => (
                    <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                  ))}
                </TextField>
              </div>
            </div>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setFormOpen(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth className="resource-request-dialog">
        {selected && (
          <>
            <DialogTitle>{selected.title}</DialogTitle>
            <DialogContent>
              <div className="resource-summary-panel">
                <Typography className="resource-summary-meta">
                  {categoryLabel(selected)} · Qty {selected.quantity} · {selected.priority} priority
                </Typography>
                <div className="resource-summary-chips">
                  <Chip size="small" label={selected.status} color={statusColor(selected.status)} className="requests-status-chip" />
                </div>
              </div>
              <Typography className="resource-form-section-label">Description</Typography>
              <Typography variant="body2" paragraph sx={{ color: '#334155', lineHeight: 1.6 }}>
                {selected.description}
              </Typography>
              {selected.adminNotes && (
                <>
                  <Typography className="resource-form-section-label" sx={{ mt: 1 }}>Admin notes</Typography>
                  <Typography variant="body2" sx={{ color: '#334155', lineHeight: 1.6 }}>{selected.adminNotes}</Typography>
                </>
              )}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                Submitted {new Date(selected.createdAt).toLocaleString('en-IN')}
              </Typography>
            </DialogContent>
            <DialogActions>
              {selected.status === 'Pending' && (
                <Button color="error" onClick={() => handleCancel(selected._id)}>Cancel Request</Button>
              )}
              <Button onClick={() => setDetailOpen(false)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RequestsPage;
