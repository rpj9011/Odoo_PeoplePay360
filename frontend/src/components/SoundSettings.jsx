import React, { useState, useEffect } from 'react';
import {
    Box,
    Switch,
    FormControlLabel,
    Typography,
    Paper,
    IconButton,
    Tooltip,
    Divider
} from '@mui/material';
import {
    VolumeUp,
    VolumeOff,
    Notifications,
    AdminPanelSettings,
    Description
} from '@mui/icons-material';
import soundService from '../services/soundService';

const SoundSettings = () => {
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [isPlayingTest, setIsPlayingTest] = useState(false);

    useEffect(() => {
        setSoundEnabled(soundService.getSoundPreference());
    }, []);

    const handleSoundToggle = (enabled) => {
        setSoundEnabled(enabled);
        soundService.setSoundPreference(enabled);
    };

    const playTestSound = (soundType) => {
        if (isPlayingTest) return;
        
        setIsPlayingTest(true);
        
        switch (soundType) {
            case 'default':
                soundService.playNotificationSound();
                break;
            case 'admin':
                soundService.playAdminNotificationSound();
                break;
            case 'rejection':
                soundService.playLeaveRejectionSound();
                break;
            case 'policy':
                soundService.playPolicyUpdateSound();
                break;
            default:
                soundService.playNotificationSound();
        }
        
        setTimeout(() => setIsPlayingTest(false), 1000);
    };

    return (
        <Box>
            {/* Main Sound Toggle */}
            <Box sx={{ mb: 3 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={soundEnabled}
                            onChange={(e) => handleSoundToggle(e.target.checked)}
                            sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': {
                                    color: '#dc3545',
                                },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                    backgroundColor: '#dc3545',
                                },
                            }}
                        />
                    }
                    label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {soundEnabled ? <VolumeUp sx={{ color: '#dc3545' }} /> : <VolumeOff />}
                            <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                Enable notification sounds
                            </Typography>
                        </Box>
                    }
                />
            </Box>

            <Divider sx={{ my: 3, borderColor: '#e0e0e0' }} />

            {/* Sound Previews */}
            <Typography variant="subtitle1" gutterBottom sx={{ mb: 2, fontWeight: 600, color: '#1a1a1a' }}>
                Sound Previews
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Default Notification Sound */}
                <Paper sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    p: 2.5,
                    border: '1px solid #e0e0e0',
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    borderLeft: '4px solid #dc3545',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(220, 53, 69, 0.1)',
                        transform: 'translateX(4px)',
                    }
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Notifications sx={{ color: '#dc3545', fontSize: 28 }} />
                        <Box>
                            <Typography variant="body2" fontWeight="600" sx={{ color: '#1a1a1a' }}>
                                Default Notification
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                                Regular system notifications
                            </Typography>
                        </Box>
                    </Box>
                    <Tooltip title="Play test sound">
                        <IconButton
                            onClick={() => playTestSound('default')}
                            disabled={!soundEnabled || isPlayingTest}
                            size="small"
                            sx={{ 
                                color: '#dc3545',
                                '&:hover': { bgcolor: 'rgba(220, 53, 69, 0.1)' }
                            }}
                        >
                            <VolumeUp />
                        </IconButton>
                    </Tooltip>
                </Paper>

                {/* Admin Notification Sound */}
                <Paper sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    p: 2.5,
                    border: '1px solid #e0e0e0',
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    borderLeft: '4px solid #dc3545',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(220, 53, 69, 0.1)',
                        transform: 'translateX(4px)',
                    }
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <AdminPanelSettings sx={{ color: '#dc3545', fontSize: 28 }} />
                        <Box>
                            <Typography variant="body2" fontWeight="600" sx={{ color: '#1a1a1a' }}>
                                Admin Notification
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                                Notifications from admin/HR
                            </Typography>
                        </Box>
                    </Box>
                    <Tooltip title="Play test sound">
                        <IconButton
                            onClick={() => playTestSound('admin')}
                            disabled={!soundEnabled || isPlayingTest}
                            size="small"
                            sx={{ 
                                color: '#dc3545',
                                '&:hover': { bgcolor: 'rgba(220, 53, 69, 0.1)' }
                            }}
                        >
                            <VolumeUp />
                        </IconButton>
                    </Tooltip>
                </Paper>

                {/* Leave Rejection Sound */}
                <Paper sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    p: 2.5,
                    border: '1px solid #e0e0e0',
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    borderLeft: '4px solid #dc3545',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(220, 53, 69, 0.1)',
                        transform: 'translateX(4px)',
                    }
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Notifications sx={{ color: '#dc3545', fontSize: 28 }} />
                        <Box>
                            <Typography variant="body2" fontWeight="600" sx={{ color: '#1a1a1a' }}>
                                Leave Rejection
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                                When leave request is rejected
                            </Typography>
                        </Box>
                    </Box>
                    <Tooltip title="Play test sound">
                        <IconButton
                            onClick={() => playTestSound('rejection')}
                            disabled={!soundEnabled || isPlayingTest}
                            size="small"
                            sx={{ 
                                color: '#dc3545',
                                '&:hover': { bgcolor: 'rgba(220, 53, 69, 0.1)' }
                            }}
                        >
                            <VolumeUp />
                        </IconButton>
                    </Tooltip>
                </Paper>

                {/* Policy Update Sound */}
                <Paper sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    p: 2.5,
                    border: '1px solid #e0e0e0',
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    borderLeft: '4px solid #dc3545',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        boxShadow: '0 4px 12px rgba(220, 53, 69, 0.1)',
                        transform: 'translateX(4px)',
                    }
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Description sx={{ color: '#dc3545', fontSize: 28 }} />
                        <Box>
                            <Typography variant="body2" fontWeight="600" sx={{ color: '#1a1a1a' }}>
                                Policy Update
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                                When a policy is added or updated
                            </Typography>
                        </Box>
                    </Box>
                    <Tooltip title="Play test sound">
                        <IconButton
                            onClick={() => playTestSound('policy')}
                            disabled={!soundEnabled || isPlayingTest}
                            size="small"
                            sx={{ 
                                color: '#dc3545',
                                '&:hover': { bgcolor: 'rgba(220, 53, 69, 0.1)' }
                            }}
                        >
                            <VolumeUp />
                        </IconButton>
                    </Tooltip>
                </Paper>
            </Box>

            <Typography variant="caption" sx={{ mt: 3, display: 'block', color: '#666', fontStyle: 'italic' }}>
                Sound preferences are saved automatically and will be used across all devices.
            </Typography>
        </Box>
    );
};

export default SoundSettings;

