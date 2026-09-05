// backend/controllers/documentTemplateController.js
// Handles DocumentTemplate CRUD and template-based PDF generation/assignment.
// PDF generation uses the existing pdfkit dependency (already installed).
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const DocumentTemplate = require('../models/DocumentTemplate');
const EmployeeDocument = require('../models/EmployeeDocument');
const User = require('../models/User');
const NewNotificationService = require('../services/NewNotificationService');
const { getPolicyBucket } = require('../db');
const crypto = require('crypto');

const { BUILT_IN_TYPES } = require('../models/DocumentTemplate');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAdminOrHr(role) {
    return ['Admin', 'HR'].includes(role);
}

function uuidv4() {
    return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * Map an employee User document to a flat key→value object for auto-fill.
 * Keys match the autoFillFrom values defined in fieldsSchema and the {{token}}
 * names used in boilerplateHtml.
 *
 * probation_duration_months is auto-computed from probationEndDate - probationStartDate
 * (in whole months) when the stored probationDurationMonths field is null/zero.
 * This ensures it is always available for token substitution without manual entry.
 */
function buildEmployeeContext(user, reportingPersonName = null) {
    const fmt = (d) => {
        if (!d) return '';
        try {
            return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
        } catch { return ''; }
    };

    // Auto-compute probation_duration_months if not stored
    let probationMonths = '';
    if (user.probationDurationMonths != null && user.probationDurationMonths > 0) {
        probationMonths = String(user.probationDurationMonths);
    } else if (user.probationStartDate && user.probationEndDate) {
        try {
            const start = new Date(user.probationStartDate);
            const end = new Date(user.probationEndDate);
            // Compute whole months between two dates
            const months =
                (end.getFullYear() - start.getFullYear()) * 12 +
                (end.getMonth() - start.getMonth());
            if (months > 0) probationMonths = String(months);
        } catch { /* leave blank */ }
    }

    return {
        employee_name: user.fullName || '',
        employee_code: user.employeeCode || '',
        email: user.email || '',
        designation: user.designation || '',
        department: user.department || '',
        join_date: fmt(user.joiningDate),
        employment_status: user.employmentStatus || '',
        probation_start_date: fmt(user.probationStartDate),
        probation_end_date: fmt(user.probationEndDate),
        confirmation_date: fmt(user.confirmationDate),
        probation_duration_months: probationMonths,
        manager_name: reportingPersonName || '',
    };
}

/**
 * Build the final merge context for PDF generation.
 *
 * Rule: employee profile values are the source of truth for all tokens that
 * have a matching key in employeeContext. Admin-provided formValues only
 * contribute values for genuinely manual fields (those whose key does NOT
 * exist in employeeContext), which are things like salary, custom text, etc.
 *
 * This prevents stale or incorrectly-typed form values from overwriting the
 * correct employee data that was already resolved from the profile, which was
 * the root cause of the "jumbled" / concatenated output bug.
 *
 * @param {Object} employeeContext  - output of buildEmployeeContext()
 * @param {Object} formValues       - field key→value map sent by the frontend
 * @param {Array}  fieldsSchema     - template.fieldsSchema array
 * @returns {Object} merged context safe for token substitution
 */
function buildMergedContext(employeeContext, formValues, fieldsSchema) {
    // Start with all employee profile values
    const merged = { ...employeeContext };

    // Only apply admin-provided form values for fields that:
    //  a) have no autoFillFrom mapping (purely manual), OR
    //  b) were intentionally overridden but the key doesn't collide with a
    //     profile token (safe to add without corrupting boilerplate substitution)
    const profileKeys = new Set(Object.keys(employeeContext));

    for (const field of (fieldsSchema || [])) {
        const hasAutoFill = field.autoFillFrom && profileKeys.has(field.autoFillFrom);
        if (!hasAutoFill && formValues && formValues[field.key] !== undefined && formValues[field.key] !== '') {
            // Manual field — apply the admin-provided value under the field's key
            // so it can be used in {{field.key}} tokens in the boilerplate if present
            merged[field.key] = String(formValues[field.key]);
        }
        // For auto-filled fields: the employeeContext already has the correct value
        // under the token name (e.g. employeeContext.employee_name). No override needed.
    }

    return merged;
}

/**
 * Resolve all {{token}} placeholders in a string using a context map.
 * Unknown tokens are left as-is so they remain visible for debugging.
 */
function resolveTokens(text, context) {
    if (!text) return '';
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return Object.prototype.hasOwnProperty.call(context, key) ? context[key] : `{{${key}}}`;
    });
}

/**
 * Strip HTML tags — simple, no external dependency.
 * Converts <br>, <p>, <div> to newlines and strips all remaining tags.
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/**
 * Generate a PDF buffer from a filled template using pdfkit.
 * Returns a Buffer.
 */
async function generatePdfBuffer(params) {
    const { documentTypeLabel, filledFields, notesContent, boilerplateText, employeeName } = params;

    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 72, bottom: 72, left: 72, right: 72 },
            info: {
                Title: documentTypeLabel,
                Author: 'HR Department',
                Subject: `${documentTypeLabel} — ${employeeName}`,
            },
        });

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // ── Header ────────────────────────────────────────────────────────
        doc.fontSize(18).font('Helvetica-Bold').text(documentTypeLabel, { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke('#cccccc');
        doc.moveDown(1);

        // ── Boilerplate body ──────────────────────────────────────────────
        if (boilerplateText && boilerplateText.trim()) {
            doc.fontSize(11).font('Helvetica').text(stripHtml(boilerplateText), {
                align: 'justify',
                lineGap: 4,
            });
            doc.moveDown(1);
        }

        // ── Structured fields table ───────────────────────────────────────
        if (filledFields && filledFields.length > 0) {
            doc.fontSize(12).font('Helvetica-Bold').text('Details', { underline: false });
            doc.moveDown(0.5);

            const colLabelX = 72;
            const colValueX = 240;
            const rowHeight = 20;

            filledFields.forEach((field) => {
                const y = doc.y;
                doc.fontSize(10).font('Helvetica-Bold').text(field.label + ':', colLabelX, y, {
                    width: colValueX - colLabelX - 8,
                    lineBreak: false,
                });
                doc.fontSize(10).font('Helvetica').text(field.value || '—', colValueX, y, {
                    width: doc.page.width - 72 - colValueX,
                });
                doc.y = y + rowHeight;
                if (doc.y > doc.page.height - 120) doc.addPage();
            });

            doc.moveDown(1);
        }

        // ── Notes section ─────────────────────────────────────────────────
        if (notesContent && notesContent.trim()) {
            doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke('#eeeeee');
            doc.moveDown(0.5);
            doc.fontSize(12).font('Helvetica-Bold').text('Additional Notes');
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica').text(stripHtml(notesContent), {
                align: 'left',
                lineGap: 4,
            });
            doc.moveDown(1);
        }

        // ── Footer ────────────────────────────────────────────────────────
        doc.moveDown(2);
        doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke('#cccccc');
        doc.moveDown(0.5);
        doc.fontSize(9).font('Helvetica').fillColor('#888888').text(
            `Generated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
            { align: 'right' }
        );

        doc.end();
    });
}

/**
 * Upload a buffer to GridFS in the policyFiles bucket.
 * Returns { fileId, filename, size }.
 */
async function uploadBufferToGridFS(buffer, originalFilename, uploadedBy) {
    const policyBucket = getPolicyBucket();
    const filename = `employee-doc-${uuidv4()}.pdf`;

    const uploadStream = policyBucket.openUploadStream(filename, {
        contentType: 'application/pdf',
        metadata: {
            originalFilename,
            uploadedBy,
            uploadedAt: new Date(),
            fileSize: buffer.length,
            documentClass: 'employee_document',
            source: 'template_generated',
        },
    });

    return new Promise((resolve, reject) => {
        uploadStream.on('finish', () => resolve({
            fileId: uploadStream.id,
            filename,
            size: buffer.length,
        }));
        uploadStream.on('error', reject);
        uploadStream.end(buffer);
    });
}

// ─── GET /templates/:documentType ────────────────────────────────────────────
// Returns the active template (or null) for a given built-in type.
exports.getTemplate = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { documentType } = req.params;
        if (!BUILT_IN_TYPES.includes(documentType)) {
            return res.status(400).json({ error: 'Invalid documentType.' });
        }

        const template = await DocumentTemplate.findOne({ documentType, isActive: true })
            .sort({ version: -1 })
            .lean();

        res.json({ template: template || null });
    } catch (err) {
        console.error('[DocTemplate] getTemplate error:', err);
        res.status(500).json({ error: 'Failed to fetch template.' });
    }
};

// ─── GET /templates/:documentType/versions ───────────────────────────────────
// Returns all versions for audit — latest first.
exports.getTemplateVersions = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { documentType } = req.params;
        if (!BUILT_IN_TYPES.includes(documentType)) {
            return res.status(400).json({ error: 'Invalid documentType.' });
        }

        const versions = await DocumentTemplate.find({ documentType })
            .sort({ version: -1 })
            .select('version isActive updatedByName updatedAt boilerplateHtml')
            .lean();

        res.json({ versions });
    } catch (err) {
        console.error('[DocTemplate] getTemplateVersions error:', err);
        res.status(500).json({ error: 'Failed to fetch versions.' });
    }
};

// ─── PUT /templates/:documentType ────────────────────────────────────────────
// Save a new version of the template.
// The old active version is deactivated; a new version record is created.
exports.saveTemplate = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { documentType } = req.params;
        if (!BUILT_IN_TYPES.includes(documentType)) {
            return res.status(400).json({ error: 'Invalid documentType.' });
        }

        const { boilerplateHtml, fieldsSchema, notesFieldLabel } = req.body;

        if (typeof boilerplateHtml !== 'string') {
            return res.status(400).json({ error: 'boilerplateHtml is required.' });
        }

        // Validate fieldsSchema
        const fields = Array.isArray(fieldsSchema) ? fieldsSchema : [];
        for (const f of fields) {
            if (!f.key || !f.label) {
                return res.status(400).json({ error: 'Each field must have key and label.' });
            }
            if (!['text', 'date', 'textarea'].includes(f.type)) {
                return res.status(400).json({ error: `Invalid field type "${f.type}".` });
            }
        }

        const admin = await User.findById(req.user.userId).select('fullName').lean();

        // Determine next version number
        const latest = await DocumentTemplate.findOne({ documentType }).sort({ version: -1 }).lean();
        const nextVersion = latest ? latest.version + 1 : 1;

        // Deactivate all existing active versions for this type
        await DocumentTemplate.updateMany(
            { documentType, isActive: true },
            { $set: { isActive: false } }
        );

        // Create the new version
        const template = await DocumentTemplate.create({
            documentType,
            version: nextVersion,
            isActive: true,
            boilerplateHtml,
            fieldsSchema: fields.map((f, i) => ({
                key: f.key,
                label: f.label,
                type: f.type || 'text',
                autoFillFrom: f.autoFillFrom || null,
                required: !!f.required,
                order: i,
            })),
            notesFieldLabel: notesFieldLabel || '',
            updatedBy: req.user.userId,
            updatedByName: admin?.fullName || 'Admin',
        });

        res.json({ template });
    } catch (err) {
        console.error('[DocTemplate] saveTemplate error:', err);
        res.status(500).json({ error: 'Failed to save template.' });
    }
};

// ─── POST /templates/:documentType/preview-context ───────────────────────────
// Returns the auto-filled field values for a given employee + template.
// Used by the frontend to show the pre-filled form before generating.
exports.getPreviewContext = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { documentType } = req.params;
        const { employeeId } = req.body;

        if (!BUILT_IN_TYPES.includes(documentType)) {
            return res.status(400).json({ error: 'Invalid documentType.' });
        }
        if (!employeeId) {
            return res.status(400).json({ error: 'employeeId is required.' });
        }

        const [template, employee] = await Promise.all([
            DocumentTemplate.findOne({ documentType, isActive: true }).sort({ version: -1 }).lean(),
            User.findById(employeeId)
                .select('fullName employeeCode email designation department joiningDate employmentStatus probationStartDate probationEndDate probationDurationMonths confirmationDate reportingPerson')
                .populate({ path: 'reportingPerson', select: 'fullName', options: { lean: true } })
                .lean(),
        ]);

        if (!template) {
            return res.status(404).json({ error: 'No active template found for this document type.' });
        }
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const reportingPersonName = employee.reportingPerson?.fullName || '';
        const context = buildEmployeeContext(employee, reportingPersonName);

        // Build field values for the frontend form.
        // Auto-filled fields get their value from the employee profile — the frontend
        // should display these as locked/read-only and NOT show them as editable inputs.
        // Only genuinely manual fields (no autoFillFrom) need admin input.
        const fieldValues = {};
        for (const field of template.fieldsSchema || []) {
            if (field.autoFillFrom && context[field.autoFillFrom] !== undefined) {
                fieldValues[field.key] = context[field.autoFillFrom];
            } else {
                fieldValues[field.key] = '';
            }
        }

        // Identify which fields require manual admin input (no auto-fill mapping)
        const manualFields = (template.fieldsSchema || []).filter(
            (f) => !f.autoFillFrom || context[f.autoFillFrom] === undefined || context[f.autoFillFrom] === ''
        );

        res.json({ template, fieldValues, employeeContext: context, manualFields });
    } catch (err) {
        console.error('[DocTemplate] getPreviewContext error:', err);
        res.status(500).json({ error: 'Failed to get preview context.' });
    }
};

// ─── POST /templates/:documentType/generate-preview ─────────────────────────
// Generates a PDF from filled field values and returns it as a binary stream.
// Does NOT persist anything — preview only.
exports.generatePreview = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { documentType } = req.params;
        if (!BUILT_IN_TYPES.includes(documentType)) {
            return res.status(400).json({ error: 'Invalid documentType.' });
        }

        const { employeeId, fieldValues, notesContent, templateVersion } = req.body;
        if (!employeeId) {
            return res.status(400).json({ error: 'employeeId is required.' });
        }

        // Load template (prefer specific version for immutability, fall back to active)
        let template;
        if (templateVersion) {
            template = await DocumentTemplate.findOne({ documentType, version: Number(templateVersion) }).lean();
        } else {
            template = await DocumentTemplate.findOne({ documentType, isActive: true }).sort({ version: -1 }).lean();
        }

        if (!template) {
            return res.status(404).json({ error: 'No active template found for this document type.' });
        }

        const employee = await User.findById(employeeId)
            .select('fullName employeeCode designation department joiningDate employmentStatus probationStartDate probationEndDate probationDurationMonths confirmationDate reportingPerson')
            .populate({ path: 'reportingPerson', select: 'fullName', options: { lean: true } })
            .lean();

        if (!employee) {
            return res.status(404).json({ error: 'Employee not found.' });
        }

        const values = fieldValues || {};
        const reportingPersonName = employee.reportingPerson?.fullName || '';
        const employeeContext = buildEmployeeContext(employee, reportingPersonName);

        // Validate required fields — skip fields that are auto-filled from the employee
        // profile since those are always resolved and never missing.
        const missingRequired = (template.fieldsSchema || []).filter((f) => {
            if (!f.required) return false;
            // Auto-filled from profile → always available, never fails validation
            if (f.autoFillFrom && employeeContext[f.autoFillFrom] !== undefined && employeeContext[f.autoFillFrom] !== '') {
                return false;
            }
            // Manual field → check admin-provided value
            return !values[f.key]?.toString().trim();
        });
        if (missingRequired.length > 0) {
            return res.status(400).json({
                error: 'Required fields are missing.',
                missingFields: missingRequired.map((f) => f.label),
            });
        }

        // Build merge context: profile values take precedence; form values only
        // fill genuinely manual fields (no autoFillFrom). This is the fix for the
        // "jumbled" output bug — profile tokens are never overwritten by stale form data.
        const mergedContext = buildMergedContext(employeeContext, values, template.fieldsSchema);

        // Resolve tokens in boilerplate — each {{token}} is replaced exactly once
        // in its exact position, preserving all surrounding whitespace and punctuation.
        const resolvedBoilerplate = resolveTokens(template.boilerplateHtml, mergedContext);

        // Build filled fields list for the PDF details table — only include fields
        // that are NOT already embedded in the boilerplate (to avoid duplication).
        // We include all schema fields so the admin can see a summary, but value
        // resolution always prefers the employee profile for auto-filled fields.
        const filledFields = (template.fieldsSchema || []).map((f) => {
            let value = '';
            if (f.autoFillFrom && employeeContext[f.autoFillFrom] !== undefined) {
                value = employeeContext[f.autoFillFrom];
            } else if (values[f.key] !== undefined) {
                value = String(values[f.key]);
            }
            return { label: f.label, value: value || '—' };
        });

        const typeLabels = {
            joining_letter: 'Joining Letter',
            kra: 'KRA Letter',
            probation_confirmation: 'Probation Confirmation Letter',
            probation_extension: 'Probation Extension Letter',
        };

        const pdfBuffer = await generatePdfBuffer({
            documentTypeLabel: typeLabels[documentType] || documentType,
            filledFields,
            notesContent: template.notesFieldLabel ? (notesContent || '') : '',
            boilerplateText: resolvedBoilerplate,
            employeeName: employee.fullName,
        });

        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', 'inline; filename="preview.pdf"');
        res.set('Content-Length', pdfBuffer.length);
        res.set('Cache-Control', 'no-store');
        res.send(pdfBuffer);
    } catch (err) {
        console.error('[DocTemplate] generatePreview error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to generate preview.' });
    }
};

// ─── POST /templates/:documentType/assign ────────────────────────────────────
// Generate + upload + create EmployeeDocument records for one or more employees.
exports.assignFromTemplate = async (req, res) => {
    try {
        if (!isAdminOrHr(req.user.role)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { documentType } = req.params;
        if (!BUILT_IN_TYPES.includes(documentType)) {
            return res.status(400).json({ error: 'Invalid documentType.' });
        }

        const { employeeIds, fieldValuesByEmployee, notesContent, requiresAcknowledgment, note } = req.body;

        if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({ error: 'At least one employee must be selected.' });
        }

        // Load active template
        const template = await DocumentTemplate.findOne({ documentType, isActive: true })
            .sort({ version: -1 })
            .lean();

        if (!template) {
            return res.status(404).json({ error: 'No active template found. Please configure the template first.' });
        }

        const admin = await User.findById(req.user.userId).select('fullName').lean();
        const employees = await User.find({ _id: { $in: employeeIds }, isActive: true })
            .select('fullName employeeCode email designation department joiningDate employmentStatus probationStartDate probationEndDate probationDurationMonths confirmationDate reportingPerson department')
            .populate({ path: 'reportingPerson', select: 'fullName', options: { lean: true } })
            .lean();

        if (!employees.length) {
            return res.status(400).json({ error: 'No valid active employees found.' });
        }

        const typeLabels = {
            joining_letter: 'Joining Letter',
            kra: 'KRA Letter',
            probation_confirmation: 'Probation Confirmation Letter',
            probation_extension: 'Probation Extension Letter',
        };
        const docTypeLabel = typeLabels[documentType] || documentType;
        const requiresAck = requiresAcknowledgment === true || requiresAcknowledgment === 'true';

        const created = [];
        const errors = [];

        for (const employee of employees) {
            try {
                // Per-employee field values — admin only provides values for manual fields
                const empId = employee._id.toString();
                const formValues = (fieldValuesByEmployee && fieldValuesByEmployee[empId]) || {};

                const reportingPersonName = employee.reportingPerson?.fullName || '';
                const employeeContext = buildEmployeeContext(employee, reportingPersonName);

                // Validate required fields — skip auto-filled fields since those are
                // always resolved from the employee profile and are never missing.
                const missingRequired = (template.fieldsSchema || []).filter((f) => {
                    if (!f.required) return false;
                    if (f.autoFillFrom && employeeContext[f.autoFillFrom] !== undefined && employeeContext[f.autoFillFrom] !== '') {
                        return false;
                    }
                    return !formValues[f.key]?.toString().trim();
                });
                if (missingRequired.length > 0) {
                    errors.push({
                        employeeId: empId,
                        employeeName: employee.fullName,
                        error: `Missing required fields: ${missingRequired.map((f) => f.label).join(', ')}`,
                    });
                    continue;
                }

                // Build merge context: profile values are the source of truth;
                // form values only contribute for genuinely manual fields.
                const mergedContext = buildMergedContext(employeeContext, formValues, template.fieldsSchema);
                const resolvedBoilerplate = resolveTokens(template.boilerplateHtml, mergedContext);

                // Build fields summary for PDF details table
                const filledFields = (template.fieldsSchema || []).map((f) => {
                    let value = '';
                    if (f.autoFillFrom && employeeContext[f.autoFillFrom] !== undefined) {
                        value = employeeContext[f.autoFillFrom];
                    } else if (formValues[f.key] !== undefined) {
                        value = String(formValues[f.key]);
                    }
                    return { label: f.label, value: value || '—' };
                });

                const pdfBuffer = await generatePdfBuffer({
                    documentTypeLabel: docTypeLabel,
                    filledFields,
                    notesContent: template.notesFieldLabel ? (notesContent || '') : '',
                    boilerplateText: resolvedBoilerplate,
                    employeeName: employee.fullName,
                });

                const gridfsResult = await uploadBufferToGridFS(
                    pdfBuffer,
                    `${docTypeLabel} - ${employee.fullName}.pdf`,
                    req.user.userId
                );

                const doc = await EmployeeDocument.create({
                    employeeId: employee._id,
                    employeeName: employee.fullName,
                    employeeCode: employee.employeeCode,
                    department: employee.department || '',
                    employmentStatus: employee.employmentStatus || '',
                    documentType,
                    documentTypeLabel: docTypeLabel,
                    fileRef: gridfsResult.fileId,
                    fileName: gridfsResult.filename,
                    assignedBy: req.user.userId,
                    assignedByName: admin?.fullName || 'Admin',
                    assignedAt: new Date(),
                    method: 'manual',
                    requiresAcknowledgment: requiresAck,
                    note: note || '',
                    status: 'pending',
                    // Template provenance — immutable snapshot reference
                    templateId: template._id,
                    templateVersion: template.version,
                    timeline: [{
                        event: 'assigned',
                        timestamp: new Date(),
                        notes: `Generated from template v${template.version} and assigned by ${admin?.fullName || 'Admin'}`,
                        performedBy: admin?.fullName || 'Admin',
                    }],
                });

                created.push(doc);

                // Notify employee
                await NewNotificationService.createAndEmitNotification({
                    message: `A new document "${docTypeLabel}" has been assigned to you.`,
                    type: 'employee_document_assigned',
                    userId: employee._id,
                    userName: employee.fullName,
                    recipientType: 'user',
                    category: 'system',
                    priority: 'high',
                    navigationData: {
                        page: 'profile',
                        params: { section: 'documents', documentId: doc._id.toString() },
                    },
                    metadata: {
                        documentId: doc._id.toString(),
                        documentType,
                        requiresAcknowledgment: requiresAck,
                    },
                });
            } catch (empErr) {
                console.error(`[DocTemplate] assignFromTemplate error for employee ${employee._id}:`, empErr);
                errors.push({
                    employeeId: employee._id.toString(),
                    employeeName: employee.fullName,
                    error: empErr.message || 'Failed to generate/assign document.',
                });
            }
        }

        const status = errors.length === 0 ? 201 : (created.length === 0 ? 400 : 207);
        res.status(status).json({
            message: created.length > 0
                ? `Assigned to ${created.length} employee(s).`
                : 'No documents were assigned.',
            assigned: created.length,
            errors,
            documents: created,
        });
    } catch (err) {
        console.error('[DocTemplate] assignFromTemplate error:', err);
        res.status(500).json({ error: 'Failed to assign documents from template.' });
    }
};
