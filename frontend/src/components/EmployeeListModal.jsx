// frontend/src/components/EmployeeListModal.jsx
import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem, ListItemAvatar, ListItemText, Avatar, Typography, Box, Chip, Alert, Divider, Stack } from '@mui/material';
import {
    Person as PersonIcon,
    AccessTime as AccessTimeIcon,
    Work as WorkIcon,
    Business as BusinessIcon,
    Notes as NotesIcon
} from '@mui/icons-material';
import api from '../api/axios';
import { formatISTTime, formatISTDate } from '../utils/istTime';
import { SkeletonBox } from '../components/SkeletonLoaders';
const EmployeeListModal = ({ open, onClose, cardType, cardTitle }) => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [total, setTotal] = useState(null);

    const PAGE_SIZE = 50; // Hard cap keeps UI smooth (no virtualization needed)

    useEffect(() => {
        if (open && cardType) {
            // Reset pagination each time modal opens / cardType changes
            setEmployees([]);
            setPage(1);
            setHasMore(false);
            setTotal(null);
            fetchEmployees(1, true);
        }
    }, [open, cardType]);

    const fetchEmployees = async (pageToFetch = 1, isInitial = false) => {
        if (isInitial) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        if (isInitial) setError('');
        try {
            const { data } = await api.get(`/admin/dashboard-employees/${cardType}`, {
                params: { page: pageToFetch, limit: PAGE_SIZE }
            });

            // Backward-compatible handling:
            // - New paged response: { items, page, limit, total, hasMore }
            // - Legacy response: array
            const items = Array.isArray(data) ? data : (data?.items || []);
            const nextHasMore = Array.isArray(data) ? (items.length === PAGE_SIZE) : !!data?.hasMore;
            const nextTotal = Array.isArray(data) ? null : (typeof data?.total === 'number' ? data.total : null);

            setTotal(nextTotal);
            setHasMore(nextHasMore);
            setPage(pageToFetch);

            setEmployees(prev => (pageToFetch === 1 ? items : [...prev, ...items]));
        } catch (err) {
            console.error('Error fetching employees:', err);
            setError('Failed to load employee list');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const formatTime = (timeString) => {
        if (!timeString) return 'N/A';
        return formatISTTime(timeString, { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Present': return 'default';
            case 'Late': return 'default';
            case 'On Leave': return 'default';
            case 'Absent': return 'error';
            default: return 'default';
        }
    };
    
    const getStatusStyle = (status) => {
        switch (status) {
            case 'Present': 
                return { 
                    backgroundColor: '#4CAF50', 
                    color: 'white',
                    border: '1px solid #4CAF50'
                };
            case 'Late': 
                return { 
                    backgroundColor: '#FF9800', 
                    color: 'white',
                    border: '1px solid #FF9800'
                };
            case 'On Leave': 
                return { 
                    backgroundColor: '#D32F2F', 
                    color: 'white',
                    border: '1px solid #D32F2F'
                };
            case 'Absent':
                return {
                    backgroundColor: '#ef4444',
                    color: 'white',
                    border: '1px solid #ef4444'
                };
            default: 
                return { 
                    backgroundColor: '#757575', 
                    color: 'white',
                    border: '1px solid #757575'
                };
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Present': return <WorkIcon fontSize="small" />;
            case 'Late': return <AccessTimeIcon fontSize="small" />;
            case 'On Leave': return <PersonIcon fontSize="small" />;
            case 'Absent': return <PersonIcon fontSize="small" />;
            default: return <PersonIcon fontSize="small" />;
        }
    };

    const renderEmployeeItem = (employee) => (
        <ListItem key={employee._id} sx={{ 
            py: 2.5, 
            px: 3,
            alignItems: 'flex-start',
            '&:hover': {
                backgroundColor: '#F8F9FA',
                transform: 'translateY(-2px)',
                boxShadow: '0 6px 20px rgba(211, 47, 47, 0.15)'
            },
            transition: 'all 0.3s ease-in-out'
        }}>
            <ListItemAvatar sx={{ minWidth: '70px' }}>
                <Avatar 
                    sx={{ 
                        width: 60, 
                        height: 60,
                        backgroundColor: '#D32F2F',
                        fontSize: '1.3rem',
                        fontWeight: 700,
                        border: '3px solid white',
                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.2)'
                    }}
                >
                    {employee.fullName?.charAt(0)?.toUpperCase()}
                </Avatar>
            </ListItemAvatar>
            <ListItemText
                primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="h6" sx={{ 
                            fontWeight: 700, 
                            color: '#212121',
                            fontSize: '1.1rem'
                        }}>
                            {employee.fullName}
                        </Typography>
                        {employee.status && (
                            <Chip
                                icon={getStatusIcon(employee.status)}
                                label={employee.status}
                                size="small"
                                sx={{
                                    ...getStatusStyle(employee.status),
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    height: '28px',
                                    borderRadius: '14px'
                                }}
                            />
                        )}
                    </Box>
                }
                secondary={
                    <Box sx={{ mt: 1.5 }}>
                        {/* Main info grid */}
                        <Box sx={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                            gap: 2,
                            mb: 2
                        }}>
                            {/* Left column */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ 
                                        width: 6, 
                                        height: 6, 
                                        borderRadius: '50%', 
                                        backgroundColor: '#D32F2F' 
                                    }} />
                                    <Typography variant="body2" sx={{ 
                                        color: '#757575',
                                        fontSize: '0.9rem',
                                        fontWeight: 500
                                    }}>
                                        <Box component="span" sx={{ 
                                            fontWeight: 700, 
                                            color: '#424242',
                                            minWidth: '90px',
                                            display: 'inline-block'
                                        }}>
                                            Employee ID:
                                        </Box>
                                        {employee.employeeCode}
                                    </Typography>
                                </Box>
                                
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ 
                                        width: 6, 
                                        height: 6, 
                                        borderRadius: '50%', 
                                        backgroundColor: '#D32F2F' 
                                    }} />
                                    <Typography variant="body2" sx={{ 
                                        color: '#757575',
                                        fontSize: '0.9rem',
                                        fontWeight: 500
                                    }}>
                                        <Box component="span" sx={{ 
                                            fontWeight: 700, 
                                            color: '#424242',
                                            minWidth: '90px',
                                            display: 'inline-block'
                                        }}>
                                            Designation:
                                        </Box>
                                        {employee.designation || 'N/A'}
                                    </Typography>
                                </Box>
                                
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ 
                                        width: 6, 
                                        height: 6, 
                                        borderRadius: '50%', 
                                        backgroundColor: '#D32F2F' 
                                    }} />
                                    <Typography variant="body2" sx={{ 
                                        color: '#757575',
                                        fontSize: '0.9rem',
                                        fontWeight: 500
                                    }}>
                                        <Box component="span" sx={{ 
                                            fontWeight: 700, 
                                            color: '#424242',
                                            minWidth: '90px',
                                            display: 'inline-block'
                                        }}>
                                            Department:
                                        </Box>
                                        {employee.department || 'N/A'}
                                    </Typography>
                                </Box>
                            </Box>
                            
                            {/* Right column */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {employee.role && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ 
                                            width: 6, 
                                            height: 6, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#D32F2F' 
                                        }} />
                                        <Typography variant="body2" sx={{ 
                                            color: '#757575',
                                            fontSize: '0.9rem',
                                            fontWeight: 500
                                        }}>
                                            <Box component="span" sx={{ 
                                                fontWeight: 700, 
                                                color: '#424242',
                                                minWidth: '90px',
                                                display: 'inline-block'
                                            }}>
                                                Role:
                                            </Box>
                                            {employee.role}
                                        </Typography>
                                    </Box>
                                )}
                                
                                {employee.employmentStatus && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ 
                                            width: 6, 
                                            height: 6, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#D32F2F' 
                                        }} />
                                        <Typography variant="body2" sx={{ 
                                            color: '#757575',
                                            fontSize: '0.9rem',
                                            fontWeight: 500
                                        }}>
                                            <Box component="span" sx={{ 
                                                fontWeight: 700, 
                                                color: '#424242',
                                                minWidth: '90px',
                                                display: 'inline-block'
                                            }}>
                                                Employment:
                                            </Box>
                                            {employee.employmentStatus}
                                        </Typography>
                                    </Box>
                                )}
                                
                                {employee.joiningDate && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ 
                                            width: 6, 
                                            height: 6, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#D32F2F' 
                                        }} />
                                        <Typography variant="body2" sx={{ 
                                            color: '#757575',
                                            fontSize: '0.9rem',
                                            fontWeight: 500
                                        }}>
                                            <Box component="span" sx={{ 
                                                fontWeight: 700, 
                                                color: '#424242',
                                                minWidth: '90px',
                                                display: 'inline-block'
                                            }}>
                                                Joined:
                                            </Box>
                                            {formatISTDate(employee.joiningDate)}
                                        </Typography>
                                    </Box>
                                )}
                                
                                {employee.clockInTime && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ 
                                            width: 6, 
                                            height: 6, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#4CAF50' 
                                        }} />
                                        <Typography variant="body2" sx={{ 
                                            color: '#757575',
                                            fontSize: '0.9rem',
                                            fontWeight: 500
                                        }}>
                                            <Box component="span" sx={{ 
                                                fontWeight: 700, 
                                                color: '#424242',
                                                minWidth: '90px',
                                                display: 'inline-block'
                                            }}>
                                                Clock In:
                                            </Box>
                                            {formatTime(employee.clockInTime)}
                                        </Typography>
                                    </Box>
                                )}
                                
                                {employee.leaveType && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ 
                                            width: 6, 
                                            height: 6, 
                                            borderRadius: '50%', 
                                            backgroundColor: '#FF9800' 
                                        }} />
                                        <Typography variant="body2" sx={{ 
                                            color: '#757575',
                                            fontSize: '0.9rem',
                                            fontWeight: 500
                                        }}>
                                            <Box component="span" sx={{ 
                                                fontWeight: 700, 
                                                color: '#424242',
                                                minWidth: '90px',
                                                display: 'inline-block'
                                            }}>
                                                Leave Type:
                                            </Box>
                                            {employee.leaveType}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                        
                        {/* Special information boxes */}
                        {(employee.leaveReason || employee.notes) && (
                            <Box sx={{ mt: 2 }}>
                                {employee.leaveReason && (
                                    <Box sx={{ 
                                        p: 2.5, 
                                        backgroundColor: '#FFF8E1', 
                                        borderRadius: 3,
                                        border: '1px solid #FFC107',
                                        mb: employee.notes ? 2 : 0,
                                        boxShadow: '0 2px 8px rgba(255, 193, 7, 0.1)'
                                    }}>
                                        <Typography variant="body2" sx={{ 
                                            display: 'flex', 
                                            alignItems: 'flex-start', 
                                            gap: 1.5,
                                            color: '#E65100',
                                            fontSize: '0.9rem',
                                            fontWeight: 500
                                        }}>
                                            <NotesIcon fontSize="small" sx={{ mt: 0.3, color: '#FF9800' }} />
                                            <Box>
                                                <Box component="span" sx={{ 
                                                    fontWeight: 700,
                                                    display: 'block',
                                                    mb: 0.5
                                                }}>
                                                    Leave Reason:
                                                </Box>
                                                <Box component="span" sx={{ 
                                                    lineHeight: 1.5,
                                                    fontStyle: 'italic'
                                                }}>
                                                    {employee.leaveReason}
                                                </Box>
                                            </Box>
                                        </Typography>
                                    </Box>
                                )}
                                
                                {employee.notes && (
                                    <Box sx={{ 
                                        p: 2.5, 
                                        backgroundColor: '#E8F5E8', 
                                        borderRadius: 3,
                                        border: '1px solid #4CAF50',
                                        boxShadow: '0 2px 8px rgba(76, 175, 80, 0.1)'
                                    }}>
                                        <Typography variant="body2" sx={{ 
                                            display: 'flex', 
                                            alignItems: 'flex-start', 
                                            gap: 1.5,
                                            color: '#2E7D32',
                                            fontSize: '0.9rem',
                                            fontWeight: 500
                                        }}>
                                            <NotesIcon fontSize="small" sx={{ mt: 0.3, color: '#4CAF50' }} />
                                            <Box>
                                                <Box component="span" sx={{ 
                                                    fontWeight: 700,
                                                    display: 'block',
                                                    mb: 0.5
                                                }}>
                                                    Additional Notes:
                                                </Box>
                                                <Box component="span" sx={{ 
                                                    lineHeight: 1.5,
                                                    fontStyle: 'italic'
                                                }}>
                                                    {employee.notes}
                                                </Box>
                                            </Box>
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Box>
                }
            />
        </ListItem>
    );

    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            maxWidth="lg" 
            fullWidth
            PaperProps={{
                sx: { 
                    borderRadius: 3, 
                    minHeight: '70vh',
                    maxHeight: '90vh',
                    boxShadow: '0 8px 32px rgba(211, 47, 47, 0.1)',
                    border: '1px solid #E0E0E0',
                    display: 'flex',
                    flexDirection: 'column'
                }
            }}
        >
            <DialogTitle sx={{ 
                pb: 2, 
                pt: 3, 
                px: 3,
                background: 'linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%)',
                color: 'white',
                borderBottom: '3px solid rgba(255, 255, 255, 0.2)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <PersonIcon sx={{ color: 'white', fontSize: '1.5rem' }} />
                    <Typography variant="h6" component="div" sx={{ 
                        color: 'white', 
                        fontWeight: 700,
                        letterSpacing: '0.5px'
                    }}>
                        {cardTitle} - Employee Details
                    </Typography>
                </Box>
                <Typography variant="body2" sx={{ 
                    mt: 1, 
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontWeight: 500
                }}>
                    {employees.length} employee{employees.length !== 1 ? 's' : ''} found
                    {typeof total === 'number' ? ` (showing ${employees.length} of ${total})` : ''}
                </Typography>
            </DialogTitle>
            
            <Divider />
            
            <DialogContent sx={{ 
                p: 0, 
                backgroundColor: '#FAFAFA',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {loading && (
                    <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        flex: 1,
                        backgroundColor: '#FAFAFA'
                    }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                            <Typography variant="body2" sx={{ color: '#757575' }}>
                                Loading employee details...
                            </Typography>
                        </Box>
                    </Box>
                )}
                
                {error && (
                    <Box sx={{ p: 3, flex: 1, display: 'flex', alignItems: 'center' }}>
                        <Alert 
                            severity="error" 
                            sx={{ 
                                borderRadius: 2,
                                backgroundColor: '#FFEBEE',
                                border: '1px solid #D32F2F',
                                width: '100%'
                            }}
                        >
                            {error}
                        </Alert>
                    </Box>
                )}
                
                {!loading && !error && employees.length === 0 && (
                    <Box sx={{ 
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 4,
                        backgroundColor: '#FAFAFA'
                    }}>
                        <PersonIcon sx={{ 
                            fontSize: 80, 
                            color: '#BDBDBD', 
                            mb: 3 
                        }} />
                        <Typography variant="h5" sx={{ 
                            color: '#424242',
                            fontWeight: 600,
                            mb: 2
                        }}>
                            No employees found
                        </Typography>
                        <Typography variant="body1" sx={{ 
                            color: '#757575',
                            maxWidth: '400px',
                            textAlign: 'center',
                            lineHeight: 1.6
                        }}>
                            There are no employees in this category at the moment.
                        </Typography>
                    </Box>
                )}
                
                {!loading && !error && employees.length > 0 && (
                    <Box sx={{ 
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        {/* Header with count */}
                        <Box sx={{ 
                            p: 2, 
                            backgroundColor: 'white',
                            borderBottom: '1px solid #E0E0E0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <Typography variant="body2" sx={{ 
                                color: '#757575',
                                fontWeight: 500
                            }}>
                                Showing {employees.length} employee{employees.length !== 1 ? 's' : ''}
                            </Typography>
                            <Typography variant="body2" sx={{ 
                                color: '#D32F2F',
                                fontWeight: 600
                            }}>
                                {cardTitle}
                            </Typography>
                        </Box>
                        
                        {/* Scrollable list */}
                        <Box sx={{ 
                            flex: 1,
                            overflow: 'auto',
                            backgroundColor: '#FAFAFA'
                        }}>
                            <List sx={{ 
                                p: 2,
                                '& .MuiListItem-root': {
                                    backgroundColor: 'white',
                                    marginBottom: 2,
                                    borderRadius: 3,
                                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                                    border: '1px solid #E0E0E0',
                                    '&:last-child': {
                                        marginBottom: 0
                                    }
                                }
                            }}>
                                {employees.map((employee) => (
                                    renderEmployeeItem(employee)
                                ))}
                                {hasMore && (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                                        <Button
                                            variant="outlined"
                                            onClick={() => fetchEmployees(page + 1, false)}
                                            disabled={loadingMore}
                                            sx={{
                                                borderColor: '#D32F2F',
                                                color: '#D32F2F',
                                                fontWeight: 600,
                                                textTransform: 'none',
                                                '&:hover': {
                                                    borderColor: '#B71C1C',
                                                    backgroundColor: 'rgba(211, 47, 47, 0.06)'
                                                }
                                            }}
                                        >
                                            {loadingMore ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : 'Load more'}
                                        </Button>
                                    </Box>
                                )}
                            </List>
                        </Box>
                    </Box>
                )}
            </DialogContent>
            
            <Divider />
            
            <DialogActions sx={{ 
                p: 3, 
                backgroundColor: '#FAFAFA',
                borderTop: '1px solid #E0E0E0'
            }}>
                <Button 
                    onClick={onClose} 
                    variant="contained"
                    sx={{
                        backgroundColor: '#D32F2F',
                        color: 'white',
                        borderRadius: 2,
                        px: 4,
                        py: 1,
                        fontWeight: 600,
                        textTransform: 'none',
                        fontSize: '0.95rem',
                        boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)',
                        '&:hover': {
                            backgroundColor: '#B71C1C',
                            boxShadow: '0 6px 16px rgba(211, 47, 47, 0.4)'
                        }
                    }}
                >
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EmployeeListModal;

