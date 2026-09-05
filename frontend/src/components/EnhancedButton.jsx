// frontend/src/components/EnhancedButton.jsx
// Enhanced button component with loading states and immediate feedback

import React, { useState, useCallback } from 'react';
import { Button } from '@mui/material';

import { SkeletonBox } from '../components/SkeletonLoaders';
/**
 * Enhanced Button Component
 * Provides:
 * - Immediate visual feedback on click
 * - Loading state during async operations
 * - Prevents duplicate clicks
 * - Smooth transitions
 */
const EnhancedButton = ({
    children,
    onClick,
    loading: externalLoading,
    disabled,
    variant = 'contained',
    size = 'medium',
    color = 'primary',
    fullWidth = false,
    sx = {},
    ...props
}) => {
    const [internalLoading, setInternalLoading] = useState(false);
    const [clicked, setClicked] = useState(false);

    const isLoading = externalLoading !== undefined ? externalLoading : internalLoading;
    const isDisabled = disabled || isLoading;

    const handleClick = useCallback(async (e) => {
        if (isDisabled || !onClick) return;

        // Immediate visual feedback
        setClicked(true);
        setTimeout(() => setClicked(false), 150);

        try {
            // If onClick returns a promise, handle loading state
            if (externalLoading === undefined) {
                setInternalLoading(true);
            }

            const result = onClick(e);
            
            // If it's a promise, wait for it
            if (result && typeof result.then === 'function') {
                await result;
            }
        } catch (error) {
            console.error('Button onClick error:', error);
            // Don't throw - let error handling happen at higher level
        } finally {
            if (externalLoading === undefined) {
                setInternalLoading(false);
            }
        }
    }, [onClick, isDisabled, externalLoading]);

    return (
        <Button
            variant={variant}
            size={size}
            color={color}
            fullWidth={fullWidth}
            disabled={isDisabled}
            onClick={handleClick}
            sx={{
                position: 'relative',
                transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                transform: clicked ? 'scale(0.98)' : 'scale(1)',
                ...sx,
            }}
            {...props}
        >
            {isLoading && (
                <SkeletonBox width="24px" height="24px" borderRadius="50%" />
            )}
            <span style={{ opacity: isLoading ? 0 : 1 }}>
                {children}
            </span>
        </Button>
    );
};

export default EnhancedButton;















