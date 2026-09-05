// Shared silent refresh — single in-flight POST /auth/refresh for the whole app.
// AuthContext bootstrap, axios 401 interceptor, and proactive refresh must all use
// this module so refresh-token rotation is never hit twice on page load.
import axios from 'axios';
import { getApiBaseUrl } from '../utils/apiBaseUrl';

const baseURL = getApiBaseUrl();

// Plain axios instance — no response interceptor (avoids recursive 401 handling).
const refreshClient = axios.create({
  baseURL,
  withCredentials: true,
});

let refreshPromise = null;

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 * Concurrent callers share one in-flight request.
 */
export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/auth/refresh')
      .then((response) => {
        const newAccessToken = response.data.accessToken || response.data.token;
        if (!newAccessToken) {
          throw new Error('No access token in refresh response');
        }
        return newAccessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export function isAuthBootstrapInProgress() {
  return window.__AUTH_RESTORING__ === true;
}
