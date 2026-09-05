// frontend/src/pages/SSOLoginPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Typography, Alert, Link } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { SkeletonBox } from '../components/SkeletonLoaders';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

const SSOLoginPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const handleSSOLogin = async () => {
      try {
        const token = searchParams.get('token');
        const redirectPath = searchParams.get('redirect') || '/dashboard';

        console.log('🔐 SSO Login Page - Processing token:', token ? token.substring(0, 20) + '...' : 'null');
        console.log('🔗 Redirect path:', redirectPath);

        const apiUrl = getApiBaseUrl();

        if (!token) {
          // No token means direct redirect from SSO - check if session exists
          console.log('🔄 No token provided - checking existing session...');
          
          try {
            const response = await fetch(`${apiUrl}/auth/me`, {
              method: 'GET',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              }
            });

            if (response.ok) {
              const userData = await response.json();
              console.log('✅ Existing session found:', userData.user?.email);
              // Redirect to intended path
              navigate(redirectPath);
              return;
            } else {
              console.log('❌ No valid session found');
              setError('No valid session found. Please log in manually.');
              setLoading(false);
              return;
            }
          } catch (err) {
            console.error('❌ Session check failed:', err);
            setError('Session verification failed. Please log in manually.');
            setLoading(false);
            return;
          }
        }

        // Call AMS backend to verify SSO token and create session
        console.log('🔄 Calling AMS backend /api/auth/sso-login...');
        const response = await fetch(`${apiUrl}/auth/sso-login`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ SSO login failed:', errorData);
          setError('SSO authentication failed: ' + (errorData.message || 'Unknown error'));
          setLoading(false);
          return;
        }

        const result = await response.json();
        console.log('✅ SSO login successful:', result.message);

        // Wait a moment for session to be established
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify session is working by calling /api/auth/me
        console.log('🔄 Verifying session...');
        try {
          const sessionResponse = await fetch(`${apiUrl}/auth/me`, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            }
          });

          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            console.log('✅ Session verified:', sessionData.user?.email);
            
            // Redirect to the intended path
            console.log(`🚀 Redirecting to: ${redirectPath}`);
            window.location.href = redirectPath;
          } else {
            console.error('❌ Session verification failed');
            setError('Session verification failed. Please try logging in again.');
            setLoading(false);
          }
        } catch (sessionErr) {
          console.error('❌ Session verification error:', sessionErr);
          setError('Session verification failed. Please try logging in again.');
          setLoading(false);
        }

      } catch (err) {
        console.error('❌ SSO Login error:', err);
        setError(err.message || 'Authentication failed');
        setLoading(false);
      }
    };

    handleSSOLogin();
  }, [searchParams]);

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2
        }}
      >
        <SkeletonBox width="60px" height="60px" borderRadius="50%" />
        <Typography variant="h6" color="text.secondary">
          Completing SSO login...
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Please wait while we authenticate you.
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
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
          p: 3
        }}
      >
        <Alert severity="error" sx={{ maxWidth: 500 }}>
          <Typography variant="h6" gutterBottom>
            SSO Login Failed
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
        </Alert>
        <Typography variant="body2" color="text.secondary">
          You will be redirected to the login page in a few seconds.
        </Typography>
      </Box>
    );
  }

  return null; // This should not render as we redirect immediately
};

export default SSOLoginPage;