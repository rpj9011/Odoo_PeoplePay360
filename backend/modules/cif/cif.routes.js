const express = require('express');
const router = express.Router();
const cifController = require('./cif.controller');
const authenticateToken = require('../../middleware/authenticateToken');
const uploadCIFAttachmentGridFS = require('../../middleware/uploadCIFAttachmentGridFS');

// Role check middleware - only Admin and HR
const checkCIFAccess = (req, res, next) => {
  const allowedRoles = ['Admin', 'HR'];
  
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Admin or HR role required.' });
  }
  
  next();
};

// Super Admin only middleware (Phase 3)
const checkSuperAdminAccess = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Super Admin role required.' });
  }
  
  next();
};

// Apply auth and role check to all routes
router.use(authenticateToken);
router.use(checkCIFAccess);

// Routes
router.get('/', cifController.getCIFList);
router.get('/stats', cifController.getCIFStats);

// Phase 3: Analytics & Advanced Features
router.get('/analytics', cifController.getCIFAnalytics);
router.get('/risk-heatmap', cifController.getRiskHeatmap);
router.get('/export', checkSuperAdminAccess, cifController.exportCIF);
router.post('/archive-old', checkSuperAdminAccess, cifController.archiveOldRecords);

router.get('/employees-with-cif', cifController.getEmployeesWithCIF);
router.get('/employee/:employeeId', cifController.getEmployeeDetails);
router.get('/employee-summary/:employeeId', cifController.getEmployeeSummary);
router.get('/:id', cifController.getCIFById);
router.get('/:id/audit', cifController.getAuditLogs);

// Attachment routes
router.post('/:cifId/attachments', uploadCIFAttachmentGridFS, cifController.uploadAttachments);
router.get('/:cifId/attachments', cifController.getAttachments);
router.get('/attachments/:attachmentId/download', cifController.downloadAttachment);
router.delete('/attachments/:attachmentId', cifController.deleteAttachment);

router.post('/', cifController.createCIF);
router.put('/:id', cifController.updateCIF);
router.patch('/:id/status', cifController.changeStatus);
router.delete('/:id', cifController.deleteCIF);

module.exports = router;
