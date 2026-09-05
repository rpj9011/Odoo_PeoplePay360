// src/components/HolidayBulkUploadModal.jsx
import React, { useState, memo } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Snackbar } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import * as XLSX from 'xlsx';
import api from '../api/axios';

import { SkeletonBox } from '../components/SkeletonLoaders';
const HolidayBulkUploadModal = memo(({ open, onClose, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState([]);
    const [errors, setErrors] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        // Validate file type
        const validTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
        ];
        
        if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(xlsx|xls)$/i)) {
            setSnackbar({ 
                open: true, 
                message: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)', 
                severity: 'error' 
            });
            return;
        }

        // Validate file size (max 5MB)
        if (selectedFile.size > 5 * 1024 * 1024) {
            setSnackbar({ 
                open: true, 
                message: 'File size exceeds 5MB limit', 
                severity: 'error' 
            });
            return;
        }

        setFile(selectedFile);
        parseExcelFile(selectedFile);
    };

    const parseExcelFile = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // Get first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    header: 1,
                    defval: '',
                    raw: false
                });

                if (jsonData.length < 2) {
                    setSnackbar({ 
                        open: true, 
                        message: 'Excel file is empty or has no data rows', 
                        severity: 'error' 
                    });
                    return;
                }

                // Validate headers (case-insensitive, order doesn't matter)
                const headers = jsonData[0].map(h => String(h).trim());
                const expectedHeaders = ['S.No', 'Date', 'Day', 'Holiday'];
                const headerMap = {};
                headers.forEach((h, i) => {
                    const normalized = h.toLowerCase();
                    expectedHeaders.forEach(expected => {
                        if (normalized === expected.toLowerCase()) {
                            headerMap[expected] = i;
                        }
                    });
                });

                const missingHeaders = expectedHeaders.filter(h => headerMap[h] === undefined);
                if (missingHeaders.length > 0) {
                    setSnackbar({ 
                        open: true, 
                        message: `Missing required headers: ${missingHeaders.join(', ')}`, 
                        severity: 'error' 
                    });
                    return;
                }

                // Helper function to parse flexible date formats
                const parseFlexibleDate = (dateStr, currentYear = new Date().getFullYear()) => {
                    if (!dateStr) return null;
                    
                    const normalized = String(dateStr).trim();
                    
                    // Check for "Not Yet decided" (case-insensitive)
                    if (/not\s+yet\s+decided/i.test(normalized)) {
                        return { date: null, isTentative: true };
                    }
                    
                    // Try Excel serial date first
                    if (!isNaN(normalized) && parseFloat(normalized) > 25569) {
                        const excelEpoch = new Date(1900, 0, 1);
                        const days = parseFloat(normalized) - 2;
                        const parsedDate = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
                        if (!isNaN(parsedDate.getTime())) {
                            return { date: parsedDate, isTentative: false };
                        }
                    }
                    
                    // Try parsing as full date (YYYY-MM-DD, DD-MM-YYYY, etc.)
                    let parsedDate = new Date(normalized);
                    if (!isNaN(parsedDate.getTime())) {
                        return { date: parsedDate, isTentative: false };
                    }
                    
                    // Try parsing as "DD-MMM" format (e.g., "26-Jan", "3-Mar")
                    const dayMonthMatch = normalized.match(/^(\d{1,2})[-/](\w{3,})$/i);
                    if (dayMonthMatch) {
                        const day = parseInt(dayMonthMatch[1]);
                        const monthStr = dayMonthMatch[2].toLowerCase();
                        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                        const monthIndex = monthNames.findIndex(m => monthStr.startsWith(m));
                        
                        if (monthIndex !== -1 && day >= 1 && day <= 31) {
                            const date = new Date(currentYear, monthIndex, day);
                            // Validate the date is valid (e.g., not Feb 30)
                            if (date.getDate() === day && date.getMonth() === monthIndex) {
                                return { date: date, isTentative: false };
                            }
                        }
                    }
                    
                    return null; // Invalid format
                };

                // Parse rows (skip header)
                const rows = jsonData.slice(1).filter(row => row.some(cell => cell));
                const parsedData = [];
                const validationErrors = [];
                const seenDates = new Set();
                const currentYear = new Date().getFullYear();

                rows.forEach((row, index) => {
                    const rowNum = index + 2; // +2 because we skip header and 1-indexed
                    
                    // Get values using header map (order doesn't matter)
                    const sno = row[headerMap['S.No']] ? String(row[headerMap['S.No']] || '').trim() : '';
                    const dateStr = row[headerMap['Date']] ? String(row[headerMap['Date']] || '').trim() : '';
                    const dayStr = row[headerMap['Day']] ? String(row[headerMap['Day']] || '').trim() : '';
                    const holidayName = row[headerMap['Holiday']] ? String(row[headerMap['Holiday']] || '').trim() : '';
                    
                    const rowErrors = [];

                    // Validate S.No (optional but should be numeric if present)
                    if (sno && isNaN(parseInt(sno))) {
                        rowErrors.push('S.No must be numeric');
                    }

                    // Parse Date with flexible format
                    let dateResult = null;
                    let formattedDate = null;
                    let isTentative = false;
                    
                    if (!dateStr) {
                        rowErrors.push('Date is required');
                    } else {
                        dateResult = parseFlexibleDate(dateStr, currentYear);
                        
                        if (!dateResult) {
                            rowErrors.push('Invalid date format');
                        } else if (dateResult.isTentative) {
                            // "Not Yet decided" - date is null, isTentative = true
                            isTentative = true;
                            formattedDate = null;
                        } else {
                            // Valid date - format as YYYY-MM-DD
                            const year = dateResult.date.getFullYear();
                            const month = String(dateResult.date.getMonth() + 1).padStart(2, '0');
                            const day = String(dateResult.date.getDate()).padStart(2, '0');
                            formattedDate = `${year}-${month}-${day}`;
                            
                            // Check for duplicate dates in file (only for non-tentative)
                            if (seenDates.has(formattedDate)) {
                                rowErrors.push(`Duplicate date in file: ${formattedDate}`);
                            } else {
                                seenDates.add(formattedDate);
                            }

                            // Validate Day matches actual day of date (only if date is resolved)
                            if (dayStr) {
                                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                const actualDay = dayNames[dateResult.date.getDay()];
                                
                                // Allow multiple days (e.g., "Saturday & Monday")
                                const dayParts = dayStr.split(/[&,and]+/i).map(d => d.trim());
                                const hasActualDay = dayParts.some(d => d === actualDay);
                                
                                if (!hasActualDay && dayParts.length === 1) {
                                    // Only warn if single day doesn't match, but don't error
                                    // (user might have different timezone or calendar)
                                }
                            }
                        }
                    }

                    // Validate Holiday Name
                    if (!holidayName) {
                        rowErrors.push('Holiday name is required');
                    } else if (holidayName.length > 100) {
                        rowErrors.push('Holiday name exceeds 100 characters');
                    }

                    // Add to parsed data
                    parsedData.push({
                        rowNum,
                        date: formattedDate,
                        day: dayStr || null,
                        name: holidayName,
                        isTentative: isTentative,
                        errors: rowErrors
                    });
                });

                // Check for rows with errors
                const rowsWithErrors = parsedData.filter(row => row.errors && row.errors.length > 0);
                if (rowsWithErrors.length > 0) {
                    setErrors(rowsWithErrors);
                } else {
                    setErrors([]);
                }

                setPreviewData(parsedData);
            } catch (error) {
                console.error('Error parsing Excel:', error);
                setSnackbar({ 
                    open: true, 
                    message: 'Error parsing Excel file. Please check the format.', 
                    severity: 'error' 
                });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleDownloadSample = () => {
        const sampleData = [
            ['S.No', 'Date', 'Day', 'Holiday'],
            [1, '26-Jan', 'Monday', 'Republic Day'],
            [2, '3-Mar', 'Tuesday', 'Holi'],
            [3, '15-Aug', 'Saturday', 'Independence Day'],
            [4, 'Not Yet decided', 'Saturday & Monday', 'Diwali Amavasya (Laxmi Pujan)'],
            [5, '25-Dec', 'Thursday', 'Christmas'],
        ];

        const ws = XLSX.utils.aoa_to_sheet(sampleData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Holidays');
        
        // Set column widths
        ws['!cols'] = [
            { wch: 8 },  // S.No
            { wch: 12 }, // Date
            { wch: 12 }, // Day
            { wch: 25 }, // Holiday
        ];

        XLSX.writeFile(wb, 'holiday_template.xlsx');
    };

    const handleUpload = async () => {
        if (errors.length > 0 || previewData.length === 0) {
            setSnackbar({ 
                open: true, 
                message: 'Please fix all errors before uploading', 
                severity: 'error' 
            });
            return;
        }

        setUploading(true);
        try {
            const holidays = previewData.map(row => ({
                date: row.date,
                day: row.day,
                name: row.name.trim(),
                isTentative: row.isTentative || false
            }));

            const { data } = await api.post('/admin/holidays/bulk-upload', { holidays });
            
            setSnackbar({ 
                open: true, 
                message: `Successfully uploaded ${data.successCount} holiday(s). ${data.failureCount > 0 ? `${data.failureCount} failed.` : ''}`, 
                severity: 'success' 
            });
            
            // Reset form
            setFile(null);
            setPreviewData([]);
            setErrors([]);
            
            // Close modal after short delay
            setTimeout(() => {
                onSuccess();
            }, 1500);
        } catch (err) {
            const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to upload holidays';
            setSnackbar({ 
                open: true, 
                message: errorMsg, 
                severity: 'error' 
            });
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setPreviewData([]);
        setErrors([]);
        onClose();
    };

    return (
        <>
            <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <UploadFileIcon />
                        Upload Holidays from Excel
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                            Excel Format Requirements:
                        </Typography>
                        <Typography variant="body2" component="div">
                            • Headers: <strong>S.No, Date, Day, Holiday</strong> (case-insensitive, order doesn't matter)
                            <br />
                            • Date formats: <strong>26-Jan</strong>, <strong>3-Mar</strong>, <strong>2025-01-26</strong>, or <strong>Not Yet decided</strong>
                            <br />
                            • Day: Single day (e.g., Monday) or multiple days (e.g., Saturday & Monday)
                            <br />
                            • Holiday name: Required, max 100 characters
                        </Typography>
                    </Alert>

                    <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            onClick={handleDownloadSample}
                            size="small"
                        >
                            Download Sample Template
                        </Button>
                    </Box>

                    <Box sx={{ mb: 2 }}>
                        <input
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            id="holiday-file-upload"
                            type="file"
                            onChange={handleFileChange}
                        />
                        <label htmlFor="holiday-file-upload">
                            <Button
                                variant="outlined"
                                component="span"
                                startIcon={<UploadFileIcon />}
                                fullWidth
                            >
                                {file ? file.name : 'Choose Excel File (.xlsx or .xls)'}
                            </Button>
                        </label>
                    </Box>

                    {previewData.length > 0 && (
                        <Box sx={{ mt: 3 }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                Preview ({previewData.length} holiday(s))
                            </Typography>
                            {errors.length > 0 && (
                                <Alert severity="error" sx={{ mb: 2 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                        Validation Errors Found:
                                    </Typography>
                                    {errors.map((errorRow, idx) => (
                                        <Typography key={idx} variant="body2" component="div">
                                            Row {errorRow.rowNum}: {errorRow.errors.join('; ')}
                                        </Typography>
                                    ))}
                                </Alert>
                            )}
                            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                                <Table stickyHeader size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Row</TableCell>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Day</TableCell>
                                            <TableCell>Holiday Name</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {previewData.map((row, idx) => {
                                            const hasErrors = row.errors && row.errors.length > 0;
                                            return (
                                                <TableRow 
                                                    key={idx}
                                                    sx={{ 
                                                        bgcolor: hasErrors ? 'error.light' : 'transparent',
                                                        '&:hover': { bgcolor: hasErrors ? 'error.light' : 'action.hover' }
                                                    }}
                                                >
                                                    <TableCell>{row.rowNum}</TableCell>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            {row.date || 'Not Yet decided'}
                                                            {row.isTentative && (
                                                                <Chip 
                                                                    label="Tentative" 
                                                                    color="warning" 
                                                                    size="small"
                                                                    sx={{ height: 20, fontSize: '0.7rem' }}
                                                                />
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>{row.day || '-'}</TableCell>
                                                    <TableCell>{row.name}</TableCell>
                                                    <TableCell>
                                                        {hasErrors ? (
                                                            <Chip 
                                                                label="Error" 
                                                                color="error" 
                                                                size="small"
                                                                icon={<HighlightOffIcon />}
                                                            />
                                                        ) : (
                                                            <Chip 
                                                                label="Valid" 
                                                                color="success" 
                                                                size="small"
                                                                icon={<CheckCircleOutlineIcon />}
                                                            />
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={handleClose} disabled={uploading}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleUpload}
                        disabled={uploading || previewData.length === 0 || errors.length > 0}
                        startIcon={uploading ? <SkeletonBox width="16px" height="16px" borderRadius="50%" /> : <UploadFileIcon />}
                    >
                        {uploading ? 'Uploading...' : 'Upload Holidays'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert 
                    onClose={() => setSnackbar({ ...snackbar, open: false })} 
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </>
    );
});

HolidayBulkUploadModal.displayName = 'HolidayBulkUploadModal';

export default HolidayBulkUploadModal;

