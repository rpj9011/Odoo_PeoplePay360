import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const useIdleDetection = () => {
  const { user, isAuthenticated } = useAuth();
  const [isIdle, setIsIdle] = useState(false);
  const [idleTime, setIdleTime] = useState(0);
  const [autoBreakActive, setAutoBreakActive] = useState(false);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const isBreakActiveRef = useRef(false);

  // Get user's auto-break settings
  const autoBreakEnabled = user?.featurePermissions?.autoBreakOnInactivity || false;
  const inactivityThreshold = (user?.featurePermissions?.inactivityThresholdMinutes || 5) * 60 * 1000; // Convert to milliseconds
  const warningThreshold = inactivityThreshold - (30 * 1000); // Show warning 30 seconds before auto-break

  // Reset idle timer
  const resetIdleTimer = useCallback(() => {
    if (!autoBreakEnabled || !isAuthenticated) return;
    
    lastActivityRef.current = Date.now();
    setIsIdle(false);
    setIdleTime(0);
    setShowIdleWarning(false);
    
    // Clear existing timers
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }

    // Set warning timer (30 seconds before auto-break)
    warningTimerRef.current = setTimeout(() => {
      if (!isBreakActiveRef.current) {
        setShowIdleWarning(true);
      }
    }, warningThreshold);

    // Set auto-break timer
    idleTimerRef.current = setTimeout(() => {
      if (!isBreakActiveRef.current) {
        triggerAutoBreak();
      }
    }, inactivityThreshold);
  }, [autoBreakEnabled, isAuthenticated, inactivityThreshold, warningThreshold]);

  // Trigger automatic unpaid break
  const triggerAutoBreak = useCallback(async () => {
    if (isBreakActiveRef.current) return;
    
    try {
      console.log('Triggering auto-break due to inactivity');
      isBreakActiveRef.current = true;
      setAutoBreakActive(true);
      setIsIdle(true);
      setShowIdleWarning(false);

      // Call backend to start auto-break
      const response = await api.post('/attendance/auto-break', {
        type: 'Auto-Unpaid-Break',
        reason: 'Inactivity detected'
      });

      if (response.data.success) {
        console.log('Auto-break started successfully');
        // Show notification to user
        // This will be handled by the component using this hook
      }
    } catch (error) {
      console.error('Failed to start auto-break:', error);
      isBreakActiveRef.current = false;
      setAutoBreakActive(false);
      setIsIdle(false);
    }
  }, []);

  // End auto-break manually
  const endAutoBreak = useCallback(async () => {
    if (!isBreakActiveRef.current) return;
    
    try {
      console.log('Ending auto-break');
      const response = await api.put('/attendance/end-break');
      
      if (response.data.success) {
        isBreakActiveRef.current = false;
        setAutoBreakActive(false);
        setIsIdle(false);
        setIdleTime(0);
        setShowIdleWarning(false);
        
        // Reset the idle timer
        resetIdleTimer();
        console.log('Auto-break ended successfully');
      }
    } catch (error) {
      console.error('Failed to end auto-break:', error);
    }
  }, [resetIdleTimer]);

  // Activity detection handlers
  const handleActivity = useCallback(() => {
    if (!autoBreakEnabled || !isAuthenticated) return;
    
    // Only reset if we're not already in an auto-break
    if (!isBreakActiveRef.current) {
      resetIdleTimer();
    }
  }, [autoBreakEnabled, isAuthenticated, resetIdleTimer]);

  // Set up event listeners
  useEffect(() => {
    if (!autoBreakEnabled || !isAuthenticated) {
      // Clean up timers if auto-break is disabled
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
      return;
    }

    // Add event listeners for user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Start the initial timer
    resetIdleTimer();

    // Cleanup function
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
    };
  }, [autoBreakEnabled, isAuthenticated, handleActivity, resetIdleTimer]);

  // Update idle time display
  useEffect(() => {
    if (!isIdle || !autoBreakActive) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      setIdleTime(Math.floor(timeSinceLastActivity / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isIdle, autoBreakActive]);

  // Check if user is currently on a break (from attendance system)
  useEffect(() => {
    const checkCurrentBreakStatus = async () => {
      if (!isAuthenticated) return;
      
      try {
        const response = await api.get('/attendance/current-status');
        const { isOnBreak, breakType } = response.data;
        
        if (isOnBreak && breakType === 'Auto-Unpaid-Break') {
          isBreakActiveRef.current = true;
          setAutoBreakActive(true);
          setIsIdle(true);
        }
      } catch (error) {
        console.error('Failed to check current break status:', error);
      }
    };

    checkCurrentBreakStatus();
  }, [isAuthenticated]);

  return {
    isIdle,
    idleTime,
    autoBreakActive,
    showIdleWarning,
    autoBreakEnabled,
    inactivityThreshold: Math.floor(inactivityThreshold / 1000), // Return in seconds
    endAutoBreak,
    resetIdleTimer
  };
};

export default useIdleDetection;


