// frontend/src/pages/SchedulingManagementPage.jsx

import React, { useState, useEffect, useCallback, memo, useMemo, useRef } from 'react';
import api from '../api/axios';
import {
    Typography,
    Button,
    Alert,
    Snackbar,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Tooltip,
    IconButton,
    TableSortLabel,
    Box,
    TablePagination
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ShiftForm from '../components/ShiftForm';
import OfficeLocationManager from '../components/OfficeLocationManager';
import PageHeroHeader from '../components/PageHeroHeader';
import { SkeletonBox } from '../components/SkeletonLoaders';
import '../styles/SchedulingManagementPage.css';

// --- Helper Functions ---
const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    const [hours, minutes] = timeString.split(':');
    const date = new Date(0, 0, 0, hours, minutes);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

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
    { id: 'shiftName', numeric: false, label: 'Name' },
    { id: 'shiftType', numeric: false, label: 'Type' },
    { id: 'startTime', numeric: false, label: 'Start Time' },
    { id: 'endTime', numeric: false, label: 'End Time' },
    { id: 'durationHours', numeric: true, label: 'Duration (Hrs)' },
    { id: 'paidBreakMinutes', numeric: true, label: 'Paid Break (Mins)' },
    { id: 'actions', numeric: true, disableSorting: true, label: 'Actions' },
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
    return (
        <TableRow hover className="shift-table-row">
            <TableCell component="th" scope="row" className="shift-name-cell">{shift.shiftName}</TableCell>
            <TableCell>
                <Chip
                    label={shift.shiftType}
                    size="small"
                    color={shift.shiftType === 'Fixed' ? 'primary' : 'secondary'}
                    variant="outlined"
                />
            </TableCell>
            <TableCell>{formatTime(shift.startTime)}</TableCell>
            <TableCell>{formatTime(shift.endTime)}</TableCell>
            <TableCell align="center">{shift.durationHours}</TableCell>
            <TableCell align="center">{shift.paidBreakMinutes}</TableCell>
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
const SchedulingManagementPage = () => {
    // Shifts Section State
    const [shifts, setShifts] = useState([]);
    const [shiftsLoading, setShiftsLoading] = useState(true);
    const [shiftsError, setShiftsError] = useState('');
    const [isShiftFormOpen, setIsShiftFormOpen] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const [shiftDeleteDialog, setShiftDeleteDialog] = useState({ open: false, shift: null });
    const [isSavingShift, setIsSavingShift] = useState(false);
    const [shiftOrder, setShiftOrder] = useState('asc');
    const [shiftOrderBy, setShiftOrderBy] = useState('shiftName');
    const [shiftPage, setShiftPage] = useState(0);
    const [shiftRowsPerPage, setShiftRowsPerPage] = useState(10);
    const [shiftTotalCount, setShiftTotalCount] = useState(0);

    // Office Locations Section State
    const [locationsError, setLocationsError] = useState('');

    // Shared Snackbar State
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    // Ref for OfficeLocationManager
    const locationManagerRef = useRef();

    // Shifts Section Methods
    const fetchShifts = useCallback(async () => {
        setShiftsLoading(true);
        try {
            const { data } = await api.get(`/admin/shifts?page=${shiftPage + 1}&limit=${shiftRowsPerPage}`);
            
            // Handle paginated response
            if (data.shifts) {
                setShifts(Array.isArray(data.shifts) ? data.shifts : []);
                setShiftTotalCount(data.totalCount || 0);
            } else {
                setShifts(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            setShiftsError('Failed to fetch shifts. Please try again.');
        } finally {
            setShiftsLoading(false);
        }
    }, [shiftPage, shiftRowsPerPage]);

    useEffect(() => {
        fetchShifts();
    }, [fetchShifts]);

    const handleOpenShiftForm = (shift = null) => {
        setSelectedShift(shift);
        setIsShiftFormOpen(true);
    };

    const handleCloseShiftForm = () => {
        setSelectedShift(null);
        setIsShiftFormOpen(false);
    };

    const handleSaveShift = async (formData) => {
        setIsSavingShift(true);
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
            handleCloseShiftForm();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save shift.', severity: 'error' });
        } finally {
            setIsSavingShift(false);
        }
    };

    const confirmDeleteShift = async () => {
        const shiftToDelete = shiftDeleteDialog.shift;
        if (!shiftToDelete) return;
        const originalShifts = [...shifts];
        setShifts(prev => prev.filter(s => s._id !== shiftToDelete._id));
        setShiftDeleteDialog({ open: false, shift: null });
        try {
            await api.delete(`/admin/shifts/${shiftToDelete._id}`);
            setSnackbar({ open: true, message: 'Shift deleted successfully!', severity: 'success' });
        } catch (err) {
            setShifts(originalShifts);
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete shift.', severity: 'error' });
        }
    };

    const handleShiftRequestSort = (event, property) => {
        const isAsc = shiftOrderBy === property && shiftOrder === 'asc';
        setShiftOrder(isAsc ? 'desc' : 'asc');
        setShiftOrderBy(property);
    };

    const handleShiftPageChange = (event, newPage) => {
        setShiftPage(newPage);
    };

    const handleShiftRowsPerPageChange = (event) => {
        setShiftRowsPerPage(parseInt(event.target.value, 10));
        setShiftPage(0);
    };

    const handleAddLocation = () => {
        if (locationManagerRef.current) {
            locationManagerRef.current.openAddDialog();
        }
    };

    const visibleRows = useMemo(
        () => stableSort(shifts, getComparator(shiftOrder, shiftOrderBy)),
        [shifts, shiftOrder, shiftOrderBy],
    );

    return (
        <div className="scheduling-management-page">
            <PageHeroHeader
                eyebrow="Scheduling"
                title="Manage Shifts & Locations"
                description="Manage work shifts and office locations."
            />

            <div className="scheduling-content-wrapper">
                {/* Shifts Section */}
                <div className="shifts-section-container">
                <div className="section-header">
                    <Typography variant="h6" className="section-title">Manage Shifts</Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenShiftForm()}
                    >
                        Add Shift
                    </Button>
                </div>

                {shiftsError && <Alert severity="error" className="error-alert">{shiftsError}</Alert>}

                {shiftsLoading ? (
                    <div className="flex-center">
                        <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                    </div>
                ) : (
                    <div className="shifts-card">
                        <TableContainer component={Paper} elevation={0} className="table-container">
                            <Table stickyHeader aria-label="shifts table">
                                <SortableTableHead
                                    order={shiftOrder}
                                    orderBy={shiftOrderBy}
                                    onRequestSort={handleShiftRequestSort}
                                />
                                <TableBody>
                                    {visibleRows.map((shift) => (
                                        <ShiftRow
                                            key={shift._id}
                                            shift={shift}
                                            onEdit={handleOpenShiftForm}
                                            onDelete={(s) => setShiftDeleteDialog({ open: true, shift: s })}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <TablePagination
                            rowsPerPageOptions={[5, 10, 25, 50]}
                            component="div"
                            count={shiftTotalCount}
                            rowsPerPage={shiftRowsPerPage}
                            page={shiftPage}
                            onPageChange={handleShiftPageChange}
                            onRowsPerPageChange={handleShiftRowsPerPageChange}
                        />
                    </div>
                )}

                {/* ShiftForm Modal */}
                <ShiftForm
                    open={isShiftFormOpen}
                    onClose={handleCloseShiftForm}
                    onSave={handleSaveShift}
                    shift={selectedShift}
                    isSaving={isSavingShift}
                />

                {/* Delete Confirmation Dialog */}
                <Dialog
                    open={shiftDeleteDialog.open}
                    onClose={() => setShiftDeleteDialog({ open: false, shift: null })}
                >
                    <DialogTitle>Delete Shift</DialogTitle>
                    <DialogContent>
                        Are you sure you want to delete shift <b>{shiftDeleteDialog.shift?.shiftName}</b>?
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setShiftDeleteDialog({ open: false, shift: null })}>Cancel</Button>
                        <Button onClick={confirmDeleteShift} color="error" variant="contained">Delete</Button>
                    </DialogActions>
                </Dialog>
            </div>

            {/* Office Locations Section */}
            <div className="office-locations-section-container">
                <div className="section-header">
                    <Typography variant="h6" className="section-title">Office Locations</Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={handleAddLocation}
                    >
                        Add Office Location
                    </Button>
                </div>

                {locationsError && <Alert severity="error" className="error-alert">{locationsError}</Alert>}

                <OfficeLocationManager ref={locationManagerRef} />
            </div>
            </div>

            {/* Shared Snackbar */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </div>
    );
};

export default SchedulingManagementPage;
