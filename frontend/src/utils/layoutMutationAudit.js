/**
 * LAYOUT MUTATION AUDIT SYSTEM
 * Evidence-driven detection of post-load layout mutations
 * 
 * CRITICAL: This detects ALL sources of layout shift:
 * - Style attribute mutations
 * - Class name changes
 * - DOM structure changes
 * - Component re-mounts
 * - API-driven re-renders
 */

let mutationObserver = null;
let componentMountCounts = new Map();
let apiCallLog = [];
let layoutShiftLog = [];

/**
 * Track component mounts/remounts
 */
export const trackComponentMount = (componentName) => {
    const count = (componentMountCounts.get(componentName) || 0) + 1;
    componentMountCounts.set(componentName, count);
    
    if (count > 1) {
        console.error(`🚨 COMPONENT REMOUNT DETECTED: ${componentName} (mount #${count})`);
        console.trace('Mount stack trace:');
    } else {
        console.log(`✅ Component mounted: ${componentName}`);
    }
    
    return count;
};

/**
 * Track API calls that trigger re-renders
 */
export const trackAPICall = (endpoint, triggerTime) => {
    const logEntry = {
        endpoint,
        triggerTime,
        timestamp: Date.now()
    };
    
    apiCallLog.push(logEntry);
    console.warn(`📡 API CALL: ${endpoint} at ${triggerTime}ms after load`);
    
    return logEntry;
};

/**
 * Detect style mutations
 */
const detectStyleMutation = (mutation) => {
    const target = mutation.target;
    const oldValue = mutation.oldValue;
    const newValue = target.getAttribute('style');
    
    if (oldValue !== newValue) {
        const logEntry = {
            type: 'STYLE_MUTATION',
            element: target.className || target.tagName,
            oldValue,
            newValue,
            timestamp: Date.now()
        };
        
        layoutShiftLog.push(logEntry);
        console.error('🚨 STYLE MUTATION DETECTED:', logEntry);
        console.log('Element:', target);
        console.trace('Mutation stack trace:');
    }
};

/**
 * Detect class mutations
 */
const detectClassMutation = (mutation) => {
    const target = mutation.target;
    const oldValue = mutation.oldValue;
    const newValue = target.className;
    
    if (oldValue !== newValue) {
        const logEntry = {
            type: 'CLASS_MUTATION',
            element: target.tagName,
            oldValue,
            newValue,
            timestamp: Date.now()
        };
        
        layoutShiftLog.push(logEntry);
        console.error('🚨 CLASS MUTATION DETECTED:', logEntry);
        console.log('Element:', target);
    }
};

/**
 * Detect DOM structure mutations
 */
const detectDOMMutation = (mutation) => {
    if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
        const logEntry = {
            type: 'DOM_MUTATION',
            target: mutation.target.className || mutation.target.tagName,
            added: mutation.addedNodes.length,
            removed: mutation.removedNodes.length,
            timestamp: Date.now()
        };
        
        layoutShiftLog.push(logEntry);
        console.error('🚨 DOM STRUCTURE MUTATION:', logEntry);
        console.log('Target:', mutation.target);
    }
};

/**
 * Start layout mutation audit
 */
export const auditLayoutMutations = () => {
    console.log('🔍 LAYOUT MUTATION AUDIT STARTED');
    console.log('⏱️  Monitoring for 10 seconds...');
    console.log('');
    
    // Reset logs
    componentMountCounts.clear();
    apiCallLog = [];
    layoutShiftLog = [];
    
    // Create mutation observer
    mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            // Detect style mutations
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                detectStyleMutation(mutation);
            }
            
            // Detect class mutations
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                detectClassMutation(mutation);
            }
            
            // Detect DOM structure mutations
            if (mutation.type === 'childList') {
                detectDOMMutation(mutation);
            }
        });
    });
    
    // Start observing
    mutationObserver.observe(document.body, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        subtree: true
    });
    
    // Stop after 10 seconds and generate report
    setTimeout(() => {
        stopAudit();
        generateReport();
    }, 10000);
};

/**
 * Stop audit
 */
export const stopAudit = () => {
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
};

/**
 * Generate audit report
 */
export const generateReport = () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 LAYOUT MUTATION AUDIT REPORT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    // Component remounts
    console.log('🔄 COMPONENT REMOUNTS:');
    let hasRemounts = false;
    componentMountCounts.forEach((count, name) => {
        if (count > 1) {
            console.error(`   ❌ ${name}: ${count} mounts (SHOULD BE 1)`);
            hasRemounts = true;
        } else {
            console.log(`   ✅ ${name}: ${count} mount`);
        }
    });
    if (!hasRemounts) {
        console.log('   ✅ No remounts detected');
    }
    console.log('');
    
    // API calls
    console.log('📡 API CALLS AFTER LOAD:');
    if (apiCallLog.length === 0) {
        console.log('   ✅ No API calls detected');
    } else {
        apiCallLog.forEach((log) => {
            console.warn(`   ⚠️  ${log.endpoint} at ${log.triggerTime}ms`);
        });
    }
    console.log('');
    
    // Layout shifts
    console.log('🚨 LAYOUT MUTATIONS:');
    if (layoutShiftLog.length === 0) {
        console.log('   ✅ No layout mutations detected');
    } else {
        const styleMutations = layoutShiftLog.filter(l => l.type === 'STYLE_MUTATION');
        const classMutations = layoutShiftLog.filter(l => l.type === 'CLASS_MUTATION');
        const domMutations = layoutShiftLog.filter(l => l.type === 'DOM_MUTATION');
        
        console.error(`   ❌ Style mutations: ${styleMutations.length}`);
        console.error(`   ❌ Class mutations: ${classMutations.length}`);
        console.error(`   ❌ DOM mutations: ${domMutations.length}`);
        console.log('');
        console.log('   Detailed log:');
        layoutShiftLog.forEach((log, index) => {
            console.error(`   ${index + 1}. ${log.type}:`, log);
        });
    }
    console.log('');
    
    // Summary
    const totalIssues = 
        Array.from(componentMountCounts.values()).filter(c => c > 1).length +
        apiCallLog.length +
        layoutShiftLog.length;
    
    if (totalIssues === 0) {
        console.log('✅ AUDIT PASSED: NO MUTATIONS DETECTED');
    } else {
        console.error(`❌ AUDIT FAILED: ${totalIssues} ISSUES DETECTED`);
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    
    return {
        componentMountCounts: Object.fromEntries(componentMountCounts),
        apiCallLog,
        layoutShiftLog,
        totalIssues
    };
};

/**
 * Get current audit data
 */
export const getAuditData = () => {
    return {
        componentMountCounts: Object.fromEntries(componentMountCounts),
        apiCallLog,
        layoutShiftLog
    };
};

// Export to window for console access
if (typeof window !== 'undefined') {
    window.auditLayoutMutations = auditLayoutMutations;
    window.stopAudit = stopAudit;
    window.generateReport = generateReport;
    window.getAuditData = getAuditData;
}
