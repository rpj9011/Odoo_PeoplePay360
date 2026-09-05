// frontend/src/components/ExtraBreakActionButton.jsx
import React, { useState } from 'react';
import { Button, Box, Typography, Alert, Chip } from '@mui/material';
import { PlayArrow, CheckCircle } from '@mui/icons-material';
import api from '../api/axios';

import { SkeletonBox } from '../components/SkeletonLoaders';
const ExtraBreakActionButton = ({ notification, onActionComplete }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const handleStartBreak = async (e) => {
        e.stopPropagation(); // Prevent the parent ListItem's click event
        setLoading(true);
        setResult(null);
        
        try {
            await api.post('/breaks/start', {
                breakType: 'Extra'
            });
            
            setResult({
                type: 'success',
                message: 'Extra break started successfully!'
            });
            
            if (onActionComplete) {
                // Refresh the parent component's data after a short delay
                setTimeout(() => onActionComplete('break_started'), 1000);
            }
        } catch (error) {
            const errorMessage = error.response?.data?.error || 'Failed to start break. You might have already used it.';
            setResult({
                type: 'error',
                message: errorMessage
            });
        } finally {
            setLoading(false);
        }
    };

    // Render nothing if this is not the right notification type
    if (notification?.navigationData?.action !== 'approve_extra_break') {
        return null;
    }

    return (
        <Box sx={{ width: '100%', mt: 2, p: 2, border: '1px solid #e8f5e9', borderRadius: 2, backgroundColor: '#fafffa' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#388e3c' }}>
                    Action Required
                </Typography>
                <Chip 
                    label="Approved" 
                    color="success" 
                    size="small" 
                    icon={<CheckCircle sx={{ fontSize: '16px !important' }}/>}
                />
            </Box>
            
            <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
                Your extra break request was approved.
            </Typography>

            <Button
                variant="contained"
                color="success"
                onClick={handleStartBreak}
                disabled={loading || result?.type === 'success'}
                startIcon={loading ? <SkeletonBox width="20px" height="20px" borderRadius="50%" /> : <PlayArrow />}
                fullWidth
            >
                {loading ? 'Starting...' : 'Start Extra Break'}
            </Button>

            {result && (
                <Alert 
                    severity={result.type} 
                    sx={{ mt: 2 }}
                    variant="outlined"
                >
                    {result.message}
                </Alert>
            )}
        </Box>
    );
};

export default ExtraBreakActionButton;