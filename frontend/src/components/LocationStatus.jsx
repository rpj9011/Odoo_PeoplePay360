// frontend/src/components/LocationStatus.jsx
import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Chip } from '@mui/material';
import { LocationOn, LocationOff, Refresh } from '@mui/icons-material';
import { getCachedLocationOnly, isLocationCacheValid, refreshLocation, getCurrentDeviceId } from '../services/locationService';

const LocationStatus = ({ showRefresh = false, compact = false }) => {
    const [location, setLocation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [deviceId, setDeviceId] = useState('');

    useEffect(() => {
        // Check for cached location on mount
        if (isLocationCacheValid()) {
            const cachedLocation = getCachedLocationOnly();
            setLocation(cachedLocation);
        }
        setDeviceId(getCurrentDeviceId());
    }, []);

    const handleRefresh = async () => {
        setLoading(true);
        try {
            const newLocation = await refreshLocation();
            setLocation(newLocation);
        } catch (error) {
            console.error('Error refreshing location:', error);
        } finally {
            setLoading(false);
        }
    };

    if (compact) {
        return (
            <Chip
                icon={location ? <LocationOn /> : <LocationOff />}
                label={location ? 'Location Active' : 'Location Required'}
                color={location ? 'success' : 'warning'}
                size="small"
                variant="outlined"
            />
        );
    }

    return (
        <Box sx={{ 
            p: 2, 
            border: '1px solid #e0e0e0', 
            borderRadius: 1, 
            backgroundColor: location ? '#f8fff8' : '#fff8f8',
            borderColor: location ? '#4caf50' : '#ff9800'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {location ? (
                        <LocationOn color="success" />
                    ) : (
                        <LocationOff color="warning" />
                    )}
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {location ? 'Location Active' : 'Location Required'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#666' }}>
                            {location 
                                ? `Cached permanently for this device (ID: ${deviceId.substring(0, 8)}...)`
                                : 'Enable location access for attendance tracking'
                            }
                        </Typography>
                    </Box>
                </Box>
                {showRefresh && (
                    <Button
                        size="small"
                        onClick={handleRefresh}
                        disabled={loading}
                        startIcon={<Refresh />}
                        variant="outlined"
                    >
                        {loading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                )}
            </Box>
            {location && (
                <Typography variant="caption" sx={{ color: '#4caf50', mt: 1, display: 'block' }}>
                    Coordinates: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </Typography>
            )}
        </Box>
    );
};

export default LocationStatus;



















