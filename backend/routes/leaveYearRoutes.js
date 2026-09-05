const express = require('express');
const router = express.Router();
const leaveYearController = require('../controllers/leaveYearController');
const authenticateToken = require('../middleware/authenticateToken');

// Middleware to check if user is admin or HR
const isAdminOrHr = (req, res, next) => {
    if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'HR')) {
        return res.status(403).json({ 
            error: 'Forbidden',
            message: 'Only administrators and HR can manage leave years',
            userRole: req.user?.role || 'unknown'
        });
    }
    next();
};

// All routes require authentication and admin/HR role
router.use(authenticateToken);
router.use(isAdminOrHr);

// GET /api/admin/leave-years - List all leave years
router.get('/', leaveYearController.getAllLeaveYears);

// GET /api/admin/leave-years/active - Get active leave year
router.get('/active', leaveYearController.getActiveLeaveYear);

// GET /api/admin/leave-years/:id - Get specific leave year
router.get('/:id', leaveYearController.getLeaveYearById);

// POST /api/admin/leave-years - Create new leave year
router.post('/', leaveYearController.createLeaveYear);

// PUT /api/admin/leave-years/:id - Update leave year
router.put('/:id', leaveYearController.updateLeaveYear);

// DELETE /api/admin/leave-years/:id - Delete leave year
router.delete('/:id', leaveYearController.deleteLeaveYear);

// POST /api/admin/leave-years/:id/activate - Activate leave year
router.post('/:id/activate', leaveYearController.activateLeaveYear);

// POST /api/admin/leave-years/:id/archive - Archive leave year
router.post('/:id/archive', leaveYearController.archiveLeaveYear);

// POST /api/admin/leave-years/:id/lock - Toggle lock on leave year
router.post('/:id/lock', leaveYearController.toggleLockLeaveYear);

// Clone routes - IMPORTANT: More specific routes must come BEFORE general routes
// POST /api/admin/leave-years/:id/clone/preview - Generate clone preview
router.post('/:id/clone/preview', leaveYearController.generateClonePreview);

// POST /api/admin/leave-years/clone/confirm - Confirm clone
router.post('/clone/confirm', leaveYearController.confirmClone);

// POST /api/admin/leave-years/clone/cancel - Cancel clone
router.post('/clone/cancel', leaveYearController.cancelClone);

// POST /api/admin/leave-years/:id/clone - Clone holidays from another year (legacy, kept for backward compatibility)
router.post('/:id/clone', leaveYearController.cloneHolidays);

// GET /api/admin/leave-years/:id/clone-history - Get clone history
router.get('/:id/clone-history', leaveYearController.getCloneHistory);

module.exports = router;
