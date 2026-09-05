// frontend/src/components/OfficeLocationManager.jsx
import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Alert, Chip } from '@mui/material';
import { Add, Edit, Delete, LocationOn } from '@mui/icons-material';
import api from '../api/axios';

import { SkeletonBox } from '../components/SkeletonLoaders';
const OfficeLocationManager = forwardRef((props, ref) => {
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [editingLocation, setEditingLocation] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        address: '',
        latitude: '',
        longitude: '',
        radius: 100,
        description: ''
    });

    useEffect(() => {
        fetchLocations();
    }, []);

    useImperativeHandle(ref, () => ({
        openAddDialog: () => handleOpenDialog()
    }));

    const fetchLocations = async () => {
        try {
            setLoading(true);
            const response = await api.get('/admin/office-locations');
            setLocations(response.data);
        } catch (err) {
            setError('Failed to fetch office locations');
            console.error('Error fetching locations:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (location = null) => {
        if (location) {
            setEditingLocation(location);
            setFormData({
                name: location.name,
                address: location.address,
                latitude: location.latitude.toString(),
                longitude: location.longitude.toString(),
                radius: location.radius,
                description: location.description || ''
            });
        } else {
            setEditingLocation(null);
            setFormData({
                name: '',
                address: '',
                latitude: '',
                longitude: '',
                radius: 100,
                description: ''
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingLocation(null);
        setFormData({
            name: '',
            address: '',
            latitude: '',
            longitude: '',
            radius: 100,
            description: ''
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const locationData = {
                ...formData,
                latitude: parseFloat(formData.latitude),
                longitude: parseFloat(formData.longitude),
                radius: parseInt(formData.radius)
            };

            if (editingLocation) {
                await api.put(`/admin/office-locations/${editingLocation._id}`, locationData);
            } else {
                await api.post('/admin/office-locations', locationData);
            }

            handleCloseDialog();
            fetchLocations();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to save office location');
        }
    };

    const handleDelete = async (locationId) => {
        if (window.confirm('Are you sure you want to delete this office location?')) {
            try {
                await api.delete(`/admin/office-locations/${locationId}`);
                fetchLocations();
            } catch (err) {
                setError(err.response?.data?.error || 'Failed to delete office location');
            }
        }
    };

    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude.toString(),
                        longitude: position.coords.longitude.toString()
                    }));
                },
                (error) => {
                    setError('Failed to get current location. Please ensure location permissions are granted.');
                }
            );
        } else {
            setError('Geolocation is not supported by this browser.');
        }
    };
    
    // --- START OF FIX ---
    const handleRadiusChange = (e) => {
        let value = parseInt(e.target.value, 10);
        // Clamp the value to the allowed range
        if (value < 10) value = 10;
        if (value > 100000) value = 100000; // Increased max value
        setFormData(prev => ({ ...prev, radius: value }));
    };
    // --- END OF FIX ---

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <SkeletonBox width="24px" height="24px" borderRadius="50%" />
            </Box>
        );
    }

    return (
        <Box>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}


            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Address</TableCell>
                            <TableCell>Coordinates</TableCell>
                            <TableCell>Radius</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {locations.map((location) => (
                            <TableRow key={location._id}>
                                <TableCell>{location.name}</TableCell>
                                <TableCell>{location.address}</TableCell>
                                <TableCell>
                                    {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                                </TableCell>
                                <TableCell>{location.radius}m</TableCell>
                                <TableCell>
                                    <Chip
                                        label={location.isActive ? 'Active' : 'Inactive'}
                                        color={location.isActive ? 'success' : 'default'}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleOpenDialog(location)}
                                    >
                                        <Edit />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        onClick={() => handleDelete(location._id)}
                                        color="error"
                                    >
                                        <Delete />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingLocation ? 'Edit Office Location' : 'Add Office Location'}
                </DialogTitle>
                <form onSubmit={handleSubmit}>
                    <DialogContent>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Office Name"
                            fullWidth
                            variant="outlined"
                            value={formData.name}
                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                            required
                        />
                        <TextField
                            margin="dense"
                            label="Address"
                            fullWidth
                            variant="outlined"
                            value={formData.address}
                            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                            required
                        />
                        <Box display="flex" gap={2} mt={2}>
                            <TextField
                                margin="dense"
                                label="Latitude"
                                type="number"
                                step="any"
                                fullWidth
                                variant="outlined"
                                value={formData.latitude}
                                onChange={(e) => setFormData(prev => ({ ...prev, latitude: e.target.value }))}
                                required
                            />
                            <TextField
                                margin="dense"
                                label="Longitude"
                                type="number"
                                step="any"
                                fullWidth
                                variant="outlined"
                                value={formData.longitude}
                                onChange={(e) => setFormData(prev => ({ ...prev, longitude: e.target.value }))}
                                required
                            />
                        </Box>
                        <Button
                            startIcon={<LocationOn />}
                            onClick={getCurrentLocation}
                            sx={{ mt: 1 }}
                        >
                            Use Current Location
                        </Button>
                        {/* --- START OF FIX --- */}
                        <TextField
                            margin="dense"
                            label="Radius (meters)"
                            type="number"
                            fullWidth
                            variant="outlined"
                            value={formData.radius}
                            onChange={handleRadiusChange}
                            required
                            helperText="Must be between 10 and 100,000 meters."
                            inputProps={{
                                min: 10,
                                max: 100000 // Increased maximum value
                            }}
                        />
                        {/* --- END OF FIX --- */}
                        <TextField
                            margin="dense"
                            label="Description"
                            fullWidth
                            variant="outlined"
                            multiline
                            rows={3}
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={handleCloseDialog}>Cancel</Button>
                        <Button type="submit" variant="contained">
                            {editingLocation ? 'Update' : 'Create'}
                        </Button>
                    </DialogActions>
                </form>
            </Dialog>
        </Box>
    );
});

export default OfficeLocationManager;