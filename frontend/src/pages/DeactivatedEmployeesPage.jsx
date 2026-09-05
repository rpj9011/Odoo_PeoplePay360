// frontend/src/pages/DeactivatedEmployeesPage.jsx

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { Typography, Button, Alert, Chip, Snackbar, Dialog, DialogTitle, DialogContent, DialogActions, Box, Avatar, Tooltip, IconButton, InputAdornment, OutlinedInput, TablePagination, Switch, Stack } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EmployeeForm from '../components/EmployeeForm';
import AdminEmployeeProfileDialog from '../components/AdminEmployeeProfileDialog';
import PageHeroHeader from '../components/PageHeroHeader';
import socket from '../socket';
import '../styles/EmployeesPage.css';

import { SkeletonBox } from '../components/SkeletonLoaders';

// --- HELPER FUNCTIONS ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('en-GB', options).replace(/ /g, '-');
};

// --- SORTING HELPER FUNCTIONS ---
function descendingComparator(a, b, orderBy) {
    const valA = a[orderBy] || '';
    const valB = b[orderBy] || '';
    if (valB < valA) return -1;
    if (valB > valA) return 1;
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
    if (order !== 0) return order;
    return a[1] - b[1];
  });
  return stabilizedThis.map((el) => el[0]);
}

const headCells = [
  { id: 'employeeCode', numeric: false, label: 'Employee ID' },
  { id: 'fullName', numeric: false, label: 'Name' },
  { id: 'joiningDate', numeric: false, label: 'Joining Date' },
  { id: 'role', numeric: false, label: 'Role' },
  { id: 'isActive', numeric: false, label: 'Status' },
  { id: 'actions', numeric: true, disableSorting: true, label: 'Actions' },
];

const DeactivatedEmployeesPage = () => {
    const navigate = useNavigate();
    const [employees, setEmployees] = useState([]);
    const [allShifts, setAllShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
    const [deleteDialog, setDeleteDialog] = useState({ open: false, employee: null });
    const [updatingStatus, setUpdatingStatus] = useState({});
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [profileDialog, setProfileDialog] = useState({ open: false, employee: null, mode: 'view' });
    const initialLoadRef = useRef(true);
    const searchDebounceRef = useRef(null);
    const allEmployeesRef = useRef([]);
    
    // State for dynamic features
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [totalCount, setTotalCount] = useState(0);
    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('fullName');
    const [searchQuery, setSearchQuery] = useState('');

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery !== searchDebounceRef.current) {
                searchDebounceRef.current = searchQuery;
                setPage(0); // Reset to first page on search
                fetchInitialData();
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchInitialData = useCallback(async () => {
        const useInitialLoader = initialLoadRef.current;
        const currentSearch = searchDebounceRef.current || '';
        const isSearching = currentSearch.length > 0;
        
        if (useInitialLoader) {
            setLoading(true);
        } else if (!isSearching) {
            setIsRefreshing(true);
        }
        
        try {
            const shouldFetchAll = isSearching;
            
            const [empsRes, shiftsRes] = await Promise.all([
                shouldFetchAll 
                    ? api.get('/admin/employees?all=true&status=inactive')
                    : api.get(`/admin/employees?page=${page + 1}&limit=${rowsPerPage}&status=inactive`),
                api.get('/admin/shifts'),
            ]);
            
            // Handle paginated or all employees response
            if (shouldFetchAll) {
                const allEmps = Array.isArray(empsRes.data) ? empsRes.data : [];
                setEmployees(allEmps);
                allEmployeesRef.current = allEmps;
                setTotalCount(allEmps.length);
            } else {
                let emps = [];
                if (empsRes.data.employees) {
                    emps = Array.isArray(empsRes.data.employees) ? empsRes.data.employees : [];
                    setTotalCount(empsRes.data.totalCount || 0);
                } else {
                    emps = Array.isArray(empsRes.data) ? empsRes.data : [];
                    setTotalCount(emps.length);
                }
                setEmployees(emps);
                allEmployeesRef.current = [];
            }
            
            // Handle paginated response for shifts
            if (shiftsRes.data.shifts) {
                setAllShifts(Array.isArray(shiftsRes.data.shifts) ? shiftsRes.data.shifts : []);
            } else {
                setAllShifts(Array.isArray(shiftsRes.data) ? shiftsRes.data : []);
            }
        } catch (err) {
            setError('Failed to fetch deactivated employees.');
            console.error(err);
        } finally {
            if (useInitialLoader) {
                setLoading(false);
                initialLoadRef.current = false;
            } else {
                setIsRefreshing(false);
            }
        }
    }, [page, rowsPerPage]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);
    
    // Listen for attendance_log_updated events
    useEffect(() => {
        if (!socket) return;

        const handleAttendanceUpdate = () => {
            console.log('[DeactivatedEmployeesPage] Received attendance_log_updated event, refreshing data');
            fetchInitialData();
        };

        socket.on('attendance_log_updated', handleAttendanceUpdate);

        const handleVisibilityChange = () => {
            if (!document.hidden && socket.disconnected) {
                console.log('[DeactivatedEmployeesPage] Socket disconnected, refreshing on visibility change');
                fetchInitialData();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            socket.off('attendance_log_updated', handleAttendanceUpdate);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchInitialData]);

    const handleOpenForm = (employee = null) => {
        setSelectedEmployee(employee);
        setIsFormOpen(true);
    };

    const handleOpenProfileDialog = (employee, mode = 'view') => {
        setProfileDialog({ open: true, employee, mode });
    };

    const handleNavigateToCIF = (employee, event) => {
        if (event && event.stopPropagation) event.stopPropagation();
        navigate(`/admin/cif/employee/${employee._id}`);
    };

    const handleCloseProfileDialog = () => {
        setProfileDialog({ open: false, employee: null, mode: 'view' });
    };

    const handleOpenAdvancedEditor = () => {
        if (!profileDialog.employee) return;
        const employeeRecord = profileDialog.employee;
        handleCloseProfileDialog();
        setTimeout(() => handleOpenForm(employeeRecord), 0);
    };
    
    const handleCloseForm = () => {
        setSelectedEmployee(null);
        setIsFormOpen(false);
    };

    const handleSaveEmployee = async (employeeData) => {
        try {
            if (selectedEmployee) {
                const { data } = await api.put(`/admin/employees/${selectedEmployee._id}`, employeeData);
                setSnackbar({ open: true, message: data.message || 'Employee updated successfully!', severity: 'success' });
            } else {
                const { data } = await api.post('/admin/employees', employeeData);
                setSnackbar({ open: true, message: data.message || 'Employee added successfully!', severity: 'success' });
            }
            await fetchInitialData();
            handleCloseForm();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to save employee.', severity: 'error' });
        }
    };

    const confirmDeleteEmployee = async () => {
        const employeeToDelete = deleteDialog.employee;
        if (!employeeToDelete) return;
        try {
            await api.delete(`/admin/employees/${employeeToDelete._id}`);
            setSnackbar({ open: true, message: 'Employee deleted successfully!', severity: 'success' });
            setDeleteDialog({ open: false, employee: null });
            await fetchInitialData();
        } catch (err) {
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to delete employee.', severity: 'error' });
        }
    };

    const handleToggleActive = async (employee, event) => {
        if (event && event.stopPropagation) event.stopPropagation();

        const id = employee._id;
        const newValue = !employee.isActive;
        setUpdatingStatus(prev => ({ ...prev, [id]: true }));
        try {
            await api.put(`/admin/employees/${id}`, { isActive: newValue });
            setSnackbar({ open: true, message: `${employee.fullName} has been ${newValue ? 'activated' : 'deactivated'}.`, severity: 'success' });
            await fetchInitialData();
        } catch (err) {
            console.error('Failed to update employee status:', err);
            setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to update status.', severity: 'error' });
        } finally {
            setUpdatingStatus(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleRequestSort = (property) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };
    
    const handleChangePage = (event, newPage) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const filteredEmployees = useMemo(() => {
        const currentSearch = searchDebounceRef.current || '';
        if (!currentSearch) return employees;
        
        const sourceEmployees = allEmployeesRef.current.length > 0 ? allEmployeesRef.current : employees;
        const searchLower = currentSearch.toLowerCase();
        
        return sourceEmployees.filter(employee =>
            employee.fullName?.toLowerCase().includes(searchLower) ||
            employee.employeeCode?.toLowerCase().includes(searchLower) ||
            employee.email?.toLowerCase().includes(searchLower)
        );
    }, [employees]);
    
    const visibleRows = useMemo(() => {
        const sorted = stableSort(filteredEmployees, getComparator(order, orderBy));
        const currentSearch = searchDebounceRef.current || '';
        
        if (currentSearch) {
            return sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
        }
        return sorted;
    }, [filteredEmployees, order, orderBy, page, rowsPerPage]);

    const actionArea = useMemo(() => (
        <Stack
            direction="row"
            spacing={1.5}
            flexWrap="wrap"
            alignItems="center"
            className="header-actions"
        >
            <OutlinedInput
                size="small"
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startAdornment={
                    <InputAdornment position="start">
                        <SearchIcon sx={{ color: '#6c757d', fontSize: '1.2rem' }} />
                    </InputAdornment>
                }
                endAdornment={
                    searchQuery && (
                        <InputAdornment position="end">
                            <IconButton
                                size="small"
                                onClick={() => setSearchQuery('')}
                                edge="end"
                                sx={{ padding: '4px' }}
                            >
                                <ClearIcon sx={{ fontSize: '1rem' }} />
                            </IconButton>
                        </InputAdornment>
                    )
                }
                sx={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    minWidth: '280px',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#dee2e6',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#adb5bd',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#D32F2F',
                        borderWidth: '2px',
                    },
                    '& input': {
                        padding: '8px 8px 8px 0',
                        fontSize: '0.9rem',
                    }
                }}
            />
            {isRefreshing && (
                <SkeletonBox width="22px" height="22px" borderRadius="50%" />
            )}
            <Button 
                variant="outlined" 
                onClick={() => navigate('/employees')} 
                startIcon={<ArrowBackIcon />}
                sx={{
                    borderColor: '#D32F2F',
                    color: '#D32F2F',
                    '&:hover': {
                        borderColor: '#B71C1C',
                        backgroundColor: 'rgba(211, 47, 47, 0.04)',
                    }
                }}
            >
                Back to Active Employees
            </Button>
        </Stack>
    ), [searchQuery, isRefreshing, navigate]);

    if (loading) return <div className="flex-center"><SkeletonBox width="24px" height="24px" borderRadius="50%" /></div>;

    return (
        <div className="employees-page">
            <PageHeroHeader
                eyebrow="People Directory"
                title="Deactivated Employees"
                description="View and manage deactivated employee records. You can reactivate employees from this page."
                actionArea={actionArea}
            />

            {error && <Alert severity="error" className="error-alert">{error}</Alert>}
            
            <div className="employees-card">
                <div className="employee-grid-table">
                    <div className="employee-grid-header">
                        <div className="grid-cell serial-number">S.No.</div>
                        {headCells.map((headCell) => (
                            !headCell.disableSorting ? (
                                <div key={headCell.id} className={`grid-cell ${headCell.id}`} onClick={() => handleRequestSort(headCell.id)}>
                                    {headCell.label}
                                    {orderBy === headCell.id && (
                                        <ArrowUpwardIcon className={`sort-arrow ${order}`} />
                                    )}
                                </div>
                            ) : (
                                <div key={headCell.id} className={`grid-cell ${headCell.id}`}>{headCell.label}</div>
                            )
                        ))}
                    </div>
                    <div className="employee-grid-body">
                        {visibleRows.length > 0 ? visibleRows.map((employee, index) => (
                            <div className="employee-grid-row" key={employee._id}>
                                <div className="grid-cell serial-number">{page * rowsPerPage + index + 1}</div>
                                <div className="grid-cell employeeCode">{employee.employeeCode}</div>
                                <div className="grid-cell fullName">
                                    <Avatar>{employee.fullName.charAt(0)}</Avatar>
                                    <div className="employee-text-info">
                                        <div className="employee-name">{employee.fullName}</div>
                                        <div className="employee-email">{employee.email}</div>
                                    </div>
                                </div>
                                <div className="grid-cell joiningDate">{formatDate(employee.joiningDate)}</div>
                                <div className="grid-cell role">{employee.role}</div>
                                <div className="grid-cell isActive">
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Switch
                                            checked={!!employee.isActive}
                                            onChange={(e) => handleToggleActive(employee, e)}
                                            color="primary"
                                            size="small"
                                        />
                                        {updatingStatus[employee._id] ? (
                                            <SkeletonBox width="16px" height="16px" borderRadius="50%" />
                                        ) : (
                                            <Chip label={employee.isActive ? 'Active' : 'Inactive'} color={employee.isActive ? 'success' : 'error'} size="small" variant="outlined" />
                                        )}
                                    </Box>
                                </div>
                                <div className="grid-cell actions">
                                    <Tooltip title="View Details">
                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenProfileDialog(employee, 'view'); }}>
                                            <VisibilityOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="View CIF Records">
                                        <IconButton 
                                            size="small" 
                                            onClick={(e) => handleNavigateToCIF(employee, e)}
                                            sx={{
                                                '&:hover': {
                                                    backgroundColor: 'rgba(220, 38, 38, 0.08)',
                                                    '& svg': {
                                                        color: '#DC2626'
                                                    }
                                                }
                                            }}
                                            aria-label="View CIF Records"
                                        >
                                            <DescriptionOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Edit Profile">
                                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenForm(employee); }}>
                                            <EditOutlinedIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteDialog({ open: true, employee })}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                                </div>
                            </div>
                        )) : (
                            <div className="empty-state">No deactivated employees found.</div>
                        )}
                    </div>
                </div>
                
                <TablePagination
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    component="div"
                    count={(searchDebounceRef.current || '') ? filteredEmployees.length : totalCount}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </div>

            <EmployeeForm open={isFormOpen} onClose={handleCloseForm} onSave={handleSaveEmployee} employee={selectedEmployee} shifts={allShifts} />
            
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, employee: null })}>
                <DialogTitle>Confirm Delete</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete employee "{deleteDialog.employee?.fullName}"? 
                        This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog({ open: false, employee: null })}>
                        Cancel
                    </Button>
                    <Button onClick={confirmDeleteEmployee} color="error" variant="contained">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} variant="filled">{snackbar.message}</Alert>
            </Snackbar>

            <AdminEmployeeProfileDialog
                open={profileDialog.open}
                mode={profileDialog.mode}
                employee={profileDialog.employee}
                onClose={handleCloseProfileDialog}
                onSaved={async () => {
                    await fetchInitialData();
                    handleCloseProfileDialog();
                }}
                onOpenAdvancedEditor={profileDialog.employee ? handleOpenAdvancedEditor : undefined}
            />
        </div>
    );
};

export default DeactivatedEmployeesPage;
