// Route prefetching utility for 300ms performance budget
// Implements intelligent prefetching on hover/focus for critical routes

const prefetchedRoutes = new Set();
const prefetchTimeouts = new Map();

// CRITICAL: Routes that should NOT be prefetched (zero-mutation requirement)
const NO_PREFETCH_ROUTES = ['/profile', '/leaves'];

/**
 * Prefetch a route component
 * @param {string} route - Route path to prefetch
 * @param {Function} importFn - Dynamic import function
 * @param {number} delay - Delay before prefetching (default: 100ms)
 */
export const prefetchRoute = (route, importFn, delay = 100) => {
    // CRITICAL: Skip prefetch for protected routes
    if (NO_PREFETCH_ROUTES.includes(route)) {
        console.log(`[Prefetch] Skipping protected route: ${route}`);
        return;
    }

    if (prefetchedRoutes.has(route)) {
        return; // Already prefetched
    }

    // Clear existing timeout for this route
    if (prefetchTimeouts.has(route)) {
        clearTimeout(prefetchTimeouts.get(route));
    }

    // Set new prefetch timeout
    const timeoutId = setTimeout(async () => {
        try {
            await importFn();
            prefetchedRoutes.add(route);
            console.log(`[Prefetch] Successfully prefetched: ${route}`);
        } catch (error) {
            console.warn(`[Prefetch] Failed to prefetch: ${route}`, error);
        }
    }, delay);

    prefetchTimeouts.set(route, timeoutId);
};

/**
 * Cancel prefetch for a route
 * @param {string} route - Route path
 */
export const cancelPrefetch = (route) => {
    if (prefetchTimeouts.has(route)) {
        clearTimeout(prefetchTimeouts.get(route));
        prefetchTimeouts.delete(route);
    }
};

/**
 * Setup prefetch listeners for navigation elements
 * @param {Object} routeMap - Map of route paths to import functions
 */
export const setupPrefetchListeners = (routeMap) => {
    // Prefetch critical routes on app load (after initial render)
    setTimeout(() => {
        // Prefetch dashboard routes immediately
        prefetchRoute('/dashboard', routeMap['/dashboard'], 0);

        // Prefetch common routes after a short delay (SKIP protected routes)
        setTimeout(() => {
            // REMOVED: prefetchRoute('/leaves', routeMap['/leaves'], 0);
            // REMOVED: prefetchRoute('/profile', routeMap['/profile'], 0);
            prefetchRoute('/attendance-summary', routeMap['/attendance-summary'], 0);
        }, 1000);
    }, 2000); // Wait 2s after app load

    // Listen for navigation hover/focus events
    document.addEventListener('mouseover', handleNavigationIntent, true);
    document.addEventListener('focusin', handleNavigationIntent, true);
    document.addEventListener('mouseout', handleNavigationCancel, true);
    document.addEventListener('focusout', handleNavigationCancel, true);

    function handleNavigationIntent(event) {
        const link = event.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (routeMap[href]) {
            prefetchRoute(href, routeMap[href]);
        }
    }

    function handleNavigationCancel(event) {
        const link = event.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (routeMap[href]) {
            cancelPrefetch(href);
        }
    }
};

/**
 * Route map for prefetching
 * Maps route paths to their lazy import functions
 */
export const routePrefetchMap = {
    '/dashboard': () => import('../pages/EmployeeDashboardPage'),
    '/admin/dashboard': () => import('../pages/AdminDashboardPage'),
    '/leaves': () => import('../pages/LeavesPage'),
    '/employees': () => import('../pages/EmployeesPage'),
    '/admin/leaves': () => import('../pages/AdminLeavesPage'),
    '/reports': () => import('../pages/ReportsPage'),
    '/profile': () => import('../pages/ProfilePage'),
    '/attendance-summary': () => import('../pages/AttendanceSummaryPage'),
    '/admin/attendance-summary': () => import('../pages/AdminAttendanceSummaryPage'),
    '/activity-log': () => import('../pages/NewActivityLogPage'),
    '/shifts': () => import('../pages/SchedulingManagementPage'),
    '/scheduling-management': () => import('../pages/SchedulingManagementPage'),
    '/probation': () => import('../pages/ProbationPage'),
};