// frontend/src/components/common/UserAvatar.jsx
// CENTRALIZED AVATAR COMPONENT
// Features:
// - Displays user avatar from GridFS or fallback to initials
// - Lazy loading with IntersectionObserver
// - Error handling with automatic fallback
// - Memoized for performance
// - Consistent sizing across app
// - Red gradient fallback matching brand

import { memo, useState, useEffect, useRef } from 'react';
import { Avatar } from '@mui/material';
import PropTypes from 'prop-types';

/**
 * Get user initials from full name
 */
const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    return (parts.length >= 2 
        ? parts[0][0] + parts[parts.length - 1][0] 
        : name.substring(0, 2)
    ).toUpperCase();
};

/**
 * Size presets for consistent avatar sizing
 */
const SIZE_PRESETS = {
    xs: 32,
    sm: 40,
    md: 64,
    lg: 90,
    xl: 120
};

/**
 * UserAvatar Component
 * 
 * Displays user profile image from GridFS or falls back to initials with red gradient
 * 
 * @param {Object} user - User object with fullName and profileImageUrl
 * @param {string} size - Size preset: 'xs', 'sm', 'md', 'lg', 'xl' or custom number
 * @param {string} className - Additional CSS classes
 * @param {boolean} lazy - Enable lazy loading (default: false)
 * @param {Object} sx - MUI sx prop for custom styling
 */
const UserAvatar = memo(({ user, size = 'md', className = '', lazy = false, sx = {} }) => {
    const [imageSrc, setImageSrc] = useState(null);
    const [imageError, setImageError] = useState(false);
    const [isVisible, setIsVisible] = useState(!lazy);
    const imgRef = useRef(null);
    const observerRef = useRef(null);

    // Determine avatar size
    const avatarSize = typeof size === 'number' ? size : SIZE_PRESETS[size] || SIZE_PRESETS.md;

    // Extract image URL from user object
    // CRITICAL: Reset imageError when the URL itself changes so a new URL is always tried
    const prevProfileUrlRef = useRef(null);
    useEffect(() => {
        const newUrl = user?.profileImageUrl || null;
        if (newUrl !== prevProfileUrlRef.current) {
            prevProfileUrlRef.current = newUrl;
            if (imageError) {
                setImageError(false); // URL changed — clear stale error so image retries
                return; // The next render cycle will re-run this effect with imageError=false
            }
        }

        console.log('[UserAvatar] User data:', user);
        console.log('[UserAvatar] profileImageUrl:', user?.profileImageUrl);
        console.log('[UserAvatar] imageError:', imageError);
        
        if (!user || !user.profileImageUrl || imageError) {
            setImageSrc(null);
            return;
        }

        // Handle different URL formats:
        // 1. GridFS format: /api/users/avatar/{objectId}
        // 2. Legacy format: http://domain/avatars/filename.jpg
        let url = user.profileImageUrl;
        
        // If it's a relative path, ensure it's properly formatted
        if (url.startsWith('/api/users/avatar/')) {
            // Already in correct format
            console.log('[UserAvatar] Using GridFS URL:', url);
            setImageSrc(url);
        } else if (url.includes('/avatars/')) {
            // Legacy format - extract filename and convert to GridFS format if possible
            // For now, keep as-is for backward compatibility
            console.log('[UserAvatar] Using legacy URL:', url);
            setImageSrc(url);
        } else if (url.match(/^[a-f0-9]{24}$/i)) {
            // Raw ObjectId - convert to API path
            const convertedUrl = `/api/users/avatar/${url}`;
            console.log('[UserAvatar] Converting ObjectId to URL:', convertedUrl);
            setImageSrc(convertedUrl);
        } else {
            // Unknown format - try as-is
            console.log('[UserAvatar] Unknown URL format, using as-is:', url);
            setImageSrc(url);
        }
    }, [user, imageError]);

    // Lazy loading with IntersectionObserver
    useEffect(() => {
        if (!lazy || isVisible) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                        if (observerRef.current) {
                            observerRef.current.disconnect();
                        }
                    }
                });
            },
            {
                rootMargin: '50px', // Start loading 50px before visible
                threshold: 0.01
            }
        );

        if (imgRef.current) {
            observer.observe(imgRef.current);
            observerRef.current = observer;
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [lazy, isVisible]);

    // Handle image load error - fallback to initials
    const handleImageError = () => {
        console.warn('[UserAvatar] Failed to load image:', imageSrc);
        setImageError(true);
        setImageSrc(null);
    };

    // Determine what to display
    const shouldShowImage = isVisible && imageSrc && !imageError;
    const initials = getInitials(user?.fullName || user?.name);

    return (
        <Avatar
            ref={imgRef}
            src={shouldShowImage ? imageSrc : undefined}
            alt={user?.fullName || user?.name || 'User'}
            className={className}
            onError={handleImageError}
            sx={{
                width: avatarSize,
                height: avatarSize,
                fontSize: avatarSize * 0.4, // Scale font size with avatar
                fontWeight: 600,
                background: shouldShowImage 
                    ? 'transparent' 
                    : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                color: '#ffffff',
                transition: 'all 0.3s ease',
                ...sx
            }}
        >
            {!shouldShowImage && initials}
        </Avatar>
    );
});

UserAvatar.displayName = 'UserAvatar';

UserAvatar.propTypes = {
    user: PropTypes.shape({
        fullName: PropTypes.string,
        name: PropTypes.string,
        profileImageUrl: PropTypes.string
    }),
    size: PropTypes.oneOfType([
        PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
        PropTypes.number
    ]),
    className: PropTypes.string,
    lazy: PropTypes.bool,
    sx: PropTypes.object
};

export default UserAvatar;
