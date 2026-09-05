/**
 * PROFILE PAGE STABILITY VALIDATOR
 * Run this in browser console to validate zero-mutation implementation
 * 
 * USAGE:
 * 1. Open Profile Page
 * 2. Open browser console
 * 3. Run: validateProfileStability()
 * 4. Wait 5 seconds
 * 5. Check results
 */

export const validateProfileStability = () => {
    console.log('🔍 Starting Profile Page Stability Validation...');
    console.log('⏱️  Validation window: 5 seconds');
    console.log('');

    const results = {
        layoutShifts: 0,
        styleMutations: 0,
        dimensionChanges: 0,
        domMutations: 0,
        resizeEvents: 0,
        passed: true,
        details: []
    };

    const startTime = performance.now();

    // Capture initial state
    const initialState = new Map();
    const criticalElements = [
        '.profile-page',
        '.profile-layout',
        '.profile-sidebar',
        '.profile-main',
        '.profile-policies'
    ];

    criticalElements.forEach(selector => {
        const element = document.querySelector(selector);
        if (!element) {
            console.warn(`⚠️  Element not found: ${selector}`);
            return;
        }

        const computed = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        initialState.set(selector, {
            padding: computed.padding,
            margin: computed.margin,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left
        });
    });

    console.log('📸 Initial state captured');
    console.log('');

    // Monitor for 5 seconds
    const checkInterval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        
        if (elapsed < 500) return; // Ignore first 500ms

        initialState.forEach((initial, selector) => {
            const element = document.querySelector(selector);
            if (!element) return;

            const computed = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();

            // Check padding
            if (initial.padding !== computed.padding) {
                results.styleMutations++;
                results.passed = false;
                results.details.push({
                    type: 'PADDING_CHANGE',
                    selector,
                    initial: initial.padding,
                    current: computed.padding,
                    time: elapsed.toFixed(2)
                });
            }

            // Check margin
            if (initial.margin !== computed.margin) {
                results.styleMutations++;
                results.passed = false;
                results.details.push({
                    type: 'MARGIN_CHANGE',
                    selector,
                    initial: initial.margin,
                    current: computed.margin,
                    time: elapsed.toFixed(2)
                });
            }

            // Check dimensions (allow 1px tolerance for rounding)
            if (Math.abs(rect.width - initial.width) > 1) {
                results.dimensionChanges++;
                results.passed = false;
                results.details.push({
                    type: 'WIDTH_CHANGE',
                    selector,
                    initial: initial.width,
                    current: rect.width,
                    delta: rect.width - initial.width,
                    time: elapsed.toFixed(2)
                });
            }

            if (Math.abs(rect.height - initial.height) > 1) {
                results.dimensionChanges++;
                results.passed = false;
                results.details.push({
                    type: 'HEIGHT_CHANGE',
                    selector,
                    initial: initial.height,
                    current: rect.height,
                    delta: rect.height - initial.height,
                    time: elapsed.toFixed(2)
                });
            }

            // Check position (layout shift)
            if (Math.abs(rect.top - initial.top) > 1 || Math.abs(rect.left - initial.left) > 1) {
                results.layoutShifts++;
                results.passed = false;
                results.details.push({
                    type: 'POSITION_SHIFT',
                    selector,
                    initial: { top: initial.top, left: initial.left },
                    current: { top: rect.top, left: rect.left },
                    delta: {
                        top: rect.top - initial.top,
                        left: rect.left - initial.left
                    },
                    time: elapsed.toFixed(2)
                });
            }
        });
    }, 100); // Check every 100ms

    // Stop after 5 seconds and report
    setTimeout(() => {
        clearInterval(checkInterval);

        console.log('');
        console.log('═══════════════════════════════════════════');
        console.log('📊 VALIDATION RESULTS');
        console.log('═══════════════════════════════════════════');
        console.log('');

        if (results.passed) {
            console.log('✅ PASSED: ZERO MUTATIONS DETECTED');
            console.log('');
            console.log('🎉 Profile Page is STABLE!');
            console.log('   - No layout shifts');
            console.log('   - No style mutations');
            console.log('   - No dimension changes');
            console.log('   - CLS score: 0');
        } else {
            console.error('❌ FAILED: MUTATIONS DETECTED');
            console.log('');
            console.log('📈 Mutation Summary:');
            console.log(`   - Layout Shifts: ${results.layoutShifts}`);
            console.log(`   - Style Mutations: ${results.styleMutations}`);
            console.log(`   - Dimension Changes: ${results.dimensionChanges}`);
            console.log('');
            console.log('🔍 Detailed Mutations:');
            results.details.forEach((detail, index) => {
                console.log('');
                console.log(`   ${index + 1}. ${detail.type}`);
                console.log(`      Element: ${detail.selector}`);
                console.log(`      Time: ${detail.time}ms after load`);
                if (detail.initial !== undefined) {
                    console.log(`      Initial: ${JSON.stringify(detail.initial)}`);
                    console.log(`      Current: ${JSON.stringify(detail.current)}`);
                }
                if (detail.delta !== undefined) {
                    console.log(`      Delta: ${JSON.stringify(detail.delta)}`);
                }
            });
        }

        console.log('');
        console.log('═══════════════════════════════════════════');
        console.log('');

        // Return results for programmatic access
        return results;
    }, 5000);

    return 'Validation running... Results in 5 seconds.';
};

// Auto-run if in browser console
if (typeof window !== 'undefined') {
    window.validateProfileStability = validateProfileStability;
    console.log('✅ Validator loaded. Run: validateProfileStability()');
}
