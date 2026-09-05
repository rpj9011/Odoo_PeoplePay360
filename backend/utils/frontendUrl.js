const LOCAL_DEV_FALLBACK = 'http://localhost:5173';
const PRODUCTION_FALLBACK = 'https://attendance.bylinelms.com';

function stripTrailingSlash(url) {
  return url.replace(/\/$/, '');
}

function originFromRequest(req) {
  if (!req) return null;

  const origin = req.get('origin');
  if (origin && /^https?:\/\//i.test(origin)) {
    return stripTrailingSlash(origin);
  }

  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Base URL for public profile form links.
 * In development, prefers the admin browser origin so local testing gets local links.
 * In production, uses FRONTEND_URL.
 */
function resolvePublicFormBaseUrl(req) {
  if (process.env.NODE_ENV !== 'production') {
    return originFromRequest(req) || LOCAL_DEV_FALLBACK;
  }

  const configured = process.env.FRONTEND_URL || PRODUCTION_FALLBACK;
  return stripTrailingSlash(configured);
}

module.exports = {
  resolvePublicFormBaseUrl,
};
