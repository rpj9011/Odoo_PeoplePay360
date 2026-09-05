// frontend/src/services/locationService.js

const LOCATION_COOKIE_NAME = 'ams_location_data';
const LOCATION_COOKIE_DURATION = 365; // 365 days in days

/**
 * Set a cookie with the given name, value, and expiration
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} days - Expiration in days
 */
const setCookie = (name, value, days) => {
    try {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Strict;Secure`;
    } catch (error) {
        console.error('Error setting cookie:', error);
    }
};

/**
 * Get a cookie value by name
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null
 */
const getCookie = (name) => {
    try {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) {
                return decodeURIComponent(c.substring(nameEQ.length, c.length));
            }
        }
        return null;
    } catch (error) {
        console.error('Error reading cookie:', error);
        return null;
    }
};

/**
 * Delete a cookie by name
 * @param {string} name - Cookie name
 */
const deleteCookie = (name) => {
    try {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Strict;Secure`;
    } catch (error) {
        console.error('Error deleting cookie:', error);
    }
};

/**
 * Get cached location from cookie if available
 * @returns {Object|null} Cached location or null
 */
const getCachedLocation = () => {
    try {
        const cached = getCookie(LOCATION_COOKIE_NAME);
        if (!cached) return null;

        const { location, timestamp, deviceId } = JSON.parse(cached);
        
        // Check if this is from the same device (basic device fingerprinting)
        const currentDeviceId = getDeviceId();
        if (deviceId !== currentDeviceId) {
            // Different device, clear the cookie
            deleteCookie(LOCATION_COOKIE_NAME);
            return null;
        }
        
        // Location is permanently cached for this device
        return location;
    } catch (error) {
        console.error('Error reading cached location from cookie:', error);
        deleteCookie(LOCATION_COOKIE_NAME);
        return null;
    }
};

/**
 * Generate a simple device ID based on browser characteristics
 * @returns {string} Device ID
 */
const getDeviceId = () => {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL()
        ].join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash).toString(36);
    } catch (error) {
        console.error('Error generating device ID:', error);
        return 'unknown-device';
    }
};

/**
 * Cache location in cookie with device ID
 * @param {Object} location - Location object with latitude and longitude
 */
const cacheLocation = (location) => {
    try {
        const deviceId = getDeviceId();
        const cacheData = {
            location,
            timestamp: Date.now(),
            deviceId
        };
        setCookie(LOCATION_COOKIE_NAME, JSON.stringify(cacheData), LOCATION_COOKIE_DURATION);
    } catch (error) {
        console.error('Error caching location in cookie:', error);
    }
};

/**
 * Get user's current location using browser geolocation API with permanent caching
 * @param {boolean} forceRefresh - Force getting fresh location even if cached
 * @returns {Promise<{latitude: number, longitude: number}>}
 */
export const getCurrentLocation = (forceRefresh = false) => {
    return new Promise((resolve, reject) => {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cachedLocation = getCachedLocation();
            if (cachedLocation) {
                resolve(cachedLocation);
                return;
            }
        }

        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by this browser'));
            return;
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000 // 5 minutes
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                
                // Cache the location permanently for this device
                cacheLocation(location);
                resolve(location);
            },
            (error) => {
                let errorMessage = 'Unable to get your location';
                
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Location access denied. Please enable location permissions.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Location information is unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Location request timed out. Please try again.';
                        break;
                    default:
                        errorMessage = 'An unknown error occurred while getting location.';
                        break;
                }
                
                reject(new Error(errorMessage));
            },
            options
        );
    });
};

/**
 * Check if geolocation is supported
 * @returns {boolean}
 */
export const isGeolocationSupported = () => {
    return 'geolocation' in navigator;
};

/**
 * Request location permission
 * @returns {Promise<boolean>}
 */
export const requestLocationPermission = async () => {
    if (!isGeolocationSupported()) {
        return false;
    }

    try {
        // Try to get current position to trigger permission request
        await getCurrentLocation();
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Format distance for display
 * @param {number} distance - Distance in meters
 * @returns {string}
 */
export const formatDistance = (distance) => {
    if (distance < 1000) {
        return `${Math.round(distance)}m`;
    } else {
        return `${(distance / 1000).toFixed(1)}km`;
    }
};

/**
 * Get cached location without making a new request
 * @returns {Object|null} Cached location or null
 */
export const getCachedLocationOnly = () => {
    return getCachedLocation();
};

/**
 * Clear cached location cookie
 */
export const clearCachedLocation = () => {
    try {
        deleteCookie(LOCATION_COOKIE_NAME);
    } catch (error) {
        // Silent error handling
    }
};

/**
 * Check if location cache is valid for this device
 * @returns {boolean}
 */
export const isLocationCacheValid = () => {
    return getCachedLocation() !== null;
};

/**
 * Get device ID for debugging purposes
 * @returns {string} Device ID
 */
export const getCurrentDeviceId = () => {
    return getDeviceId();
};

/**
 * Force refresh location and update cache
 * @returns {Promise<{latitude: number, longitude: number}>}
 */
export const refreshLocation = () => {
    return getCurrentLocation(true);
};
