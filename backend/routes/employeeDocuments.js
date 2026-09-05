// backend/routes/employeeDocuments.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const uploadEmployeeDocumentGridFS = require('../middleware/uploadEmployeeDocumentGridFS');
const ctrl = require('../controllers/employeeDocumentController');
const templateCtrl = require('../controllers/documentTemplateController');

const isAdminOrHr = (req, res, next) => {
    if (!['Admin', 'HR'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Access forbidden: Requires Admin or HR role.' });
    }
    next();
};

// ─── Document type config ─────────────────────────────────────────────────────
router.get('/types', authenticateToken, isAdminOrHr, ctrl.getDocumentTypes);
router.put('/types', authenticateToken, isAdminOrHr, ctrl.updateDocumentTypes);

// ─── Template CRUD (built-in types only) ─────────────────────────────────────
// These must be declared before the /:id wildcard routes.
router.get('/templates/:documentType', authenticateToken, isAdminOrHr, templateCtrl.getTemplate);
router.get('/templates/:documentType/versions', authenticateToken, isAdminOrHr, templateCtrl.getTemplateVersions);
router.put('/templates/:documentType', authenticateToken, isAdminOrHr, templateCtrl.saveTemplate);
router.post('/templates/:documentType/preview-context', authenticateToken, isAdminOrHr, templateCtrl.getPreviewContext);
router.post('/templates/:documentType/generate-preview', authenticateToken, isAdminOrHr, templateCtrl.generatePreview);
router.post('/templates/:documentType/assign', authenticateToken, isAdminOrHr, templateCtrl.assignFromTemplate);

// ─── Compliance + employee endpoints ─────────────────────────────────────────
router.get('/mine', authenticateToken, ctrl.getMyDocuments);
router.get('/admin/compliance', authenticateToken, isAdminOrHr, ctrl.getAdminCompliance);

// Raw PDF upload for custom (non-templated) types
router.post('/assign', authenticateToken, isAdminOrHr, uploadEmployeeDocumentGridFS, ctrl.assignDocuments);
router.post('/admin/change-status/:userId', authenticateToken, isAdminOrHr, ctrl.changeEmploymentStatus);

router.post('/:id/view', authenticateToken, ctrl.recordView);
router.post('/:id/start-reading', authenticateToken, ctrl.startReading);
router.post('/:id/acknowledge', authenticateToken, ctrl.acknowledgeDocument);
router.post('/:id/forward-email', authenticateToken, ctrl.forwardToPersonalEmail);
router.get('/:id/file', authenticateToken, ctrl.getDocumentFile);

module.exports = router;
