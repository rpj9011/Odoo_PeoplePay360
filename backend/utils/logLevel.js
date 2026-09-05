/**
 * Console log levels for the backend.
 * Default: errors, warnings, and startup/critical events only.
 * Set VERBOSE_LOG=true for routine operational debug output.
 * Set PERF_LOG=true for performance/timing traces.
 */

const isVerbose = () => process.env.VERBOSE_LOG === 'true';
const isPerfLog = () => process.env.PERF_LOG === 'true';

const verboseLog = (...args) => {
    if (isVerbose()) console.log(...args);
};

const perfLog = (...args) => {
    if (isPerfLog()) console.log(...args);
};

module.exports = { isVerbose, isPerfLog, verboseLog, perfLog };
