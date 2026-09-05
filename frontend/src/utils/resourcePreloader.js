// Resource preloading utility for 300ms performance budget
// Preloads critical resources to reduce loading times

const preloadedResources = new Set();

/**
 * Preload a JavaScript module
 * @param {Function} importFn - Dynamic import function
 * @param {string} resourceId - Unique identifier for the resource
 */
export const preloadModule = async (importFn, resourceId) => {
    if (preloadedResources.has(resourceId)) {
        return; // Already preloaded
    }

    try {
        await importFn();
        preloadedResources.add(resourceId);
        console.log(`[Preload] Successfully preloaded module: ${resourceId}`);
    } catch (error) {
        console.warn(`[Preload] Failed to preload module: ${resourceId}`, error);
    }
};

/**
 * Preload critical resources after app initialization
 */
export const preloadCriticalResources = () => {
    // Preload critical pages after initial load
    setTimeout(() => {
        // Preload dashboard pages
        preloadModule(() => import('../pages/EmployeeDashboardPage'), 'employee-dashboard');
        preloadModule(() => import('../pages/AdminDashboardPage'), 'admin-dashboard');

        // Preload commonly accessed pages (SKIP protected routes)
        setTimeout(() => {
            // REMOVED: preloadModule(() => import('../pages/LeavesPage'), 'leaves-page');
            // REMOVED: preloadModule(() => import('../pages/ProfilePage'), 'profile-page');
            preloadModule(() => import('../pages/EmployeesPage'), 'employees-page');
            preloadModule(() => import('../pages/AttendanceSummaryPage'), 'attendance-summary-page');
        }, 2000);
    }, 3000); // Wait 3s after app load to avoid blocking initial render
};

/**
 * Preload fonts and other assets
 */
export const preloadAssets = () => {
    // Preload critical fonts if needed
    // const fontLink = document.createElement('link');
    // fontLink.rel = 'preload';
    // fontLink.href = '/fonts/critical-font.woff2';
    // fontLink.as = 'font';
    // fontLink.type = 'font/woff2';
    // fontLink.crossOrigin = 'anonymous';
    // document.head.appendChild(fontLink);
};

/**
 * Intersection Observer for lazy loading below-fold content
 */
export const createLazyLoader = () => {
    const lazyElements = new Map();

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    const lazyFn = lazyElements.get(element);

                    if (lazyFn) {
                        lazyFn();
                        lazyElements.delete(element);
                        observer.unobserve(element);
                    }
                }
            });
        },
        {
            rootMargin: '50px', // Start loading 50px before element comes into view
            threshold: 0.1,
        }
    );

    return {
        observe: (element, lazyFn) => {
            lazyElements.set(element, lazyFn);
            observer.observe(element);
        },
        unobserve: (element) => {
            lazyElements.delete(element);
            observer.unobserve(element);
        },
        disconnect: () => {
            observer.disconnect();
            lazyElements.clear();
        },
    };
};

/**
 * Lazy load component with intersection observer
 * @param {Function} importFn - Dynamic import function
 * @param {Function} fallback - Loading component
 */
export const lazyLoadComponent = (importFn, fallback = null) => {
    return React.lazy(() =>
        importFn().catch((error) => {
            console.error('Lazy loading failed:', error);
            // Return a fallback component or rethrow
            if (fallback) {
                return { default: fallback };
            }
            throw error;
        })
    );
};