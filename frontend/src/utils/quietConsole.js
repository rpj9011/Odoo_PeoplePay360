// Disable noisy console logging in production builds while keeping warnings
// and errors visible for troubleshooting. Toggle logs by setting the global
// flag __ENABLE_CONSOLE_LOGS__ before this script runs (useful for debugging
// production issues without a rebuild).
if (typeof window !== 'undefined' && import.meta.env.PROD && !window.__ENABLE_CONSOLE_LOGS__) {
  const noop = () => {};

  // Keep errors and warnings, silence the rest.
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.trace = noop;
  console.table = noop;
}






















