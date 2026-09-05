// frontend/src/utils/apiCache.js
// Request deduplication and caching layer for performance optimization

const pendingRequests = new Map();
const responseCache = new Map();
const CACHE_TTL = 15000; // 15 seconds default cache (increased for performance)
const STALE_WHILE_REVALIDATE_TTL = 30000; // 30 seconds for stale-while-revalidate

/**
 * Creates a cache key from request config
 */
const getCacheKey = (config) => {
  const { method, url, params, data } = config;
  const paramsStr = params ? JSON.stringify(params) : '';
  const dataStr = data ? JSON.stringify(data) : '';
  return `${method}:${url}:${paramsStr}:${dataStr}`;
};

/**
 * Checks if cached response is still valid
 */
const isCacheValid = (cached) => {
  if (!cached) return false;
  const age = Date.now() - cached.timestamp;
  return age < cached.ttl;
};

/**
 * Checks if cached response can be served stale while revalidating
 */
const canServeStale = (cached) => {
  if (!cached) return false;
  const age = Date.now() - cached.timestamp;
  return age < cached.staleTtl;
};

/**
 * Deduplicates and caches API requests with stale-while-revalidate
 * @param {Function} apiCall - The actual API call function
 * @param {Object} config - Request config
 * @param {Object} options - { cache: boolean, ttl: number, skipCache: boolean, staleWhileRevalidate: boolean }
 */
export const cachedApiCall = async (apiCall, config, options = {}) => {
  const {
    cache = true,
    ttl = CACHE_TTL,
    skipCache = false,
    staleWhileRevalidate = true
  } = options;
  const cacheKey = getCacheKey(config);

  // Skip cache for POST/PUT/DELETE/PATCH (mutations)
  const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method?.toUpperCase());
  if (isMutation || skipCache) {
    return apiCall();
  }

  const cached = cache ? responseCache.get(cacheKey) : null;

  // Check for fresh cache first
  if (cached && isCacheValid(cached)) {
    return Promise.resolve(cached.response);
  }

  // Stale-while-revalidate: serve stale data immediately and refresh in background
  if (staleWhileRevalidate && cached && canServeStale(cached)) {
    // Serve stale data immediately
    const staleResponse = Promise.resolve(cached.response);

    // Revalidate in background (don't await)
    apiCall()
      .then((freshResponse) => {
        // Update cache with fresh data
        if (cache && config.method?.toUpperCase() === 'GET') {
          responseCache.set(cacheKey, {
            response: freshResponse,
            timestamp: Date.now(),
            ttl,
            staleTtl: STALE_WHILE_REVALIDATE_TTL,
          });
        }
      })
      .catch((error) => {
        console.warn('[Cache] Background revalidation failed:', error);
      });

    return staleResponse;
  }

  // Check if request is already in flight (deduplication)
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  // Make the request
  const requestPromise = apiCall()
    .then((response) => {
      // Cache successful GET requests
      if (cache && config.method?.toUpperCase() === 'GET') {
        responseCache.set(cacheKey, {
          response,
          timestamp: Date.now(),
          ttl,
          staleTtl: STALE_WHILE_REVALIDATE_TTL,
        });
      }
      return response;
    })
    .finally(() => {
      // Remove from pending requests
      pendingRequests.delete(cacheKey);
    });

  // Store pending request for deduplication
  pendingRequests.set(cacheKey, requestPromise);

  return requestPromise;
};

/**
 * Clears cache for a specific URL pattern or all cache
 */
export const clearCache = (urlPattern = null) => {
  if (!urlPattern) {
    responseCache.clear();
    return;
  }

  // Clear cache entries matching the pattern
  for (const [key] of responseCache) {
    if (key.includes(urlPattern)) {
      responseCache.delete(key);
    }
  }
};

/**
 * Clears all pending requests (useful for cleanup)
 */
export const clearPendingRequests = () => {
  pendingRequests.clear();
};

// --- Dashboard-specific cache (separate namespace from generic responseCache) ---
const dashboardCache = new Map();

/** TTL for the full dashboard summary (matches backend dashboardCache TTL of 60s). */
export const DASHBOARD_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/** TTL for pending leaves only (matches backend pendingLeaves TTL of 45s). */
export const DASHBOARD_PENDING_TTL_MS = 45 * 1000; // 45 seconds

/** Stale window — data older than TTL but within this window is served instantly
 *  while a background refresh runs. */
export const DASHBOARD_STALE_WINDOW_MS = 30 * 1000; // 30 extra seconds stale window

export const DASHBOARD_CACHE_KEYS = {
  summary: 'dashboard:summary',
  pending: 'dashboard:pending',
};

/**
 * Get dashboard cache entry. Returns the entry (fresh or stale) or null if absent.
 * Caller must use isDashboardCacheFresh() to decide whether to serve or refresh.
 */
export function getDashboardCache(key) {
  return dashboardCache.get(key) ?? null;
}

/** Returns true only if the entry exists and is within its TTL. */
export function isDashboardCacheFresh(key) {
  const entry = dashboardCache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < entry.ttlMs;
}

/** Returns true if entry is stale but still within the stale-serve window. */
export function isDashboardCacheServable(key) {
  const entry = dashboardCache.get(key);
  if (!entry) return false;
  const age = Date.now() - entry.timestamp;
  return age < entry.ttlMs + DASHBOARD_STALE_WINDOW_MS;
}

/** Store a dashboard cache entry. */
export function setDashboardCache(key, data, ttlMs = DASHBOARD_CACHE_TTL_MS) {
  dashboardCache.set(key, { data, timestamp: Date.now(), ttlMs });
}

/** Invalidate all dashboard cache entries (call after any mutation). */
export function invalidateDashboardCache() {
  dashboardCache.clear();
}

// --- Employee Dashboard-specific cache ---
const employeeDashboardCache = new Map();

/** TTL: 45 seconds — matches the backend employee_dashboard cache TTL exactly. */
export const EMPLOYEE_DASHBOARD_CACHE_TTL_MS = 45 * 1000;

/**
 * Stale window beyond TTL. Data older than TTL but within TTL + stale window
 * is served instantly while a background refresh is in flight.
 * Keep short (20s) because employee dashboard data is real-time-sensitive.
 */
export const EMPLOYEE_DASHBOARD_STALE_WINDOW_MS = 20 * 1000;

export const EMPLOYEE_DASHBOARD_CACHE_KEY = 'employee:dashboard';

/**
 * Get the employee dashboard cache entry.
 * Returns the raw entry (fresh or stale) or null if absent.
 */
export function getEmployeeDashboardCache() {
  return employeeDashboardCache.get(EMPLOYEE_DASHBOARD_CACHE_KEY) ?? null;
}

/** Returns true only if the entry exists and is within TTL. */
export function isEmployeeDashboardCacheFresh() {
  const entry = employeeDashboardCache.get(EMPLOYEE_DASHBOARD_CACHE_KEY);
  if (!entry) return false;
  return Date.now() - entry.timestamp < EMPLOYEE_DASHBOARD_CACHE_TTL_MS;
}

/** Returns true if entry exists and is within TTL + stale window (safe to serve). */
export function isEmployeeDashboardCacheServable() {
  const entry = employeeDashboardCache.get(EMPLOYEE_DASHBOARD_CACHE_KEY);
  if (!entry) return false;
  const age = Date.now() - entry.timestamp;
  return age < EMPLOYEE_DASHBOARD_CACHE_TTL_MS + EMPLOYEE_DASHBOARD_STALE_WINDOW_MS;
}

/** Store the employee dashboard payload in cache. */
export function setEmployeeDashboardCache(data) {
  employeeDashboardCache.set(EMPLOYEE_DASHBOARD_CACHE_KEY, {
    data,
    timestamp: Date.now(),
  });
}

/**
 * Invalidate the employee dashboard cache.
 * Call immediately after any mutation (clock-in, clock-out, break, etc.)
 * so the next fetch always writes fresh data.
 */
export function invalidateEmployeeDashboardCache() {
  employeeDashboardCache.delete(EMPLOYEE_DASHBOARD_CACHE_KEY);
}







