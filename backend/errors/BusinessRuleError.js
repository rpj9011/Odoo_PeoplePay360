/**
 * Business Rule Error
 * 
 * Custom error class for business logic violations
 */

class BusinessRuleError extends Error {
    constructor(message, rule) {
        super(message);
        this.name = 'BusinessRuleError';
        this.rule = rule;
        
        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, BusinessRuleError);
        }
    }
}

module.exports = BusinessRuleError;
