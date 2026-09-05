// frontend/src/pages/SSOCallbackPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Box, Typography, Alert, Link } from '@mui/material';

import { SkeletonBox } from '../components/SkeletonLoaders';
const SSOCallbackPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { loginWithSSO } = useAuth();
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const handleSSOCallback = async () => {
            try {
                const token = searchParams.get('token');
                const userData = searchParams.get('user');

                if (!token || !userData) {
                    throw new Error('Missing SSO authentication data');
                }

                // Decode user data
                const user = JSON.parse(decodeURIComponent(userData));

                // Set user in auth context with SSO login
                await loginWithSSO(user, token);

                console.log('[SSO] Successfully authenticated user via SSO:', user.email);

                // Redirect to dashboard
                navigate('/dashboard', { replace: true });

            } catch (error) {
                console.error('[SSO] SSO callback error:', error);
                setError(error.message);
                setLoading(false);
                
                // Redirect to login after 3 seconds
                setTimeout(() => {
                    navigate('/login', { replace: true });
                }, 3000);
            }
        };

        handleSSOCallback();
    }, [searchParams, navigate, loginWithSSO]);

    if (loading) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    gap: 2
                }}
            >
                <SkeletonBox width="60px" height="60px" borderRadius="50%" />
                <Typography variant="h6" color="primary">
                    Completing SSO Authentication...
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Please wait while we log you in
                </Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    gap: 2,
                    p: 3
                }}
            >
                <Alert severity="error" sx={{ maxWidth: 500, width: '100%' }}>
                    <Typography variant="h6" gutterBottom>
                        SSO Authentication Failed
                    </Typography>
                    <Typography variant="body2">
                        {error}
                    </Typography>
                    {(error?.includes('JWKS') || error?.includes('SSO configuration') || error?.includes('SSO service')) && (
                        <Link 
                            href="/SSO_JWKS_DIAGNOSIS.md" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            sx={{ mt: 1, display: 'block' }}
                        >
                            📖 View SSO JWKS Diagnosis Guide
                        </Link>
                    )}
                    <Typography variant="body2" sx={{ mt: 1 }}>
                        Redirecting to login page...
                    </Typography>
                </Alert>
            </Box>
        );
    }

    return null;
};

export default SSOCallbackPage;
