// backend/services/payslipPdfService.js
// ─────────────────────────────────────────────────────────────────────────────
// Server-side payslip PDF generation using pdfkit (already installed).
// Follows the same setup pattern as analyticsExportController.js.
//
// Export: generatePayslipPdf(payslipId) → Promise<Buffer>
//
// The returned Buffer is:
//   • Written to disk at uploads/payslips/<payslipId>.pdf  AND
//   • Returned in-memory so the caller can stream it immediately.
//
// Payslip.pdfPath is updated with the saved file path so subsequent requests
// can skip regeneration if the payslip has not changed.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const path   = require('path');
const fs     = require('fs');
const PDFDocument = require('pdfkit');
const mongoose    = require('mongoose');

// Ensure the upload directory exists
const PDF_DIR = path.join(__dirname, '..', 'uploads', 'payslips');
if (!fs.existsSync(PDF_DIR)) {
    fs.mkdirSync(PDF_DIR, { recursive: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtINR(n) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 2,
    }).format(n || 0);
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

// ── PDF renderer ──────────────────────────────────────────────────────────────

/**
 * Render a payslip document into a Buffer.
 * @param {Object} payslip  Fully populated Payslip mongoose doc (lean or instance)
 * @returns {Promise<Buffer>}
 */
function renderPayslipPdf(payslip) {
    return new Promise((resolve, reject) => {
        const chunks = [];

        const doc = new PDFDocument({
            size:    'A4',
            margins: { top: 40, bottom: 40, left: 50, right: 50 },
            info: {
                Title:    `Payslip — ${payslip.employee?.fullName || 'Employee'}`,
                Author:   'AMS Payroll',
                Subject:  `Pay period ${fmtDate(payslip.periodStart)} – ${fmtDate(payslip.periodEnd)}`,
                Keywords: 'payslip salary',
            },
        });

        doc.on('data',  chunk => chunks.push(chunk));
        doc.on('end',   () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageW = doc.page.width;
        const L     = doc.page.margins.left;
        const R     = doc.page.margins.right;
        const usableW = pageW - L - R;

        // ── Header banner ──────────────────────────────────────────────────────
        doc.rect(0, 0, pageW, 80).fill('#2C3E50');
        doc.fontSize(20).fillColor('#ffffff').font('Helvetica-Bold')
           .text('PAYSLIP', L, 22, { width: usableW, align: 'center' });
        doc.fontSize(9).fillColor('#ecf0f1').font('Helvetica')
           .text(`Pay Period: ${fmtDate(payslip.periodStart)} – ${fmtDate(payslip.periodEnd)}`, L, 46, { width: usableW, align: 'center' });

        let y = 95;

        // ── Employee info block ────────────────────────────────────────────────
        doc.rect(L, y, usableW, 68).fill('#f7f9fb').stroke('#dce3ea');
        y += 8;

        const emp      = payslip.employee   || {};
        const contract = payslip.contract   || {};
        const run      = payslip.payrun     || {};
        const struct   = payslip.salaryStructure || {};

        const infoLeft = [
            ['Name',           emp.fullName    || '—'],
            ['Employee Code',  emp.employeeCode || emp.email || '—'],
            ['Department',     emp.department   || '—'],
            ['Designation',    emp.designation  || '—'],
        ];
        const infoRight = [
            ['Contract #',     contract.contractNumber || '—'],
            ['Salary Structure', struct.name || '—'],
            ['Worked Days',    String(payslip.workedDays ?? '—')],
            ['Pay Run',        run.name || '—'],
        ];

        const colW = usableW / 2 - 10;

        infoLeft.forEach(([label, val], i) => {
            const iy = y + i * 14;
            doc.fontSize(8).fillColor('#6b7280').font('Helvetica').text(label + ':', L + 8, iy);
            doc.fontSize(8).fillColor('#111827').font('Helvetica-Bold').text(val, L + 8 + 90, iy);
        });
        infoRight.forEach(([label, val], i) => {
            const iy = y + i * 14;
            doc.fontSize(8).fillColor('#6b7280').font('Helvetica').text(label + ':', L + colW + 20, iy);
            doc.fontSize(8).fillColor('#111827').font('Helvetica-Bold').text(val, L + colW + 20 + 95, iy);
        });

        y += 60 + 14;

        // ── Earnings / Deductions two-column table ────────────────────────────
        const earnings   = (payslip.lines || []).filter(l =>
            ['Basic', 'Allowance', 'Gross'].includes(l.category)
        ).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

        const deductions = (payslip.lines || []).filter(l =>
            l.category === 'Deduction'
        ).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

        // Table headers
        const tColW = usableW / 2 - 6;
        const drawTableHeader = (x, label) => {
            doc.rect(x, y, tColW, 18).fill('#2C3E50');
            doc.fontSize(8.5).fillColor('#ffffff').font('Helvetica-Bold')
               .text(label, x + 8, y + 5, { width: tColW - 16 });
            doc.text('Amount (₹)', x + tColW - 70, y + 5, { width: 62, align: 'right' });
        };
        drawTableHeader(L,                'EARNINGS');
        drawTableHeader(L + tColW + 12,   'DEDUCTIONS');
        y += 18;

        // Row renderer
        const drawRow = (x, name, amount, shade) => {
            if (shade) doc.rect(x, y, tColW, 14).fill('#f9fafb');
            doc.rect(x, y, tColW, 14).stroke('#e5e7eb');
            doc.fontSize(8).fillColor('#374151').font('Helvetica')
               .text(name, x + 8, y + 3, { width: tColW - 80 });
            doc.font('Helvetica-Bold')
               .text(fmtINR(amount), x + tColW - 75, y + 3, { width: 67, align: 'right' });
        };

        const maxRows = Math.max(earnings.length, deductions.length);
        for (let i = 0; i < maxRows; i++) {
            const e = earnings[i];
            const d = deductions[i];
            const shade = i % 2 === 1;
            if (e) drawRow(L,              e.name, e.amount, shade);
            if (d) drawRow(L + tColW + 12, d.name, d.amount, shade);
            y += 14;
        }

        y += 6;

        // ── Totals band ────────────────────────────────────────────────────────
        const drawTotal = (x, label, amount, bgColor) => {
            doc.rect(x, y, tColW, 18).fill(bgColor);
            doc.fontSize(8.5).fillColor('#ffffff').font('Helvetica-Bold')
               .text(label, x + 8, y + 5, { width: tColW - 80 });
            doc.text(fmtINR(amount), x + tColW - 75, y + 5, { width: 67, align: 'right' });
        };
        drawTotal(L,              'GROSS PAY',       payslip.grossTotal,      '#16a34a');
        drawTotal(L + tColW + 12, 'TOTAL DEDUCTIONS', payslip.deductionsTotal, '#dc2626');
        y += 18;

        // ── Net Pay highlight ──────────────────────────────────────────────────
        y += 8;
        doc.rect(L, y, usableW, 28).fill('#1e3a5f');
        doc.fontSize(12).fillColor('#ffffff').font('Helvetica-Bold')
           .text('NET PAY', L + 12, y + 8);
        doc.text(fmtINR(payslip.netTotal), L, y + 8, { width: usableW - 12, align: 'right' });
        y += 28;

        // ── Warnings (if any) ──────────────────────────────────────────────────
        const warnings = (payslip.warnings || []);
        if (warnings.length > 0) {
            y += 12;
            doc.fontSize(8).fillColor('#b45309').font('Helvetica-Bold').text('Notes / Warnings:', L, y);
            y += 12;
            warnings.forEach(w => {
                doc.fontSize(7.5).fillColor('#92400e').font('Helvetica')
                   .text(`• ${w.message}`, L + 8, y, { width: usableW - 16 });
                y += doc.heightOfString(w.message, { width: usableW - 24 }) + 3;
            });
        }

        // ── Footer ─────────────────────────────────────────────────────────────
        const footerY = doc.page.height - doc.page.margins.bottom - 24;
        doc.rect(0, footerY, pageW, 24).fill('#f3f4f6');
        doc.fontSize(7.5).fillColor('#9ca3af').font('Helvetica')
           .text(
               `Generated by AMS Payroll · ${new Date().toLocaleString('en-IN')} · This is a computer-generated document.`,
               L, footerY + 7,
               { width: usableW, align: 'center' }
           );

        doc.end();
    });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * generatePayslipPdf(payslipId)
 *
 * Loads the Payslip, renders the PDF, saves to disk, updates Payslip.pdfPath,
 * and returns the Buffer for immediate streaming.
 *
 * @param {string|ObjectId} payslipId
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
async function generatePayslipPdf(payslipId) {
    if (!mongoose.Types.ObjectId.isValid(payslipId)) {
        throw new Error(`Invalid payslipId: ${payslipId}`);
    }

    const Payslip = require('../models/Payslip');

    const payslip = await Payslip.findById(payslipId)
        .populate('employee',        'fullName email department designation employeeCode')
        .populate('contract',        'contractNumber wagePerMonth')
        .populate('salaryStructure', 'name code')
        .populate('payrun',          'name periodStart periodEnd status')
        .lean();

    if (!payslip) throw new Error(`Payslip ${payslipId} not found.`);

    const buffer = await renderPayslipPdf(payslip);

    // Persist to disk
    const filename = `payslip_${payslipId}.pdf`;
    const filePath = path.join(PDF_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    // Record path on the Payslip document (relative, not absolute)
    await Payslip.findByIdAndUpdate(payslipId, {
        $set: { pdfPath: `uploads/payslips/${filename}` },
    });

    return { buffer, filename };
}

module.exports = { generatePayslipPdf };
