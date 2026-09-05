// frontend/src/hooks/useBreakWindowScheduler.js
import { useEffect, useRef } from 'react';
import { getISTNow } from '../utils/istTime';

/**
 * Event-driven break window scheduler using setTimeout (NO polling/intervals)
 * 
 * Automatically schedules timeouts to fire exactly at break window boundaries:
 * - When a window opens (startTime) → triggers re-evaluation
 * - When a window closes (endTime) → triggers re-evaluation
 * 
 * @param {Object} options
 * @param {Array} options.breakWindows - Array of break window objects with startTime/endTime
 * @param {boolean} options.isClockedIn - Whether user is currently clocked in
 * @param {Function} options.onTrigger - Callback to invoke when boundary is reached
 */
export const useBreakWindowScheduler = ({ breakWindows, isClockedIn, onTrigger }) => {
    const timeoutRef = useRef(null);
    const isSchedulingRef = useRef(false);

    useEffect(() => {
        // Cleanup function to clear any existing timeout
        const clearScheduledTimeout = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };

        // Guard: Don't schedule if not clocked in
        if (!isClockedIn) {
            clearScheduledTimeout();
            return;
        }

        // Guard: Don't schedule if no break windows configured
        if (!Array.isArray(breakWindows) || breakWindows.length === 0) {
            clearScheduledTimeout();
            return;
        }

        // Guard: Prevent duplicate scheduling during React StrictMode
        if (isSchedulingRef.current) {
            return;
        }

        /**
         * Calculate the next break window boundary (start or end time)
         * Returns { delay: milliseconds, boundaryType: 'start'|'end', windowName: string } or null
         */
        const calculateNextBoundary = () => {
            const now = getISTNow();
            const currentTimeMs = now.getTime();

            // Get today's date in IST for constructing boundary times
            const todayIST = new Date(now);
            todayIST.setHours(0, 0, 0, 0);

            let nearestBoundary = null;
            let minDelay = Infinity;

            // Iterate through all active break windows
            for (const window of breakWindows) {
                // Skip inactive windows
                if (window.isActive === false) continue;

                // Skip windows without valid time strings
                if (!window.startTime || !window.endTime) continue;

                try {
                    // Parse start time (HH:MM format)
                    const [startHour, startMinute] = window.startTime.split(':').map(Number);
                    const startTimeToday = new Date(todayIST);
                    startTimeToday.setHours(startHour, startMinute, 0, 0);
                    const startTimeMs = startTimeToday.getTime();

                    // Parse end time (HH:MM format)
                    const [endHour, endMinute] = window.endTime.split(':').map(Number);
                    const endTimeToday = new Date(todayIST);
                    endTimeToday.setHours(endHour, endMinute, 0, 0);
                    const endTimeMs = endTimeToday.getTime();

                    // Check if start time is in the future (window hasn't opened yet)
                    if (currentTimeMs < startTimeMs) {
                        const delay = startTimeMs - currentTimeMs;
                        if (delay < minDelay && delay > 0) {
                            minDelay = delay;
                            nearestBoundary = {
                                delay,
                                boundaryType: 'start',
                                windowName: window.name || window.type,
                                windowType: window.type
                            };
                        }
                    }
                    // Check if we're currently inside the window (need to schedule end)
                    else if (currentTimeMs >= startTimeMs && currentTimeMs < endTimeMs) {
                        const delay = endTimeMs - currentTimeMs;
                        if (delay < minDelay && delay > 0) {
                            minDelay = delay;
                            nearestBoundary = {
                                delay,
                                boundaryType: 'end',
                                windowName: window.name || window.type,
                                windowType: window.type
                            };
                        }
                    }
                    // Window has already passed today - ignore
                } catch (error) {
                    // Skip malformed time strings
                    console.warn('[useBreakWindowScheduler] Invalid time format in window:', window);
                }
            }

            return nearestBoundary;
        };

        /**
         * Schedule the next boundary timeout
         */
        const scheduleNextBoundary = () => {
            // Prevent duplicate scheduling
            if (isSchedulingRef.current) return;
            isSchedulingRef.current = true;

            try {
                // Clear any existing timeout
                clearScheduledTimeout();

                // Calculate next boundary
                const boundary = calculateNextBoundary();

                // No upcoming boundaries today
                if (!boundary) {
                    isSchedulingRef.current = false;
                    return;
                }

                // Guard against setTimeout overflow (max 32-bit signed integer)
                // Max safe timeout is ~24.8 days (2147483647 ms)
                const MAX_TIMEOUT_MS = 2147483647;
                if (boundary.delay > MAX_TIMEOUT_MS) {
                    console.warn('[useBreakWindowScheduler] Delay exceeds max timeout, skipping schedule');
                    isSchedulingRef.current = false;
                    return;
                }

                // Schedule timeout to fire at boundary
                timeoutRef.current = setTimeout(() => {
                    // Trigger re-evaluation callback
                    if (onTrigger && typeof onTrigger === 'function') {
                        onTrigger();
                    }

                    // Reset scheduling flag
                    isSchedulingRef.current = false;

                    // Automatically schedule next boundary
                    scheduleNextBoundary();
                }, boundary.delay);

                // Reset scheduling flag after successful schedule
                isSchedulingRef.current = false;
            } catch (error) {
                console.error('[useBreakWindowScheduler] Error scheduling boundary:', error);
                isSchedulingRef.current = false;
            }
        };

        // Initial schedule
        scheduleNextBoundary();

        // Cleanup on unmount or dependency change
        return () => {
            clearScheduledTimeout();
            isSchedulingRef.current = false;
        };
    }, [breakWindows, isClockedIn, onTrigger]);

    // No return value needed - hook manages scheduling internally
};

export default useBreakWindowScheduler;
