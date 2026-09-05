// src/components/TodayAttendanceBar.jsx
import React, { useState, useEffect } from 'react';
import { Typography, Box, Paper, TextField, Button } from '@mui/material';

// Helper to calculate net work duration (sessions minus breaks)
const calculateTodayDuration = (todayLog) => {
    if (!todayLog || !todayLog.sessions?.length) return '00:00:00';

    const now = new Date();
    const totalSessionMs = todayLog.sessions.reduce((acc, s) => {
        const start = new Date(s.startTime);
        const end = s.endTime ? new Date(s.endTime) : now;
        return acc + (end - start);
    }, 0);

    const totalBreakMs = (todayLog.breaks || []).reduce((acc, b) => {
        const start = new Date(b.startTime);
        const end = b.endTime ? new Date(b.endTime) : now;
        return acc + (end - start);
    }, 0);

    const netMs = Math.max(0, totalSessionMs - totalBreakMs);
    const totalSecs = Math.floor(netMs / 1000);
    const hours = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSecs % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
};

const TodayAttendanceBar = ({ todayLog, onSaveNote, now }) => {
    const [noteText, setNoteText] = useState(todayLog?.notes || '');
    
    // The checkoutTime is recalculated on each render, driven by the parent's `now` prop.
    const checkoutTime = calculateTodayDuration(todayLog);

    useEffect(() => {
        setNoteText(todayLog?.notes || '');
    }, [todayLog?.notes]);

    useEffect(() => {
        if (typeof onSaveNote === 'function' && noteText !== (todayLog?.notes || '')) {
            const handler = setTimeout(() => {
                if (todayLog?._id) {
                    onSaveNote(todayLog._id, noteText);
                }
            }, 750);
            return () => clearTimeout(handler);
        }
    }, [noteText, todayLog, onSaveNote]);

    return (
        <Paper 
            elevation={0}
            sx={{
                p: '12px 24px',
                border: '1px solid #eef2f6',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 3
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body1" fontWeight={500}>Morning [ 10:00 AM - 7:00 PM ]</Typography>
                <TextField
                    placeholder="Add notes for check-out"
                    variant="outlined"
                    size="small"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                />
            </Box>
            <Box>
                <Button
                    variant="contained"
                    sx={{
                        backgroundColor: '#D32F2F',
                        '&:hover': { backgroundColor: '#B71C1C' },
                        color: 'white',
                        fontWeight: 600,
                        textTransform: 'none',
                        borderRadius: '8px',
                        boxShadow: 'none',
                    }}
                >
                    Check-out {checkoutTime} Hrs
                </Button>
            </Box>
        </Paper>
    );
};

export default TodayAttendanceBar;