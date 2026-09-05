const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const authenticateToken = require('../middleware/authenticateToken');

// Middleware to check if user is admin or HR
const isAdminOrHr = (req, res, next) => {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'HR')) {
        return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Only administrators and HR can manage holidays',
            userRole: req.user?.role || 'unknown'
        });
    }
    next();
};

// Admin routes - require authentication and admin/HR role
router.get('/admin', [authenticateToken, isAdminOrHr], holidayController.getAllHolidays);
router.post('/admin', [authenticateToken, isAdminOrHr], holidayController.createHoliday);
router.post('/admin/bulk', [authenticateToken, isAdminOrHr], holidayController.bulkUploadHolidays);
router.put('/admin/:id', [authenticateToken, isAdminOrHr], holidayController.updateHoliday);
router.put('/admin/:id/override', [authenticateToken, isAdminOrHr], holidayController.applyManualOverride);
router.delete('/admin/:id', [authenticateToken, isAdminOrHr], holidayController.deleteHoliday);
router.put('/admin/:id/move', [authenticateToken, isAdminOrHr], holidayController.moveHoliday);
router.get('/admin/:id/history', [authenticateToken, isAdminOrHr], holidayController.getEditHistory);
router.post('/admin/:id/lock', [authenticateToken, isAdminOrHr], holidayController.toggleLockHoliday);

// Employee routes - require authentication only
router.get('/leaves', authenticateToken, holidayController.getEmployeeHolidays);

module.exports = router;
