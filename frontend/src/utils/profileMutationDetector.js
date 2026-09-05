/**
 * PROFILE PAGE MUTATION DETECTOR
 * Runtime inspector to detect and log ALL post-load UI mutations
 * 
 * USAGE:
 * import { startMutationDetection, stopMutationDetection } from './utils/profileMutationDetector';
 * 
 * In ProfilePage useEffect:
 * useEffect(() => {
 *   const cleanup = startMutationDetection();
 *   return cleanup;
 * }, []);
 */

// Track initial render timestamp
let initialRenderTime = null;
let mutationObserver = null;
let resizeObserver = null;
let styleObserver = null;

// Store initial layout metrics
const initialMetrics = {
    styles: new Map(),
    dimensions: new Map(),
    positions: new Map()
};

/**
 * Capture initial layout state
 */
const captureInitialState = () => {
    initialRenderTime = performance.now();
    
    const profilePage = document.querySelector('.profile-page');
    if (!profilePage) return;

    // Capture all critical elements
    const criticalElements = [
        '.profile-page',
        '.profile-container',
        '.profile-layout',
        '.profile-sidebar',
        '.profile-main',
        '.profile-policies',
        '.profile-avatar-section',
        '.profile-info-section',
        '.profile-card',
        '.team-info-grid',
        '.profile-form-grid'
    ];

    criticalElements.forEach(selector => {
        const element = document.querySelector(selector);
        if (!element) return;

        const computed = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        // Store computed styles
        initialMetrics.styles.set(selector, {
            padding: computed.padding,
            margin: computed.margin,
            width: computed.width,
            height: computed.height,
            gridTemplateColumns: computed.gridTemplateColumns,
            fontSize: computed.fontSize,
            lineHeight: computed.lineHeight,
            gap: computed.gap
        });

        // Store dimensions
        initialMetrics.dimensions.set(selector, {
            width: rect.width,
            height: rect.height
        });

        // Store positions
        initialMetrics.positions.set(selector, {
            top: rect.top,
            left: rect.left
        });
    });

    console.log('📸 Initial layout state captured at', initialRenderTime.toFixed(2), 'ms');
};

/**
 * Detect CSS style mutations
 */
const detectStyleChanges = () => {
    const now = performance.now();
    const timeSinceRender = now - initialRenderTime;

    if (timeSinceRender < 100) return; // Ignore first 100ms (initial render)

    initialMetrics.styles.forEach((initialStyle, selector) => {
        const element = document.querySelector(selector);
        if (!element) return;

        const currentStyle = window.getComputedStyle(element);

        // Check each tracked property
        Object.keys(initialStyle).forEach(prop => {
            if (initialStyle[prop] !== currentStyle[prop]) {
                console.warn('🚨 CSS MUTATION DETECTED', {
                    selector,
                    property: prop,
                    initial: initialStyle[prop],
                    current: currentStyle[prop],
                    timeAfterLoad: `${timeSinceRender.toFixed(2)}ms`,
                    timestamp: new Date().toISOString()
                });
            }
        });
    });
};

/**
 * Detect dimension changes
 */
const detectDimensionChanges = () => {
    const now = performance.now();
    const timeSinceRender = now - initialRenderTime;

    if (timeSinceRender < 100) return;

    initialMetrics.dimensions.forEach((initialDim, selector) => {
        const element = document.querySelector(selector);
        if (!element) return;

        const rect = element.getBoundingClientRect();

        if (Math.abs(rect.width - initialDim.width) > 1 || 
            Math.abs(rect.height - initialDim.height) > 1) {
            console.warn('🚨 DIMENSION MUTATION DETECTED', {
                selector,
                initial: initialDim,
                current: { width: rect.width, height: rect.height },
                delta: {
                    width: rect.width - initialDim.width,
                    height: rect.height - initialDim.height
                },
                timeAfterLoad: `${timeSinceRender.toFixed(2)}ms`,
                timestamp: new Date().toISOString()
            });
        }
    });
};

/**
 * Start mutation detection
 */
export const startMutationDetection = () => {
    console.log('🔍 Starting Profile Page Mutation Detection...');

    // Wait for initial render
    setTimeout(() => {
        captureInitialState();

        // 1. DOM Mutation Observer
        mutationObserver = new MutationObserver((mutations) => {
            const now = performance.now();
            const timeSinceRender = now - initialRenderTime;

            if (timeSinceRender < 100) return; // Ignore initial render

            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    console.warn('🚨 INLINE STYLE MUTATION', {
                        element: mutation.target.className,
                        timeAfterLoad: `${timeSinceRender.toFixed(2)}ms`,
                        timestamp: new Date().toISOString()
                    });
                }

                if (mutation.type === 'childList') {
                    console.warn('🚨 DOM STRUCTURE MUTATION', {
                        added: mutation.addedNodes.length,
                        removed: mutation.removedNodes.length,
                        target: mutation.target.className,
                        timeAfterLoad: `${timeSinceRender.toFixed(2)}ms`,
                        timestamp: new Date().toISOString()
                    });
                }

                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    console.warn('🚨 CLASS NAME MUTATION', {
                        element: mutation.target.className,
                        timeAfterLoad: `${timeSinceRender.toFixed(2)}ms`,
                        timestamp: new Date().toISOString()
                    });
                }
            });
        });

        const profilePage = document.querySelector('.profile-page');
        if (profilePage) {
            mutationObserver.observe(profilePage, {
                attributes: true,
                childList: true,
                subtree: true,
                attributeOldValue: true
            });
        }

        // 2. Resize Observer (detect layout recalculations)
        resizeObserver = new ResizeObserver((entries) => {
            const now = performance.now();
            const timeSinceRender = now - initialRenderTime;

            if (timeSinceRender < 100) return;

            entries.forEach((entry) => {
                const element = entry.target;
                console.warn('🚨 RESIZE DETECTED', {
                    element: element.className,
                    size: {
                        width: entry.contentRect.width,
                        height: entry.contentRect.height
                    },
                    timeAfterLoad: `${timeSinceRender.toFixed(2)}ms`,
                    timestamp: new Date().toISOString()
                });
            });
        });

        const criticalElements = document.querySelectorAll(
            '.profile-layout, .profile-sidebar, .profile-main, .profile-policies'
        );
        criticalElements.forEach(el => resizeObserver.observe(el));

        // 3. Periodic style checks (detect CSS injection)
        styleObserver = setInterval(() => {
            detectStyleChanges();
            detectDimensionChanges();
        }, 500); // Check every 500ms for 5 seconds

        // Stop after 5 seconds
        setTimeout(() => {
            if (styleObserver) {
                clearInterval(styleObserver);
                console.log('✅ Mutation detection completed (5s window)');
            }
        }, 5000);

    }, 100); // Wait 100ms for initial render

    // Return cleanup function
    return () => {
        if (mutationObserver) mutationObserver.disconnect();
        if (resizeObserver) resizeObserver.disconnect();
        if (styleObserver) clearInterval(styleObserver);
        console.log('🛑 Mutation detection stopped');
    };
};

/**
 * Stop mutation detection manually
 */
export const stopMutationDetection = () => {
    if (mutationObserver) mutationObserver.disconnect();
    if (resizeObserver) resizeObserver.disconnect();
    if (styleObserver) clearInterval(styleObserver);
    console.log('🛑 Mutation detection stopped manually');
};

/**
 * Get mutation report
 */
export const getMutationReport = () => {
    return {
        initialRenderTime,
        initialMetrics,
        timestamp: new Date().toISOString()
    };
};
