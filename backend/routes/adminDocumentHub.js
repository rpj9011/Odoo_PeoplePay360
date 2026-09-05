// backend/routes/adminDocumentHub.js
//
// Admin document hub routes — mounted at /api/admin/documents in server.js.
//
// Auth pattern: authenticateToken + isAdminOrHr applied to all routes via
// router.use, exactly matching the CIF routes pattern (cif.routes.js).
'use strict';

const express    = require('express');
const router     = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const uploadDocumentToB2 = require('../middleware/uploadDocumentToB2');
const ctrl       = require('../controllers/adminDocumentHubController');
const DOCUMENT_CATEGORIES = require('../config/documentCategories');

// ── Role check middleware (matches the isAdminOrHr used across admin routes) ──
const isAdminOrHr = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    const role = String(req.user.role || '').trim();
    if (!['Admin', 'HR'].includes(role)) {
        return res.status(403).json({ error: 'Access forbidden: requires Admin or HR role.' });
    }
    next();
};

// Apply auth + role check to ALL routes in this router
router.use(authenticateToken);
router.use(isAdminOrHr);

// ─── GET /api/admin/documents/:employeeId ─────────────────────────────────────
// List all documents for one employee across all categories.
router.get('/:employeeId', ctrl.listEmployeeDocuments);

// ─── GET /api/admin/documents/:category/:id/download ─────────────────────────
// Get a presigned URL (or GridFS stream) for a specific document.
router.get('/:category/:id/download', ctrl.downloadDocument);

// ─── POST /api/admin/documents/:category/:id/review ──────────────────────────
// Approve or reject a document (review-required categories only).
router.post('/:category/:id/review', ctrl.reviewDocument);

// ─── POST /api/admin/documents/:category/upload ───────────────────────────────
// Admin-side upload — dynamically selects the uploadDocumentToB2 middleware
// for the requested category.  Unknown categories are rejected by the middleware
// factory, which throws at app startup if a bad category is passed.  Here we
// instead validate dynamically so unknown categories return 400, not 500.
router.post('/:category/upload', (req, res, next) => {
    const { category } = req.params;
    if (!DOCUMENT_CATEGORIES[category]) {
        return res.status(400).json({
            error: `Unknown category "${category}". Valid: ${Object.keys(DOCUMENT_CATEGORIES).join(', ')}`,
        });
    }
    if (category === 'kyc') {
        return res.status(400).json({ error: 'KYC uploads are managed by the dedicated /api/kyc/upload endpoint.' });
    }
    // Instantiate the middleware for this category and run it
    const middleware = uploadDocumentToB2({ category });
    middleware(req, res, next);
}, ctrl.uploadDocument);

module.exports = router;
