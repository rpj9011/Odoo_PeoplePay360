import React, { useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Alert,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    LinearProgress,
    IconButton
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    Download as DownloadIcon,
    CheckCircle as CheckIcon,
    Error as ErrorIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import api from '../../api/axios';

const BulkUploadModal = ({ open, onClose, yearId, year, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [validationResults, setValidationResults] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    const handleFileSelect = async (selectedFile) => {
        setError('');
        setValidationResults(null);

        // Validate file type
        if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
            setError('Please upload an Excel file (.xlsx or .xls)');
            return;
        }

        // Validate file size (5MB max)
        if (selectedFile.size > 5 * 1024 * 1024) {
            setError('File size must be less than 5MB');
            return;
        }

        setFile(selectedFile);

        // Parse and validate Excel file
        try {
            const data = await parseExcelFile(selectedFile);
            const results = validateHolidays(data);
            setValidationResults(results);
        } catch (err) {
            setError(err.message || 'Failed to parse Excel file');
        }
    };

    const parseExcelFile = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                    resolve(jsonData);
                } catch (err) {
                    reject(new Error('Failed to parse Excel file. Please check the format.'));
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    };

    const validateHolidays = (data) => {
        const results = {
            valid: [],
            invalid: [],
            duplicates: []
        };

        const seenDates = new Set();

        data.forEach((row, index) => {
            const holiday = {
                name: row['Holiday Name'] || row['Name'] || '',
                date: row['Date'] || '',
                type: row['Type'] || 'Company',
                appliesTo: row['Applies To'] || row['AppliesTo'] || 'All',
                rowNumber: index + 2 // Excel row number (1-indexed + header)
            };

            const errors = [];

            // Validate name
            if (!holiday.name || holiday.name.trim() === '') {
                errors.push('Holiday name is required');
            }

            // Validate date
            if (!holiday.date) {
                errors.push('Date is required');
            } else {
                const dateStr = formatExcelDate(holiday.date);
                if (!isValidDate(dateStr)) {
                    errors.push('Invalid date format (use YYYY-MM-DD)');
                } else {
                    holiday.date = dateStr;
                    
                    // Check for duplicates
                    if (seenDates.has(dateStr)) {
                        errors.push('Duplicate date in file');
                        results.duplicates.push(holiday);
                    } else {
                        seenDates.add(dateStr);
                    }
                }
            }

            // Validate type
            if (!['National', 'Company', 'Optional'].includes(holiday.type)) {
                errors.push('Type must be National, Company, or Optional');
            }

            if (errors.length > 0) {
                holiday.errors = errors;
                results.invalid.push(holiday);
            } else {
                results.valid.push(holiday);
            }
        });

        return results;
    };

    const formatExcelDate = (excelDate) => {
        // Handle Excel serial date numbers
        if (typeof excelDate === 'number') {
            const date = XLSX.SSF.parse_date_code(excelDate);
            return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
        }
        
        // Handle string dates
        if (typeof excelDate === 'string') {
            // Try to parse various date formats
            const date = new Date(excelDate);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
        }
        
        return excelDate;
    };

    const isValidDate = (dateStr) => {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateStr)) return false;
        
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
    };

    const handleUpload = async () => {
        if (!validationResults || validationResults.valid.length === 0) {
            setError('No valid holidays to upload');
            return;
        }

        setUploading(true);
        setError('');

        try {
            const payload = {
                yearId,
                holidays: validationResults.valid.map(h => ({
                    name: h.name,
                    date: h.date,
                    type: h.type,
                    appliesTo: h.appliesTo
                }))
            };

            await api.post('/holidays/admin/bulk', payload);
            onSuccess();
            handleClose();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to upload holidays');
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setValidationResults(null);
        setError('');
        setDragActive(false);
        onClose();
    };

    const downloadTemplate = () => {
        const template = [
            {
                'Holiday Name': 'New Year',
                'Date': '2025-01-01',
                'Type': 'National',
                'Applies To': 'All'
            },
            {
                'Holiday Name': 'Republic Day',
                'Date': '2025-01-26',
                'Type': 'National',
                'Applies To': 'All'
            },
            {
                'Holiday Name': 'Holi',
                'Date': '2025-03-14',
                'Type': 'Optional',
                'Applies To': 'All'
            }
        ];

        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Holidays');
        XLSX.writeFile(wb, `holiday_template_${year || 'sample'}.xlsx`);
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6">Upload Holiday Sheet – {year}</Typography>
                    <IconButton onClick={handleClose} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent>
                {!validationResults ? (
                    <>
                        {/* Upload Zone */}
                        <Box
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            sx={{
                                border: `2px dashed ${dragActive ? '#dc3545' : '#e9ecef'}`,
                                borderRadius: 2,
                                p: 4,
                                textAlign: 'center',
                                backgroundColor: dragActive ? 'rgba(220, 53, 69, 0.04)' : '#f8f9fa',
                                cursor: 'pointer',
                                transition: 'all 150ms ease',
                                mb: 2
                            }}
                            onClick={() => document.getElementById('file-input').click()}
                        >
                            <input
                                id="file-input"
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileInput}
                                style={{ display: 'none' }}
                            />
                            <UploadIcon sx={{ fontSize: 48, color: '#6c757d', mb: 1 }} />
                            <Typography variant="body1" sx={{ mb: 1, fontWeight: 500 }}>
                                {file ? file.name : 'Drag & drop your Excel file here'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                or click to browse
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                Supported: .xlsx, .xls (Max 5MB)
                            </Typography>
                        </Box>

                        {/* Download Template */}
                        <Button
                            startIcon={<DownloadIcon />}
                            onClick={downloadTemplate}
                            fullWidth
                            variant="outlined"
                            sx={{ mb: 2 }}
                        >
                            Download Sample Template
                        </Button>

                        {/* Instructions */}
                        <Alert severity="info" sx={{ mb: 2 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                                Excel Format Requirements:
                            </Typography>
                            <Typography variant="body2" component="div">
                                • Column 1: Holiday Name<br />
                                • Column 2: Date (YYYY-MM-DD)<br />
                                • Column 3: Type (National | Company | Optional)<br />
                                • Column 4: Applies To (All | Department | Branch)
                            </Typography>
                        </Alert>

                        {error && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}
                    </>
                ) : (
                    <>
                        {/* Validation Results */}
                        <Alert 
                            severity={validationResults.invalid.length === 0 ? 'success' : 'warning'}
                            sx={{ mb: 2 }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Validation Summary:
                            </Typography>
                            <Typography variant="body2">
                                ✓ {validationResults.valid.length} valid holidays<br />
                                {validationResults.invalid.length > 0 && `✗ ${validationResults.invalid.length} errors`}
                            </Typography>
                        </Alert>

                        {/* Preview Table */}
                        <TableContainer sx={{ maxHeight: 400, mb: 2 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Holiday Name</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Issues</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {validationResults.valid.map((holiday, index) => (
                                        <TableRow key={`valid-${index}`}>
                                            <TableCell>
                                                <CheckIcon sx={{ color: '#28a745', fontSize: 20 }} />
                                            </TableCell>
                                            <TableCell>{holiday.name}</TableCell>
                                            <TableCell>{holiday.date}</TableCell>
                                            <TableCell>
                                                <Chip label={holiday.type} size="small" />
                                            </TableCell>
                                            <TableCell>-</TableCell>
                                        </TableRow>
                                    ))}
                                    {validationResults.invalid.map((holiday, index) => (
                                        <TableRow key={`invalid-${index}`} sx={{ backgroundColor: '#fff3cd' }}>
                                            <TableCell>
                                                <ErrorIcon sx={{ color: '#dc3545', fontSize: 20 }} />
                                            </TableCell>
                                            <TableCell>{holiday.name || '-'}</TableCell>
                                            <TableCell>{holiday.date || '-'}</TableCell>
                                            <TableCell>{holiday.type || '-'}</TableCell>
                                            <TableCell>
                                                <Typography variant="caption" color="error">
                                                    {holiday.errors.join(', ')}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        {error && (
                            <Alert severity="error" sx={{ mt: 2 }}>
                                {error}
                            </Alert>
                        )}
                    </>
                )}

                {uploading && <LinearProgress sx={{ mt: 2 }} />}
            </DialogContent>
            <DialogActions>
                {!validationResults ? (
                    <Button onClick={handleClose}>Cancel</Button>
                ) : (
                    <>
                        <Button onClick={() => setValidationResults(null)}>Back</Button>
                        <Button onClick={handleClose}>Cancel</Button>
                        <Button
                            onClick={handleUpload}
                            variant="contained"
                            disabled={uploading || validationResults.valid.length === 0}
                        >
                            Import {validationResults.valid.length} Valid Rows
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default BulkUploadModal;
