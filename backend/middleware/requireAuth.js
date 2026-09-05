// backend/middleware/requireAuth.js
/**
 * JWT-ONLY Authentication Middleware
 * 
 * This middleware enforces JWT-based authentication across the backend.
 * - NO SSO session support
 * - NO redirects (returns JSON only)
 * - Supports both cookie-based and header-based JWT tokens
 * - Production-safe with proper error handling
 */
const jwtUtils = require('../utils/jwtUtils');

function requireAuth(req, res, next) {
  try {
    // Extract token from multiple sources (priority order):
    // 1. Cookie (most secure for browser requests)
    // 2. Authorization header (for API clients)
    const token = 
      req.cookies?.token || 
      req.cookies?.ams_token ||
      (req.headers.authorization?.startsWith('Bearer ') 
        ? req.headers.authorization.split(' ')[1] 
        : null);

    // No token found - return 401 JSON (never redirect)
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    // Verify JWT token
    const decoded = jwtUtils.verify(token);
    
    // Attach user info to request
    req.user = {
      userId: decoded.userId || decoded._id,
      _id: decoded.userId || decoded._id,
      email: decoded.email,
      role: decoded.role,
      fullName: decoded.fullName || decoded.name
    };

    next();
  } catch (error) {
    // Token verification failed - return 401 JSON (never redirect)
    console.error('JWT verification failed:', error.message);
    
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      code: error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'
    });
  }
}

module.exports = requireAuth;
