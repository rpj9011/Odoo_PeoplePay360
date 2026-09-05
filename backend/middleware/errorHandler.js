/**
 * Centralized Error Handler Middleware
 * 
 * Handles all errors in a consistent format across the application
 */

const errorHandler = (err, req, res, next) => {
    // Log error for monitoring
    console.error('[Error]', {
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        user: req.user ? req.user._id : 'unauthenticated'
    });

    // Mongoose validation errors (400 Bad Request)
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation failed',
            details: Object.values(err.errors).map(e => ({
                field: e.path,
                message: e.message,
                value: e.value
            }))
        });
    }

    // Mongoose cast errors (400 Bad Request)
    if (err.name === 'CastError') {
        return res.status(400).json({
            error: 'Invalid ID format',
            field: err.path,
            message: `Invalid ${err.path}: ${err.value}`
        });
    }

    // Mongoose duplicate key errors (409 Conflict)
    if (err.code === 11000) {
        const field = Object.keys(err.keyPattern)[0];
        const value = err.keyValue[field];
        return res.status(409).json({
            error: 'Duplicate value',
            field: field,
            message: `A record with this ${field} already exists`,
            value: value
        });
    }

    // Custom business logic errors (422 Unprocessable Entity)
    if (err.name === 'BusinessRuleError') {
        return res.status(422).json({
            error: 'Business rule violation',
            message: err.message,
            rule: err.rule
        });
    }

    // Active year conflict error (409 Conflict)
    if (err.name === 'ActiveYearConflict') {
        return res.status(409).json({
            error: 'Conflict',
            message: err.message
        });
    }

    // JWT authentication errors (401 Unauthorized)
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({
            error: 'Authentication failed',
            message: 'Invalid or expired token'
        });
    }

    // Authorization errors (403 Forbidden)
    if (err.status === 403 || err.message.includes('Forbidden')) {
        return res.status(403).json({
            error: 'Forbidden',
            message: err.message || 'You do not have permission to perform this action'
        });
    }

    // Not found errors (404 Not Found)
    if (err.status === 404 || err.message.includes('not found')) {
        return res.status(404).json({
            error: 'Resource not found',
            message: err.message
        });
    }

    // Rate limit errors (429 Too Many Requests)
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Too many requests',
            message: err.message || 'Please try again later'
        });
    }

    // Default server error (500 Internal Server Error)
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
