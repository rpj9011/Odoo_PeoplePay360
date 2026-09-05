// frontend/src/pages/ShiftsPage.jsx

import React, { useState, useEffect, useCallback, memo, useMemo } from 'react';
import api from '../api/axios';
import { Typography, Button, Alert, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tooltip, IconButton, TableSortLabel, Box, TablePagination } from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ShiftForm from '../components/ShiftForm';
import '../styles/ShiftsPage.css'; // The updated stylesheet
import PageHeroHeader from '../components/PageHeroHeader';

import { SkeletonBox } from '../components/SkeletonLoaders';
// formatTime kept for potential future use but no longer rendered in the table
// const formatTime = ...

function descendingComparator(a, b, orderBy) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
}

function getComparator(order, orderBy) {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

// Stable sort preserves the original order of elements that have equal sort keys.
function stableSort(array, comparator) {
  const stabilizedThis = array.map((el, index) => [el, index]);
  stabilizedThis.sort((a, b) => {
    const order = comparator(a[0], b[0]);
    if (order !== 0) {
      return order;
    }
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
}

const headCells = [
  { id: 'shiftName',        numeric: false, label: 'Name' },
  { id: 'shiftType',        numeric: false, label: 'Type' },
  { id: 'timezone',         numeric: false, label: 'Timezone' },
  { id: 'totalWeeklyHours', numeric: true,  label: 'Weekly Hours' },
  { id: 'paidBreakMinutes', numeric: true,  label: 'Paid Break (Mins)' },
  { id: 'actions',          numeric: true,  disableSorting: true, label: 'Actions' },
];

// --- Table Components ---

const SortableTableHead = (props) => {
    const { order, orderBy, onRequestSort } = props;
    const createSortHandler = (property) => (event) => {
        onRequestSort(event, property);
    };

    return (
        <TableHead className="shift-table-head">
            <TableRow>
                {headCells.map((headCell) => (
                    <TableCell
                        key={headCell.id}
                        align={headCell.numeric ? 'center' : 'left'}
                        sortDirection={orderBy === headCell.id ? order : false}
                    >
                        {headCell.disableSorting ? (
                            headCell.label
                        ) : (
                            <TableSortLabel
                                active={orderBy === headCell.id}
                                direction={orderBy === headCell.id ? order : 'asc'}
                                onClick={createSortHandler(headCell.id)}
                            >
                                {headCell.label}
                                {orderBy === headCell.id ? (
                                    <Box component="span" sx={visuallyHidden}>
                                        {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                                    </Box>
                                ) : null}
                            </TableSortLabel>
                        )}
                    </TableCell>
                ))}
            </TableRow>
        </TableHead>
    );
};


const ShiftRow = memo(({ shift, onEdit, onDelete }) => {
    // Count working days from weeklyPattern for a quick summary
    const workingDays = Array.isArray(shift.weeklyPattern)
        ? shift.weeklyPattern.filter(e => e.isWorkingDay).length
        : null;

    return (
        <TableRow hover className="shift-table-row">
            <TableCell component="th" scope="row" className="shift-name-cell">
                {shift.shiftName}
            </TableCell>
            <TableCell>
                <Chip
                    label={shift.shiftType}
                    size="small"
                    color={shift.shiftType === 'Fixed' ? 'primary' : 'secondary'}
                    variant="outlined"
                />
            </TableCell>
            <TableCell sx={{ fontSize: '0.82rem', color: '#374151' }}>
                {shift.timezone || 'Asia/Kolkata'}
            </TableCell>
            <TableCell align="center">
                {shift.totalWeeklyHours != null
                    ? `${shift.totalWeeklyHours}h`
                    : shift.durationHours != null
                        ? `${shift.durationHours}h`   // legacy fallback
                        : '—'
                }
                {workingDays != null && (
                    <Typography variant="caption" display="block" color="text.secondary">
                        {workingDays}d / week
                    </Typography>
                )}
            </TableCell>
            <TableCell align="center">{shift.paidBreakMinutes ?? '—'}</TableCell>
            <TableCell align="center">
                <div className="actions-cell">
                    <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => onEdit(shift)}>
                            <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => onDelete(shift)}>
                            <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </div>
            </TableCell>
        </TableRow>
    );
});

// --- Main Page Component ---

const ShiftsPage = () => {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, shift: null });
    const [isSaving, setIsSaving] = useState(false);
    
    // State for sorting and pagination
    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('shiftName');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    const fetchShifts = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get(`/admin/shifts?page=${page + 1}&limit=${rowsPerPage}`);
            
            // Handle paginated response
            if (data.shifts) {
                setShifts(Array.isArray(data.shifts) ? data.shifts : []);
                setTotalCount(data.totalCount || 0);
            } else {
                setShifts(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            setError('Failed to fetch shifts. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage]);

    useEffect(() => {
        fetchShifts();
    }, [fetchShifts]);

    const handleOpenForm = (shift = null) => {
        setSelectedShift(shift);
        setIsFormOpen(true);
    };

    const handleCloseForm = () => {
        setSelectedShift(null);
        setIsFormOpen(false);
    };

    const handleRequestSort = (event, property) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };
    
    const handlePageChange = (event, newPage) => {
        setPage(newPage);
    };
    
    const handleRowsPerPageChange = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleSaveShift = async (formData) => {
        setIsSaving(true);
        try {
            if (selectedShift) {
                const { data: updatedShift } = await api.put(`/admin/shifts/${selectedShift._id}`, formData);
                setShifts(prevShifts => 
                    prevShifts.map(s => s._id === updatedShift._id ? updatedShift : s)
                );
                setSnackbar({ open: true, message: 'Shift updated successfully!', severity: 'success' });
            } else {
                const { data: newShift } = await api.post('/admin/shifts', formData);
                setShifts(prevShifts => [newShift, ...prevShifts]);
                setSnackbar({ open: true, message: 'Shift added successfully!', severity: 'success' });
            }
            handleCloseForm();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save shift.', severity: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDeleteShift = async () => {
        const shiftToDelete = deleteDialog.shift;
        if (!shiftToDelete) return;
        const originalShifts = [...shifts];
        setShifts(prev => prev.filter(s => s._id !== shiftToDelete._id));
        setDeleteDialog({ open: false, shift: null });
        try {
            await api.delete(`/admin/shifts/${shiftToDelete._id}`);
            setSnackbar({ open: true, message: 'Shift deleted successfully!', severity: 'success' });
        } catch (err) {
            setShifts(originalShifts);
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete shift.', severity: 'error' });
        }
    };

    const visibleRows = useMemo(
        () => stableSort(shifts, getComparator(order, orderBy)),
        [shifts, order, orderBy],
    );

    if (loading) return <div className="flex-center"><SkeletonBox width="24px" height="24px" borderRadius="50%" /></div>;

    return (
        <div className="shifts-page">
            <PageHeroHeader
                eyebrow="Scheduling"
                title="Manage Shifts"
                description="Create and manage work shifts and policies."
                actionArea={
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenForm()}
                    >
                        Add Shift
                    </Button>
                }
            />

            {error && <Alert severity="error" className="error-alert">{error}</Alert>}

            <div className="shifts-card">
                <TableContainer component={Paper} elevation={0} className="table-container">
                    <Table stickyHeader aria-label="shifts table">
                        <SortableTableHead
                            order={order}
                            orderBy={orderBy}
                            onRequestSort={handleRequestSort}
                        />
                        <TableBody>
                            {visibleRows.map((shift) => (
                                <ShiftRow
                                    key={shift._id}
                                    shift={shift}
                                    onEdit={handleOpenForm}
                                    onDelete={(s) => setDeleteDialog({ open: true, shift: s })}
                                />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    component="div"
                    count={totalCount}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handlePageChange}
                    onRowsPerPageChange={handleRowsPerPageChange}
                />
            </div>

            <ShiftForm open={isFormOpen} onClose={handleCloseForm} onSave={handleSaveShift} shift={selectedShift} isSaving={isSaving} />

            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, shift: null })}>
                <DialogTitle>Delete Shift</DialogTitle>
                <DialogContent>Are you sure you want to delete shift <b>{deleteDialog.shift?.shiftName}</b>?</DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, shift: null })}>Cancel</Button>
                    <Button onClick={confirmDeleteShift} color="error" variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
            </Snackbar>
        </div>
    );
};

export default ShiftsPage;