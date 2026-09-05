// src/pages/ExcelViewerPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/axios';
import socket from '../socket'; // <-- NEW
import { Alert, Select, MenuItem, FormControl, InputLabel, Box, Typography } from '@mui/material';
import '../styles/ExcelViewerPage.css';

import { SkeletonBox } from '../components/SkeletonLoaders';
const ExcelViewerPage = () => {
    const [sheets, setSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState('');
    const [sheetData, setSheetData] = useState(null);
    const [headers, setHeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Fetch the data for the selected sheet
    const fetchSheetData = useCallback(async (sheet) => {
        if (!sheet) return;

        try {
            setLoading(true);
            setError('');
            const { data } = await api.get(`/admin/reports/excel-log/sheet-data?sheetName=${encodeURIComponent(sheet)}`);
            if (data && data.length > 0) {
                setHeaders(Object.keys(data[0]));
                setSheetData(data);
            } else {
                setHeaders([]);
                setSheetData([]); // Set to empty array to show "No data" message
            }
        } catch (err) {
            setError(`Failed to load data for sheet: ${sheet}`);
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch the list of sheet names when the component mounts
    useEffect(() => {
        const fetchSheetNames = async () => {
            try {
                setLoading(true);
                const { data } = await api.get('/admin/reports/excel-log/sheets');
                if (data && data.length > 0) {
                    setSheets(data);
                    // Select the latest sheet by default (assuming they are chronological)
                    const latestSheet = data[data.length - 1];
                    setSelectedSheet(latestSheet);
                    fetchSheetData(latestSheet); // Fetch data for the default sheet
                } else {
                    setError('No attendance data has been logged yet.');
                    setLoading(false);
                }
            } catch (err) {
                setError('Failed to load Excel sheet list. The log file may not exist yet.');
                console.error(err);
                setLoading(false);
            }
        };
        fetchSheetNames();
    }, [fetchSheetData]);

    // Set up WebSocket listener for real-time updates
    useEffect(() => {
        socket.connect();

        const onLogUpdate = (data) => {
            console.log('Log updated event received!', data);
            // If the updated sheet is the one we are viewing, refetch data
            if (data.sheetName === selectedSheet) {
                fetchSheetData(selectedSheet);
            }
            // If a new sheet was created, refetch the sheet list
            // Use functional update to avoid sheets dependency
            setSheets(prevSheets => {
                if (!prevSheets.includes(data.sheetName)) {
                    api.get('/admin/reports/excel-log/sheets').then(response => {
                        setSheets(response.data);
                    });
                }
                return prevSheets;
            });
        };

        socket.on('logUpdated', onLogUpdate);

        return () => {
            socket.off('logUpdated', onLogUpdate);
            socket.disconnect();
        };
    }, [selectedSheet, fetchSheetData]); // Removed sheets array dependency

    const handleSheetChange = (event) => {
        const newSheet = event.target.value;
        setSelectedSheet(newSheet);
        fetchSheetData(newSheet);
    };

    return (
        <div className="excel-viewer-container">
            <Typography variant="h4" component="h1" gutterBottom>
                Live Attendance Log Viewer
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {sheets.length > 0 && (
                <FormControl fullWidth sx={{ mb: 3, maxWidth: '400px' }}>
                    <InputLabel id="sheet-select-label">Select Sheet (Month)</InputLabel>
                    <Select
                        labelId="sheet-select-label"
                        id="sheet-select"
                        value={selectedSheet}
                        label="Select Sheet (Month)"
                        onChange={handleSheetChange}
                    >
                        {sheets.map(name => (
                            <MenuItem key={name} value={name}>{name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <SkeletonBox width="24px" height="24px" borderRadius="50%" />
                </Box>
            ) : sheetData && (
                <div className="table-wrapper">
                    {sheetData.length > 0 ? (
                        <table>
                            <thead>
                                <tr>
                                    {headers.map(header => <th key={header}>{header}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {sheetData.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {headers.map(header => <td key={`${rowIndex}-${header}`}>{String(row[header] || '')}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <Typography sx={{ textAlign: 'center', p: 4 }}>No data found in this sheet.</Typography>
                    )}
                </div>
            )}
        </div>
    );
};

export default ExcelViewerPage;