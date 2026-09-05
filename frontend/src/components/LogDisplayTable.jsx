// frontend/src/components/LogDisplayTable.jsx

import React, { useState, Fragment } from 'react';
import {
    Box, Typography, TableContainer, Table, TableHead, TableRow, TableCell, TableBody,
    Chip, Collapse, IconButton
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { formatTimeForDisplay, formatDateForDisplay } from '../utils/attendanceRenderUtils';

const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    return formatTimeForDisplay(timeString);
};

const Row = ({ row }) => {
    const [open, setOpen] = useState(false);

    const totalWorkMinutes = (row.sessions || []).reduce((acc, session) => {
        if (session.start_time && session.end_time) {
            return acc + (new Date(session.end_time) - new Date(session.start_time));
        }
        return acc;
    }, 0) / (1000 * 60);

    return (
        <Fragment>
            <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
                <TableCell>
                    <IconButton aria-label="expand row" size="small" onClick={() => setOpen(!open)}>
                        {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                </TableCell>
                <TableCell component="th" scope="row">
                    {formatDateForDisplay(row.attendance_date, { weekday: 'long', month: 'short', day: 'numeric' })}
                </TableCell>
                <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        <Chip 
                            label={row.status || 'N/A'} 
                            color={
                                row.status === 'Present' || 
                                (row.sessions && row.sessions.length > 0) ? 'success' : 'warning'
                            } 
                            size="small" 
                        />
                        {row.leaveType && (
                            <Chip 
                                label={row.leaveType} 
                                size="small"
                                sx={{
                                    backgroundColor: row.leaveType === 'Comp Off' ? '#CCE5FF' : 
                                                   row.leaveType === 'Swap Leave' ? '#FFE5B4' : '#e3f2fd',
                                    color: row.leaveType === 'Comp Off' ? '#1976d2' : 
                                           row.leaveType === 'Swap Leave' ? '#f57c00' : '#0d47a1',
                                    fontSize: '0.7rem',
                                    height: '20px'
                                }}
                            />
                        )}
                    </Box>
                </TableCell>
                <TableCell align="right">{Math.floor(totalWorkMinutes / 60)}h {Math.round(totalWorkMinutes % 60)}m</TableCell>
            </TableRow>
            <TableRow>
                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                    <Collapse in={open} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                            <Typography variant="h6" gutterBottom component="div">Details</Typography>
                            { (row.sessions && row.sessions.length > 0 && row.sessions[0] !== null) ?
                                (<Box>
                                    <Typography variant="subtitle2">Work Sessions</Typography>
                                    {row.sessions.map((s, i) => (
                                        <Typography key={i} variant="body2" color="text.secondary">
                                            • {formatTime(s.start_time)} - {formatTime(s.end_time) || 'Active'}
                                        </Typography>
                                    ))}
                                </Box>) : <Typography variant="body2">No work sessions logged.</Typography>
                            }
                            { (Array.isArray(row.breaks) && row.breaks.length > 0 && row.breaks[0] !== null) ?
                                (<Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2">Breaks Taken</Typography>
                                    {row.breaks.map((b, i) => (
                                        <Typography key={i} variant="body2" color="text.secondary">
                                            • {formatTime(b.start_time)} - {formatTime(b.end_time)} ({b.duration}m, {b.type})
                                        </Typography>
                                    ))}
                                </Box>) : <Typography variant="body2" sx={{mt:1}}>No breaks logged.</Typography>
                            }
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </Fragment>
    );
};

// This is the "Dumb" component. It just takes logs and displays them.
const LogDisplayTable = ({ logs }) => {
    if (!logs) {
        return <Typography>No data to display.</Typography>;
    }
    if (logs.length === 0) {
        return <Typography sx={{p: 2, textAlign: 'center'}}>No logs found for this period.</Typography>;
    }

    return (
        <TableContainer>
            <Table aria-label="collapsible table">
                <TableHead>
                    <TableRow>
                        <TableCell />
                        <TableCell>Date</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Total Work</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {logs.map((row) => <Row key={row.id} row={row} />)}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

export default LogDisplayTable;