import React from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, Stack } from '@mui/material';
import SecurePdfViewer from './SecurePdfViewer';
import { useAuth } from '../context/AuthContext';

const PolicyViewer = ({ policy, onClose }) => {
    const { user } = useAuth();
    
    if (!policy) return null;

    // Construct URL for PDF — relative to the api axios baseURL (/api).
    // Do NOT include /api prefix here; the axios instance already has it as baseURL.
    const getPdfUrl = () => {
        if (!policy._id) return '';
        return `/policies-gridfs/${policy._id}/file`;
    };

    const pdfUrl = getPdfUrl();
    const role = user?.role === 'Admin' ? 'admin' : 'employee';

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} px={2} pt={2}>
                <Box>
                    <Typography variant="h6" fontWeight={700} color="#222">
                        {policy.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Version {policy.version} • Effective from {new Date(policy.effectiveFrom).toLocaleDateString()}
                    </Typography>
                </Box>
            </Stack>
            
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <SecurePdfViewer
                    pdfUrl={pdfUrl}
                    policyName={policy.name}
                    role={role}
                    onClose={onClose}
                />
            </Box>
        </Box>
    );
};

PolicyViewer.propTypes = {
    policy: PropTypes.object,
    onClose: PropTypes.func.isRequired
};

export default PolicyViewer;
