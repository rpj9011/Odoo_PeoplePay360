// Central API URL helpers for same-origin production deployments.
// When VITE_API_BASE_URL is unset, requests use relative /api paths on the
// current host — avoiding cross-origin CORS issues when frontend and backend
// share attendance.bylinelms.com (Apache proxies /api to PM2).

function normalizeConfiguredApiBase(configured) {
  if (!configured) return null;
  const trimmed = String(configured).trim().replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

/** Axios/fetch base URL — always ends with /api */
export function getApiBaseUrl() {
  if (import.meta.env.DEV) return '/api';

  const configured = normalizeConfiguredApiBase(import.meta.env.VITE_API_BASE_URL);
  if (!configured) return '/api';

  // If a stale/wrong host was baked in at build time, prefer same-origin /api (Apache proxies /api).
  if (typeof window !== 'undefined') {
    try {
      const configuredOrigin = new URL(configured).origin;
      if (configuredOrigin !== window.location.origin) {
        console.warn(
          '[apiBaseUrl] VITE_API_BASE_URL host does not match page origin; using same-origin /api',
          { configuredOrigin, pageOrigin: window.location.origin }
        );
        return '/api';
      }
    } catch {
      return '/api';
    }
  }

  return configured;
}

/** Site origin for absolute URLs. Empty string = use same-origin relative paths. */
export function getApiOrigin() {
  if (import.meta.env.DEV) return '';
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!configured) return '';
  const origin = configured.replace(/\/api\/?$/, '').replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    try {
      if (new URL(origin).origin !== window.location.origin) return '';
    } catch {
      return '';
    }
  }
  return origin;
}

/** Build a full or relative API URL (path should start with /api/...) */
export function getApiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getApiOrigin();
  return origin ? `${origin}${normalizedPath}` : normalizedPath;
}
