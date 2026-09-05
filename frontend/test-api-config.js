// Test script to verify API configuration
// Run with: node test-api-config.js

console.log('=== API Configuration Test ===\n');

// Simulate Vite environment variables
const mockEnv = {
  DEV: true,
  VITE_API_BASE_URL: 'https://attendance-test.bylinelms.com'
};

console.log('Environment Variables:');
console.log('  DEV:', mockEnv.DEV);
console.log('  VITE_API_BASE_URL:', mockEnv.VITE_API_BASE_URL);
console.log('');

// Simulate production same-origin logic from frontend/src/utils/apiBaseUrl.js
function getApiBaseUrl(env) {
  if (env.DEV) return '/api';
  const configured = env.VITE_API_BASE_URL?.trim();
  if (configured) {
    const trimmed = configured.replace(/\/$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
  return '/api';
}

const devBaseURL = getApiBaseUrl({ DEV: true });
const prodBaseURL = getApiBaseUrl({ DEV: false, VITE_API_BASE_URL: undefined });
const prodConfiguredBaseURL = getApiBaseUrl({ DEV: false, VITE_API_BASE_URL: mockEnv.VITE_API_BASE_URL });

console.log('Calculated baseURL (dev):', devBaseURL);
console.log('Calculated baseURL (prod, same-origin):', prodBaseURL);
console.log('Calculated baseURL (prod, configured):', prodConfiguredBaseURL);
console.log('');

// Test API call paths
const testPaths = [
  '/leaves/request',
  '/attendance/my-weekly-log',
  '/admin/leaves',
  '/auth/me'
];

console.log('API Call Examples (dev):');
console.log('─────────────────────────────────────────────────────────');
testPaths.forEach(path => {
  const fullUrl = devBaseURL + path;
  console.log(`  api.post('${path}')`);
  console.log(`  → Frontend: http://localhost:5173${fullUrl}`);
  console.log(`  → Proxied to: http://127.0.0.1:3011${fullUrl}`);
  console.log('');
});

console.log('API Call Examples (prod, same-origin):');
console.log('─────────────────────────────────────────────────────────');
testPaths.forEach(path => {
  const fullUrl = prodBaseURL + path;
  console.log(`  api.post('${path}')`);
  console.log(`  → https://attendance-test.bylinelms.com${fullUrl}`);
  console.log('');
});

console.log('=== Configuration Summary ===');
console.log('✅ Development Mode:');
console.log('   - Frontend: http://localhost:5173');
console.log('   - Backend: http://127.0.0.1:3011');
console.log('   - Proxy: /api → http://127.0.0.1:3011/api');
console.log('');
console.log('✅ Production Mode:');
console.log('   - Frontend: https://attendance-test.bylinelms.com');
console.log('   - Backend: https://attendance-test.bylinelms.com/api');
console.log('   - Direct: No proxy needed');
console.log('');

console.log('=== Troubleshooting ===');
console.log('If you see 400 Bad Request:');
console.log('1. Check backend is running: curl http://127.0.0.1:3011/api/health');
console.log('2. Verify backend port in backend/.env: PORT=3011');
console.log('3. Restart Vite dev server: npm run dev');
console.log('4. Check browser console for axios baseURL log');
console.log('5. Check network tab - request should go to localhost:5173/api/*');
console.log('');
