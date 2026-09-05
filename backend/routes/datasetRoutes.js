// backend/routes/datasetRoutes.js
// Routes for internal holiday dataset management

const express = require('express');
const router = express.Router();
const datasetController = require('../controllers/datasetController');
const authenticateToken = require('../middleware/authenticateToken');
const { HR_FAMILY } = require('../config/roles');

// Middleware to check if user is admin or HR
const isAdminOrHr = (req, res, next) => {
    if (!req.user || !HR_FAMILY.includes(req.user.role)) {
        return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Only administrators and HR can manage holiday dataset',
            userRole: req.user?.role || 'unknown'
        });
    }
    next();
};

// All routes require authentication and admin/HR role
router.use(authenticateToken);
router.use(isAdminOrHr);

// POST /api/admin/holiday-dataset/upload - Upload dataset
router.post('/upload', datasetController.uploadDataset);

// POST /api/admin/holiday-dataset/validate - Validate dataset without saving
router.post('/validate', datasetController.validateDataset);

// GET /api/admin/holiday-dataset?year={year} - Get dataset for year
router.get('/', datasetController.getDataset);

// GET /api/admin/holiday-dataset/status?year={year} - Get dataset status
router.get('/status', datasetController.getDatasetStatus);

// GET /api/admin/holiday-dataset/years - Get available years
router.get('/years', datasetController.getAvailableYears);

// GET /api/admin/holiday-dataset/codes - Get common holiday codes
router.get('/codes', datasetController.getCommonHolidayCodes);

// DELETE /api/admin/holiday-dataset/:id - Delete dataset entry
router.delete('/:id', datasetController.deleteDatasetEntry);

module.exports = router;
