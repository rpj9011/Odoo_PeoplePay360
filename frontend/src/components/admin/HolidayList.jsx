import React from 'react';
import {
    Box,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';

const HolidayList = ({ holidays, onEdit, onDelete, onMove, onAdd, isLocked = false }) => {
    const formatDate = (date) => {
        if (!date) return 'TBD';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getTypeColor = (type) => {
        const colors = {
            'National': 'error',
            'Regional': 'warning',
            'Company': 'primary',
            'Optional': 'secondary'
        };
        return colors[type] || 'default';
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Holidays
                </Typography>
                <Button
                    startIcon={<AddIcon />}
                    variant="contained"
                    onClick={onAdd}
                    disabled={isLocked}
                    sx={{
                        borderRadius: '12px',
                        textTransform: 'none',
                        transition: 'all 150ms ease',
                        '&:hover': {
                            transform: 'translateY(-2px)'
                        }
                    }}
                >
                    Add Holiday
                </Button>
            </Box>

            <TableContainer
                component={Paper}
                sx={{
                    borderRadius: '16px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    border: '1px solid #f0f0f0'
                }}
            >
                <Table>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#fafafa' }}>
                            <TableCell sx={{ fontWeight: 600, fontSize: '14px' }}>Holiday Name</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '14px' }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '14px' }}>Day</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '14px' }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 600, fontSize: '14px' }}>Applies To</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, fontSize: '14px' }}>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {holidays.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">
                                        No holidays found. Click "Add Holiday" to create one.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            holidays.map((holiday) => (
                                <TableRow
                                    key={holiday._id}
                                    sx={{
                                        '&:hover': { bgcolor: '#fafafa' },
                                        transition: 'background-color 150ms ease'
                                    }}
                                >
                                    <TableCell sx={{ fontSize: '14px' }}>{holiday.name}</TableCell>
                                    <TableCell sx={{ fontSize: '14px' }}>{formatDate(holiday.date)}</TableCell>
                                    <TableCell sx={{ fontSize: '14px' }}>{holiday.day || '-'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={holiday.type || 'Company'}
                                            color={getTypeColor(holiday.type)}
                                            size="small"
                                            sx={{ fontSize: '12px' }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '14px' }}>{holiday.appliesTo || 'All'}</TableCell>
                                    <TableCell align="right">
                                        <IconButton
                                            size="small"
                                            onClick={() => onEdit(holiday)}
                                            disabled={isLocked}
                                            sx={{ mr: 0.5 }}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton
                                            size="small"
                                            onClick={() => onMove(holiday)}
                                            disabled={isLocked}
                                            sx={{ mr: 0.5 }}
                                        >
                                            <DriveFileMoveIcon fontSize="small" />
                                        </IconButton>
                                        <IconButton
                                            size="small"
                                            onClick={() => onDelete(holiday._id)}
                                            disabled={isLocked}
                                            color="error"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default HolidayList;
