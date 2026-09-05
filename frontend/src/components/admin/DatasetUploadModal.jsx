import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Alert,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    RadioGroup,
    FormControlLabel,
    Radio,
    Chip,
    CircularProgress,
    Paper
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    CheckCircle as CheckIcon,
    Error as ErrorIcon,
    Info as InfoIcon
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import api from '../../api/axios';

const DatasetUploadModal = ({ open, onClose, onSuccess }) => {
    const [file, setFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [uploadMode, setUploadMode] = useState('append');
    const [validationResult, setValidationResult] = useState(null);
    const [datasetInfo, setDatasetInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState('upload'); // upload, validate, confirm

    useEffect(() => {
        if (open) {
            fetchDatasetInfo();
        } else {
            resetModal();
        }
    }, [open]);

    const resetModal = () => {
        setFile(null);
        setUploadMode('append');
        setValidationResult(null);
        setError('');
        setStep('upload');
    };

    const fetchDatasetInfo = async () => {
        try {
            const res = await api.get('/admin/holiday-dataset/info');
            setDatasetInfo(res.data);
        } catch (err) {
            console.error('Failed to fetch dataset info:', err);
        }
    };

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

    const handleFileSelect = (selectedFile) => {
        if (!selectedFile.name.match(/\.(xlsx|xls)$/)) {
            setError('Please upload an Excel file (.xlsx or .xls)');
            return;
        }

        setFile(selectedFile);
        setError('');
    };

    const handleValidate = async () => {
        if (!file) return;

        setLoading(true);
        setError('');

        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    // Validate structure
                    const requiredColumns = ['Holiday Code', 'Holiday Name', 'Year', 'Date'];
                    const errors = [];
                    const warnings = [];
                    const validRows = [];

                    if (jsonData.length === 0) {
                        setError('Excel file is empty');
                        setLoading(false);
                        return;
                    }

                    // Check columns
                    const firstRow = jsonData[0];
                    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
                    if (missingColumns.length > 0) {
                        setError(`Missing required columns: ${missingColumns.join(', ')}`);
                        setLoading(false);
                        return;
                    }

                    // Validate each row
                    jsonData.forEach((row, index) => {
                        const rowNum = index + 2; // Excel row number (1-indexed + header)
                        const rowErrors = [];

                        if (!row['Holiday Code']) rowErrors.push('Missing Holiday Code');
                        if (!row['Holiday Name']) rowErrors.push('Missing Holiday Name');
                        if (!row['Year']) rowErrors.push('Missing Year');
                        if (!row['Date']) rowErrors.push('Missing Date');

                        if (row['Year']) {
                            const year = parseInt(row['Year']);
                            if (isNaN(year) || year < 2000 || year > 2100) {
                                rowErrors.push('Invalid year');
                            }
                        }

                        if (row['Date']) {
                            const date = new Date(row['Date']);
                            if (isNaN(date.getTime())) {
                                rowErrors.push('Invalid date format');
                            } else if (row['Year']) {
                                const dateYear = date.getFullYear();
                                const rowYear = parseInt(row['Year']);
                                if (dateYear !== rowYear) {
                                    rowErrors.push(`Date year (${dateYear}) doesn't match Year column (${rowYear})`);
                                }
                            }
                        }

                        if (rowErrors.length > 0) {
                            errors.push({ row: rowNum, errors: rowErrors });
                        } else {
                            validRows.push({
                                holidayCode: row['Holiday Code'],
                                holidayName: row['Holiday Name'],
                                year: parseInt(row['Year']),
                                date: new Date(row['Date']).toISOString().split('T')[0]
                            });
                        }
                    });

                    // Check for duplicates
                    const seen = new Set();
                    validRows.forEach((row, index) => {
                        const key = `${row.holidayCode}-${row.year}`;
                        if (seen.has(key)) {
                            warnings.push(`Duplicate entry: ${row.holidayName} (${row.year})`);
                        }
                        seen.add(key);
                    });

                    setValidationResult({
                        totalRows: jsonData.length,
                        validRows: validRows.length,
                        errors,
                        warnings,
                        data: validRows
                    });

                    if (errors.length === 0) {
                        setStep('confirm');
                    } else {
                        setStep('validate');
                    }
                } catch (err) {
                    setError('Failed to parse Excel file: ' + err.message);
                } finally {
                    setLoading(false);
                }
            };

            reader.readAsArrayBuffer(file);
        } catch (err) {
            setError('Failed to read file: ' + err.message);
            setLoading(false);
        }
    };

    const handleUpload = async () => {
        setLoading(true);
        setError('');

        try {
            await api.post('/admin/holiday-dataset/upload', {
                holidays: validationResult.data,
                mode: uploadMode
            });

            onSuccess();
            onClose();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to upload dataset');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <UploadIcon />
                    Internal Holiday Dataset Manager
                </Box>
            </DialogTitle>

            <DialogContent>
                {/* Dataset Info */}
                {datasetInfo && (
                    <Paper sx={{ p: 2, mb: 3, bgcolor: '#f5f5f5' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                            Current Dataset Status
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <Chip
                                icon={<InfoIcon />}
                                label={`Version: ${datasetInfo.version || 'v1'}`}
                                size="small"
                            />
                            <Chip
                                icon={<CheckIcon />}
                                label={`Records: ${datasetInfo.totalRecords || 0}`}
                                size="small"
                            />
                            {datasetInfo.lastUpdated && (
                                <Chip
                                    label={`Updated: ${new Date(datasetInfo.lastUpdated).toLocaleDateString()}`}
                                    size="small"
                                />
                            )}
                        </Box>
                        {datasetInfo.missingYears && datasetInfo.missingYears.length > 0 && (
                            <Alert severity="warning" sx={{ mt: 2 }}>
                                Dataset missing for years: {datasetInfo.missingYears.join(', ')}
                            </Alert>
                        )}
                    </Paper>
                )}

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {/* Upload Section */}
                {step === 'upload' && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                            Upload Dataset File
                        </Typography>

                        <Box
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            sx={{
                                border: '2px dashed',
                                borderColor: dragActive ? '#dc3545' : '#ddd',
                                borderRadius: '12px',
                                p: 4,
                                textAlign: 'center',
                                bgcolor: dragActive ? '#fff5f5' : '#fafafa',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                mb: 3
                            }}
                            onClick={() => document.getElementById('file-input').click()}
                        >
                            <UploadIcon sx={{ fontSize: 48, color: '#999', mb: 2 }} />
                            <Typography variant="body1" sx={{ mb: 1 }}>
                                {file ? file.name : 'Drag & drop Excel file here'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                or click to browse
                            </Typography>
                            <input
                                id="file-input"
                                type="file"
                                accept=".xlsx,.xls"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileSelect(e.target.files[0])}
                            />
                        </Box>

                        <Alert severity="info" sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                                Required Excel Columns:
                            </Typography>
                            <Typography variant="body2" component="div">
                                • Holiday Code (e.g., HOLI, DIWALI)<br />
                                • Holiday Name (e.g., Holi, Diwali)<br />
                                • Year (e.g., 2026, 2027)<br />
                                • Date (e.g., 2026-03-03)
                            </Typography>
                        </Alert>

                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                            Upload Mode
                        </Typography>
                        <RadioGroup value={uploadMode} onChange={(e) => setUploadMode(e.target.value)}>
                            <FormControlLabel
                                value="append"
                                control={<Radio />}
                                label={
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            Append to Existing Dataset
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Add new records without removing existing ones
                                        </Typography>
                                    </Box>
                                }
                            />
                            <FormControlLabel
                                value="replace"
                                control={<Radio />}
                                label={
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                            Replace Dataset Version
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Remove all existing records and upload new dataset
                                        </Typography>
                                    </Box>
                                }
                            />
                        </RadioGroup>
                    </Box>
                )}

                {/* Validation Results */}
                {step === 'validate' && validationResult && (
                    <Box>
                        <Alert severity={validationResult.errors.length > 0 ? 'error' : 'success'} sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                Validation Results
                            </Typography>
                            <Typography variant="body2">
                                Total Rows: {validationResult.totalRows} | Valid: {validationResult.validRows} | 
                                Errors: {validationResult.errors.length}
                            </Typography>
                        </Alert>

                        {validationResult.errors.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: '#d32f2f' }}>
                                    Errors Found:
                                </Typography>
                                <TableContainer sx={{ maxHeight: 300 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Row</TableCell>
                                                <TableCell>Errors</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {validationResult.errors.map((err, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>{err.row}</TableCell>
                                                    <TableCell>{err.errors.join(', ')}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}

                        {validationResult.warnings.length > 0 && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                                    Warnings:
                                </Typography>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>
                                    {validationResult.warnings.map((warning, idx) => (
                                        <li key={idx}>{warning}</li>
                                    ))}
                                </ul>
                            </Alert>
                        )}
                    </Box>
                )}

                {/* Confirmation */}
                {step === 'confirm' && validationResult && (
                    <Box>
                        <Alert severity="success" sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                Validation Successful!
                            </Typography>
                            <Typography variant="body2">
                                {validationResult.validRows} records ready to upload
                            </Typography>
                        </Alert>

                        {validationResult.warnings.length > 0 && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                                    Warnings:
                                </Typography>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>
                                    {validationResult.warnings.map((warning, idx) => (
                                        <li key={idx}>{warning}</li>
                                    ))}
                                </ul>
                            </Alert>
                        )}

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Mode: {uploadMode === 'append' ? 'Append to existing dataset' : 'Replace entire dataset'}
                        </Typography>

                        <TableContainer sx={{ maxHeight: 300 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Holiday Code</TableCell>
                                        <TableCell>Holiday Name</TableCell>
                                        <TableCell>Year</TableCell>
                                        <TableCell>Date</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {validationResult.data.slice(0, 10).map((row, idx) => (
                                        <TableRow key={idx}>
                                            <TableCell>{row.holidayCode}</TableCell>
                                            <TableCell>{row.holidayName}</TableCell>
                                            <TableCell>{row.year}</TableCell>
                                            <TableCell>{row.date}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        {validationResult.data.length > 10 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Showing first 10 of {validationResult.data.length} records
                            </Typography>
                        )}
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                {step === 'upload' && (
                    <Button
                        variant="contained"
                        onClick={handleValidate}
                        disabled={!file || loading}
                    >
                        {loading ? <CircularProgress size={24} /> : 'Validate Dataset'}
                    </Button>
                )}
                {step === 'validate' && (
                    <Button onClick={() => setStep('upload')}>
                        Back
                    </Button>
                )}
                {step === 'confirm' && (
                    <>
                        <Button onClick={() => setStep('upload')}>
                            Back
                        </Button>
                        <Button
                            variant="contained"
                            onClick={handleUpload}
                            disabled={loading}
                            sx={{ bgcolor: '#dc3545' }}
                        >
                            {loading ? <CircularProgress size={24} /> : 'Upload Dataset'}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default DatasetUploadModal;
