// frontend/src/components/PendingPolicyBanner.jsx
// Banner to notify employees of pending policy acknowledgements

import React from 'react';
import { Alert, Box, Button, Typography, Chip, Stack } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PolicyIcon from '@mui/icons-material/Policy';
import { useOnboarding } from '../context/OnboardingContext';

const PendingPolicyBanner = () => {
    const { pendingPolicies, openStandalonePolicyModal } = useOnboarding();

    if (!pendingPolicies || pendingPolicies.length === 0) {
        return null;
    }

    const overdueCount = pendingPolicies.filter(
        p => p.deadline && new Date() > new Date(p.deadline)
    ).length;

    return (
        <Alert
            severity={overdueCount > 0 ? 'error' : 'warning'}
            icon={<WarningAmberIcon />}
            sx={{
                mb: 3,
                borderRadius: 2,
                '& .MuiAlert-message': {
                    width: '100%'
                }
            }}
            action={
                <Button
                    color="inherit"
                    size="small"
                    variant="outlined"
                    onClick={() => openStandalonePolicyModal()}
                    sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        whiteSpace: 'nowrap'
                    }}
                >
                    Review Now
                </Button>
            }
        >
            <Stack spacing={1}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <PolicyIcon sx={{ fontSize: 20 }} />
                    <Typography variant="subtitle2" fontWeight={600}>
                        {pendingPolicies.length} {pendingPolicies.length === 1 ? 'Policy' : 'Policies'} Awaiting Your Acknowledgement
                    </Typography>
                    {overdueCount > 0 && (
                        <Chip
                            label={`${overdueCount} Overdue`}
                            size="small"
                            color="error"
                            sx={{ height: 20, fontWeight: 600 }}
                        />
                    )}
                </Box>
                <Typography variant="body2">
                    You have pending policy documents that require your review and acknowledgement. 
                    Please review them at your earliest convenience.
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                    {pendingPolicies.slice(0, 3).map(policy => (
                        <Typography
                            key={policy.logId}
                            variant="caption"
                            sx={{
                                display: 'block',
                                color: 'text.secondary',
                                fontSize: '0.75rem'
                            }}
                        >
                            • {policy.policyName} (v{policy.policyVersion})
                            {policy.deadline && ` - Due: ${new Date(policy.deadline).toLocaleDateString()}`}
                        </Typography>
                    ))}
                    {pendingPolicies.length > 3 && (
                        <Typography
                            variant="caption"
                            sx={{
                                display: 'block',
                                color: 'text.secondary',
                                fontSize: '0.75rem',
                                fontStyle: 'italic'
                            }}
                        >
                            ... and {pendingPolicies.length - 3} more
                        </Typography>
                    )}
                </Box>
            </Stack>
        </Alert>
    );
};

export default PendingPolicyBanner;
