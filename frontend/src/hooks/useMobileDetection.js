import { useState, useEffect } from 'react';

/**
 * Custom hook to detect mobile/tablet/desktop breakpoints
 * Returns current device type and breakpoint information
 * 
 * Breakpoints:
 * - mobile-xs: <= 360px
 * - mobile-sm: <= 480px
 * - mobile-lg: <= 768px
 * - tablet: <= 1024px
 * - desktop: > 1024px
 */
const useMobileDetection = () => {
  const [deviceInfo, setDeviceInfo] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    breakpoint: 'desktop',
  });

  useEffect(() => {
    // Debounce timer
    let resizeTimer;

    const updateDeviceInfo = () => {
      const width = window.innerWidth;
      
      let breakpoint = 'desktop';
      let isMobile = false;
      let isTablet = false;
      let isDesktop = true;

      if (width <= 360) {
        breakpoint = 'mobile-xs';
        isMobile = true;
        isDesktop = false;
      } else if (width <= 480) {
        breakpoint = 'mobile-sm';
        isMobile = true;
        isDesktop = false;
      } else if (width <= 768) {
        breakpoint = 'mobile-lg';
        isMobile = true;
        isDesktop = false;
      } else if (width <= 1024) {
        breakpoint = 'tablet';
        isTablet = true;
        isDesktop = false;
      } else {
        breakpoint = 'desktop';
        isDesktop = true;
      }

      setDeviceInfo({
        isMobile,
        isTablet,
        isDesktop,
        breakpoint,
      });
    };

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateDeviceInfo, 150);
    };

    // Initial detection
    updateDeviceInfo();

    // Add resize listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return deviceInfo;
};

export default useMobileDetection;
