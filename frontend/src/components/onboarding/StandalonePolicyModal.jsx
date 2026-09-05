// frontend/src/components/onboarding/StandalonePolicyModal.jsx
// Modal for employees to acknowledge policies assigned to them dynamically

import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Checkbox,
    FormControlLabel,
    Alert,
    LinearProgress,
    Stack,
    Chip,
    IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import PolicyViewer from '../PolicyViewer';
import { useOnboarding } from '../../context/OnboardingContext';
import api from '../../api/axios';

const StandalonePolicyModal = () => {
    const {
        standalonePolicyModalOpen,
        currentStandalonePolicy,
        closeStandalonePolicyModal,
        recordStandaloneReadingStart,
        acceptStandalonePolicy,
        policyAcceptancePending,
    } = useOnboarding();

    const [acknowledged, setAcknowledged] = useState(false);
    const [scrolledToBottom, setScrolledToBottom] = useState(false);
    const [readingStartTime, setReadingStartTime] = useState(null);
    const [error, setError] = useState('');
    const [policyDetails, setPolicyDetails] = useState(null);
    const [loading, setLoading] = useState(false);

    const viewerRef = useRef(null);

    useEffect(() => {
        if (standalonePolicyModalOpen && currentStandalonePolicy) {
            // Reset state
            setAcknowledged(false);
            setScrolledToBottom(false);
            setReadingStartTime(Date.now());
            setError('');
            
            // Load policy details
            loadPolicyDetails();
            
            // Notify backend that reading started
            recordStandaloneReadingStart(currentStandalonePolicy.logId);
        }
    }, [standalonePolicyModalOpen, currentStandalonePolicy]);

    const loadPolicyDetails = async () => {
        if (!currentStandalonePolicy?.policyId) return;

        setLoading(true);
        try {
            const { data } = await api.get(`/policies/${currentStandalonePolicy.policyId}`);
            setPolicyDetails(data);
        } catch (err) {
            console.error('Failed to load policy details:', err);
            setError('Failed to load policy details');
        } finally {
            setLoading(false);
        }
    };

    const handleScrollChange = (reachedBottom) => {
        if (reachedBottom) {
            setScrolledToBottom(true);
        }
    };

    const handleAccept = async () => {
        if (!acknowledged) {
            setError('You must acknowledge that you have read and understood the policy.');
            return;
        }

        if (!scrolledToBottom) {
            setError('Please scroll to the bottom of the policy document.');
            return;
        }

        const readingDurationSeconds = Math.floor((Date.now() - readingStartTime) / 1000);

        const payload = {
            logId: currentStandalonePolicy.logId,
            policyId: currentStandalonePolicy.policyId,
            policyVersion: currentStandalonePolicy.policyVersion,
            checkboxAcknowledged: acknowledged,
            readingDurationSeconds,
            scrolledToBottom,
        };

        const result = await acceptStandalonePolicy(payload);

        if (!result.success) {
            setError(result.error || 'Failed to accept policy');
        }
    };

    const handleClose = () => {
        // Don't allow closing if there's a mandatory policy pending
        // User must acknowledge it
        if (currentStandalonePolicy?.mandatory) {
            setError('This policy requires your acknowledgement before you can continue.');
            return;
        }
        closeStandalonePolicyModal();
    };

    if (!standalonePolicyModalOpen || !currentStandalonePolicy) {
        return null;
    }

    const canAccept = acknowledged && scrolledToBottom;
    const isOverdue = currentStandalonePolicy.deadline 
        ? new Date() > new Date(currentStandalonePolicy.deadline)
        : false;

    return (
        <Dialog
            open={standalonePolicyModalOpen}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: { 
                    height: '90vh',
                    borderRadius: 2
                }
            }}
        >
            <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <DescriptionIcon color="primary" />
                        <Typography variant="h6" fontWeight={600}>
                            Policy Acknowledgement Required
                        </Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Please review and acknowledge the following policy
                    </Typography>
                </Box>
                {!currentStandalonePolicy?.mandatory && (
                    <IconButton onClick={handleClose} size="small">
                        <CloseIcon />
                    </IconButton>
                )}
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                <Box sx={{ p: 3 }}>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                            {error}
                        </Alert>
                    )}

                    {isOverdue && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            This policy acknowledgement is overdue! Please review and accept it immediately.
                        </Alert>
                    )}

                    <Stack spacing={2} sx={{ mb: 3 }}>
                        <Box>
                            <Typography variant="h6" fontWeight={600} gutterBottom>
                                {currentStandalonePolicy.policyName}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip 
                                    label={`Version ${currentStandalonePolicy.policyVersion}`}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                />
                                {currentStandalonePolicy.deadline && (
                                    <Chip
                                        label={`Deadline: ${new Date(currentStandalonePolicy.deadline).toLocaleDateString()}`}
                                        size="small"
                                        color={isOverdue ? 'error' : 'default'}
                                        variant="outlined"
                                    />
                                )}
                            </Stack>
                        </Box>

                        <Alert severity="info">
                            Please read the entire policy document carefully. You must scroll to the bottom 
                            and spend at least 60 seconds reading before you can acknowledge.
                        </Alert>
                    </Stack>
                </Box>

                {loading ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <LinearProgress />
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                            Loading policy document...
                        </Typography>
                    </Box>
                ) : policyDetails ? (
                    <Box sx={{ height: 'calc(100% - 240px)', overflow: 'auto' }}>
                        <PolicyViewer
                            ref={viewerRef}
                            policyId={policyDetails._id}
                            onScrollChange={handleScrollChange}
                        />
                    </Box>
                ) : (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography variant="body1" color="text.secondary">
                            Policy document not available
                        </Typography>
                    </Box>
                )}

                <Box sx={{ p: 3, bgcolor: 'grey.50', borderTop: 1, borderColor: 'divider' }}>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={acknowledged}
                                onChange={(e) => {
                                    setAcknowledged(e.target.checked);
                                    if (error) setError('');
                                }}
                                color="primary"
                            />
                        }
                        label={
                            <Typography variant="body2">
                                I acknowledge that I have read, understood, and agree to comply with this policy
                            </Typography>
                        }
                    />

                    {!scrolledToBottom && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                            Please scroll to the bottom of the policy document
                        </Alert>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
                {!currentStandalonePolicy?.mandatory && (
                    <Button onClick={handleClose} disabled={policyAcceptancePending}>
                        Later
                    </Button>
                )}
                <Button
                    variant="contained"
                    onClick={handleAccept}
                    disabled={!canAccept || policyAcceptancePending}
                >
                    {policyAcceptancePending ? 'Submitting...' : 'Accept & Acknowledge'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default StandalonePolicyModal;
