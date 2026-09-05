import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    FormControl,
    Select,
    MenuItem,
    IconButton,
    Menu,
    ListItemIcon,
    ListItemText,
    Snackbar,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    TablePagination,
    CircularProgress
} from '@mui/material';
import {
    Add as AddIcon,
    UploadFile as UploadFileIcon,
    MoreVert as MoreVertIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    DriveFileMove as MoveIcon,
    ContentCopy as CopyIcon,
    CloudUpload as CloudUploadIcon,
    FiberManualRecord as DotIcon
} from '@mui/icons-material';
import api from '../../api/axios';
import HolidayFormPanel from '../../components/admin/HolidayFormPanel';
import BulkUploadModal from '../../components/admin/BulkUploadModal';
import CloneHolidaysModal from '../../components/admin/CloneHolidaysModal';
import DatasetUploadModal from '../../components/admin/DatasetUploadModal';
import { useActiveYear } from '../../context/ActiveYearContext';
import './HolidayManagementPage.css';

const HolidayManagementPage = () => {
    const { refreshActiveYear } = useActiveYear();
    const [years, setYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState(null);
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const [editingHoliday, setEditingHoliday] = useState(null);
    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
    const [cloneModalOpen, setCloneModalOpen] = useState(false);
    const [datasetModalOpen, setDatasetModalOpen] = useState(false);
    const [createYearDialogOpen, setCreateYearDialogOpen] = useState(false);
    const [moveDialogOpen, setMoveDialogOpen] = useState(false);
    const [holidayToMove, setHolidayToMove] = useState(null);
    const [targetYearId, setTargetYearId] = useState('');
    const [actionMenuAnchor, setActionMenuAnchor] = useState(null);
    const [selectedHolidayForMenu, setSelectedHolidayForMenu] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [newYear, setNewYear] = useState({ year: new Date().getFullYear() + 1, startDate: '', endDate: '' });

    useEffect(() => {
        fetchYears();
    }, []);

    useEffect(() => {
        if (selectedYear) {
            fetchHolidays(selectedYear._id);
        }
    }, [selectedYear]);

    const fetchYears = async () => {
        try {
            const { data } = await api.get('/admin/leave-years');
            setYears(data);
            const active = data.find(y => y.isActive);
            if (active) {
                setSelectedYear(active);
            } else if (data.length > 0) {
                setSelectedYear(data[0]);
            }
        } catch (error) {
            showSnackbar('Failed to fetch years', 'error');
        }
    };

    const fetchHolidays = async (yearId) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/holidays/admin?yearId=${yearId}`);
            setHolidays(data);
        } catch (error) {
            showSnackbar('Failed to fetch holidays', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateYear = async () => {
        try {
            const payload = {
                year: parseInt(newYear.year),
                startDate: newYear.startDate,
                endDate: newYear.endDate
            };
            await api.post('/admin/leave-years', payload);
            showSnackbar('Year created successfully', 'success');
            setCreateYearDialogOpen(false);
            setNewYear({ year: new Date().getFullYear() + 1, startDate: '', endDate: '' });
            fetchYears();
        } catch (error) {
            showSnackbar(error.response?.data?.message || 'Failed to create year', 'error');
        }
    };

    const handleToggleLock = async (yearId) => {
        try {
            await api.post(`/admin/leave-years/${yearId}/lock`);
            showSnackbar('Year lock status updated', 'success');
            fetchYears();
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Failed to update lock status';
            showSnackbar(errorMessage, 'error');
        }
    };

    const handleDeleteHoliday = async (holidayId) => {
        if (!window.confirm('Are you sure you want to delete this holiday?')) return;
        try {
            await api.delete(`/holidays/admin/${holidayId}`);
            showSnackbar('Holiday deleted successfully', 'success');
            fetchHolidays(selectedYear._id);
        } catch (error) {
            showSnackbar('Failed to delete holiday', 'error');
        }
    };

    const handleMoveHoliday = async () => {
        try {
            await api.put(`/holidays/admin/${holidayToMove._id}/move`, { targetYearId });
            showSnackbar('Holiday moved successfully', 'success');
            setMoveDialogOpen(false);
            setHolidayToMove(null);
            setTargetYearId('');
            fetchHolidays(selectedYear._id);
        } catch (error) {
            showSnackbar('Failed to move holiday', 'error');
        }
    };

    const handleActionMenuOpen = (event, holiday) => {
        setActionMenuAnchor(event.currentTarget);
        setSelectedHolidayForMenu(holiday);
    };

    const handleActionMenuClose = () => {
        setActionMenuAnchor(null);
        setSelectedHolidayForMenu(null);
    };

    const handleEditClick = () => {
        setEditingHoliday(selectedHolidayForMenu);
        setPanelOpen(true);
        handleActionMenuClose();
    };

    const handleMoveClick = () => {
        setHolidayToMove(selectedHolidayForMenu);
        setMoveDialogOpen(true);
        handleActionMenuClose();
    };

    const handleDeleteClick = () => {
        handleDeleteHoliday(selectedHolidayForMenu._id);
        handleActionMenuClose();
    };

    const showSnackbar = (message, severity = 'success') => {
        setSnackbar({ open: true, message, severity });
    };

    const handleCloseSnackbar = () => {
        setSnackbar({ ...snackbar, open: false });
    };

    const handlePanelClose = () => {
        setPanelOpen(false);
        setEditingHoliday(null);
    };

    const handlePanelSuccess = () => {
        fetchHolidays(selectedYear._id);
        handlePanelClose();
        showSnackbar(editingHoliday ? 'Holiday updated successfully' : 'Holiday created successfully');
    };

    const handleBulkUploadSuccess = () => {
        fetchHolidays(selectedYear._id);
        setBulkUploadOpen(false);
        showSnackbar('Holidays uploaded successfully');
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'National': return '#dc3545';
            case 'Optional': return '#6c757d';
            default: return '#e9ecef';
        }
    };

    const getTypeTextColor = (type) => {
        switch (type) {
            case 'National': return '#fff';
            case 'Optional': return '#fff';
            default: return '#495057';
        }
    };

    const stats = {
        total: holidays.length,
        national: holidays.filter(h => h.type === 'National').length,
        optional: holidays.filter(h => h.type === 'Optional').length
    };

    const paginatedHolidays = holidays.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    return (
        <Box
            className="holiday-management-page"
            sx={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                overflowX: 'hidden',
            }}
        >
            {/* ── PAGE HEADER ───────────────────────────────── */}
            <Box className="page-header">
                <Box className="header-left">
                    <Typography variant="h4" className="page-title">
                        Holiday &amp; Leave Year Management
                    </Typography>
                </Box>
                <Box className="header-right">
                    <FormControl size="small" className="year-selector">
                        <Select
                            value={selectedYear?._id || ''}
                            onChange={(e) => {
                                const year = years.find(y => y._id === e.target.value);
                                setSelectedYear(year);
                            }}
                            displayEmpty
                        >
                            {years.map((year) => (
                                <MenuItem key={year._id} value={year._id}>
                                    {year.year}
                                    {year.isActive && (
                                        <DotIcon sx={{ ml: 1, fontSize: 12, color: '#dc3545' }} />
                                    )}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Button
                        variant="outlined"
                        startIcon={<AddIcon />}
                        onClick={() => setCreateYearDialogOpen(true)}
                        className="create-year-btn"
                    >
                        Create Year
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<CopyIcon />}
                        onClick={() => setCloneModalOpen(true)}
                        className="clone-btn"
                        disabled={years.length === 0}
                        sx={{ bgcolor: '#dc3545', '&:hover': { bgcolor: '#c82333' } }}
                    >
                        Clone Holidays
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<CloudUploadIcon />}
                        onClick={() => setDatasetModalOpen(true)}
                        className="dataset-btn"
                    >
                        Upload Dataset
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<UploadFileIcon />}
                        onClick={() => setBulkUploadOpen(true)}
                        className="bulk-upload-btn"
                        disabled={!selectedYear}
                    >
                        Bulk Upload
                    </Button>
                </Box>
            </Box>

            {/* ── STATS CARD ────────────────────────────────── */}
            {selectedYear && (
                <Box className="stats-card">
                    <Box className="stat-item">
                        <Typography className="stat-value">{stats.total}</Typography>
                        <Typography className="stat-label">Total Holidays</Typography>
                    </Box>
                    <Box className="stat-divider" />
                    <Box className="stat-item">
                        <Typography className="stat-value">{stats.national}</Typography>
                        <Typography className="stat-label">National</Typography>
                    </Box>
                    <Box className="stat-divider" />
                    <Box className="stat-item">
                        <Typography className="stat-value">{stats.optional}</Typography>
                        <Typography className="stat-label">Optional</Typography>
                    </Box>
                    <Box sx={{ flex: 1 }} />
                    <Button
                        size="small"
                        onClick={() => handleToggleLock(selectedYear._id)}
                        className="lock-btn"
                        disabled={selectedYear.isActive && !selectedYear.isLocked}
                        title={selectedYear.isActive && !selectedYear.isLocked
                            ? 'Cannot lock the active year' : ''}
                    >
                        {selectedYear.isLocked ? 'Unlock Year' : 'Lock Year'}
                    </Button>
                </Box>
            )}

            {/* ── HOLIDAYS TABLE ────────────────────────────── */}
            {/*
             * FIX: Paper must have explicit sx width props.
             * MUI Paper defaults to width:auto which overrides the CSS class
             * on hydration, collapsing the flex container and causing the
             * "Add Holiday" button to jump left next to the title.
             *
             * elevation={0} + variant="outlined" prevents Paper from adding
             * its own box-shadow that fights the CSS class box-shadow:none.
             */}
            <Paper
                className="table-container"
                elevation={0}
                sx={{
                    width: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    borderRadius: '12px',
                    border: '1px solid #f1f1f1',
                    boxShadow: 'none',
                }}
            >
                {/*
                 * FIX: table-header Box must also declare width:100% via sx.
                 * The CSS class sets it, but MUI Box can override on re-render.
                 * Declaring it in sx makes it inline-style level — highest priority.
                 */}
                <Box
                    className="table-header"
                    sx={{
                        width: '100%',
                        boxSizing: 'border-box',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <Typography variant="h6" className="table-title">
                        Holidays
                    </Typography>
                    <Button
                        startIcon={<AddIcon />}
                        onClick={() => {
                            setEditingHoliday(null);
                            setPanelOpen(true);
                        }}
                        className="add-holiday-btn"
                        disabled={!selectedYear || selectedYear.isLocked}
                        sx={{
                            ml: 'auto',          /* always flush right regardless of parent width */
                            flexShrink: 0,
                            bgcolor: '#dc3545',
                            color: '#fff',
                            '&:hover': { bgcolor: '#c82333' },
                            '&:disabled': { bgcolor: '#e9ecef', color: '#adb5bd' },
                        }}
                    >
                        Add Holiday
                    </Button>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress sx={{ color: '#dc3545' }} />
                    </Box>
                ) : (
                    <>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Holiday Name</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Day</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Applies To</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {paginatedHolidays.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">
                                                    No holidays found. Add your first holiday or upload via Excel.
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedHolidays.map((holiday) => (
                                            <TableRow key={holiday._id} hover>
                                                <TableCell>{holiday.name}</TableCell>
                                                <TableCell>
                                                    {new Date(holiday.date).toLocaleDateString('en-US', {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </TableCell>
                                                <TableCell>{holiday.day}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={holiday.type}
                                                        size="small"
                                                        sx={{
                                                            backgroundColor: getTypeColor(holiday.type),
                                                            color: getTypeTextColor(holiday.type),
                                                            fontWeight: 500,
                                                            fontSize: '0.75rem'
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell>{holiday.appliesTo || 'All'}</TableCell>
                                                <TableCell align="right">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => handleActionMenuOpen(e, holiday)}
                                                        disabled={selectedYear?.isLocked}
                                                    >
                                                        <MoreVertIcon fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        {holidays.length > rowsPerPage && (
                            <TablePagination
                                component="div"
                                count={holidays.length}
                                page={page}
                                onPageChange={(e, newPage) => setPage(newPage)}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={(e) => {
                                    setRowsPerPage(parseInt(e.target.value, 10));
                                    setPage(0);
                                }}
                                rowsPerPageOptions={[10, 25, 50]}
                            />
                        )}
                    </>
                )}
            </Paper>

            {/* ── ACTION MENU ───────────────────────────────── */}
            <Menu
                anchorEl={actionMenuAnchor}
                open={Boolean(actionMenuAnchor)}
                onClose={handleActionMenuClose}
            >
                <MenuItem onClick={handleEditClick}>
                    <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Edit</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleMoveClick}>
                    <ListItemIcon><MoveIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Move to Another Year</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleDeleteClick}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" sx={{ color: '#dc3545' }} />
                    </ListItemIcon>
                    <ListItemText sx={{ color: '#dc3545' }}>Delete</ListItemText>
                </MenuItem>
            </Menu>

            {/* ── CREATE YEAR DIALOG ────────────────────────── */}
            <Dialog
                open={createYearDialogOpen}
                onClose={() => setCreateYearDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Create New Leave Year</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Year"
                        type="number"
                        fullWidth
                        value={newYear.year}
                        onChange={(e) => setNewYear({ ...newYear, year: e.target.value })}
                        margin="normal"
                    />
                    <TextField
                        label="Start Date"
                        type="date"
                        fullWidth
                        value={newYear.startDate}
                        onChange={(e) => setNewYear({ ...newYear, startDate: e.target.value })}
                        margin="normal"
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        label="End Date"
                        type="date"
                        fullWidth
                        value={newYear.endDate}
                        onChange={(e) => setNewYear({ ...newYear, endDate: e.target.value })}
                        margin="normal"
                        InputLabelProps={{ shrink: true }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateYearDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateYear} variant="contained">Create</Button>
                </DialogActions>
            </Dialog>

            {/* ── MOVE HOLIDAY DIALOG ───────────────────────── */}
            <Dialog
                open={moveDialogOpen}
                onClose={() => setMoveDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Move Holiday to Another Year</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Moving: {holidayToMove?.name}
                    </Typography>
                    <FormControl fullWidth>
                        <Select
                            value={targetYearId}
                            onChange={(e) => setTargetYearId(e.target.value)}
                            displayEmpty
                        >
                            <MenuItem value="" disabled>Select target year</MenuItem>
                            {years.filter(y => y._id !== selectedYear?._id).map((year) => (
                                <MenuItem key={year._id} value={year._id}>
                                    {year.year}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleMoveHoliday}
                        variant="contained"
                        disabled={!targetYearId}
                    >
                        Move
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── MODALS ────────────────────────────────────── */}
            <HolidayFormPanel
                open={panelOpen}
                onClose={handlePanelClose}
                holiday={editingHoliday}
                yearId={selectedYear?._id}
                onSuccess={handlePanelSuccess}
            />

            <BulkUploadModal
                open={bulkUploadOpen}
                onClose={() => setBulkUploadOpen(false)}
                yearId={selectedYear?._id}
                year={selectedYear?.year}
                onSuccess={handleBulkUploadSuccess}
            />

            <CloneHolidaysModal
                open={cloneModalOpen}
                onClose={() => setCloneModalOpen(false)}
                years={years}
                onSuccess={() => {
                    showSnackbar('Holidays cloned successfully');
                    fetchYears();
                    if (selectedYear) fetchHolidays(selectedYear._id);
                }}
            />

            <DatasetUploadModal
                open={datasetModalOpen}
                onClose={() => setDatasetModalOpen(false)}
                onSuccess={() => showSnackbar('Dataset uploaded successfully')}
            />

            {/* ── SNACKBAR ──────────────────────────────────── */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={handleCloseSnackbar}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default HolidayManagementPage;
