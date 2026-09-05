// backend/models/Payslip.js
const mongoose = require('mongoose');

// ── Denormalised line item ────────────────────────────────────────────────────
// code / name / category / sequence are snapshotted at compute time so that
// editing a SalaryRule later never silently changes historical payslips.
const payslipLineSchema = new mongoose.Schema({
  rule:     { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryRule' },
  code:     { type: String },
  name:     { type: String },
  category: { type: String },
  amount:   { type: Number },
  sequence: { type: Number },
}, { _id: false });

const payslipWarningSchema = new mongoose.Schema({
  message:  { type: String },
  severity: { type: String, enum: ['info', 'warning', 'error'] },
}, { _id: false });

const payslipSchema = new mongoose.Schema({
  employee:        { type: mongoose.Schema.Types.ObjectId, ref: 'User',            required: true },
  payrun:          { type: mongoose.Schema.Types.ObjectId, ref: 'Payrun',          required: true },
  contract:        { type: mongoose.Schema.Types.ObjectId, ref: 'Contract',        required: true },
  salaryStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure', required: true },

  periodStart: { type: Date, required: true },
  periodEnd:   { type: Date, required: true },

  workedDays: { type: Number, default: 0 },

  // Computed salary lines (denormalised snapshot — see payslipLineSchema above)
  lines: [payslipLineSchema],

  // Aggregated totals populated by the computation engine
  basicTotal:      { type: Number, default: 0 },
  grossTotal:      { type: Number, default: 0 },
  deductionsTotal: { type: Number, default: 0 },
  netTotal:        { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['Draft', 'Computed', 'Validated', 'Paid'],
    default: 'Draft',
  },

  warnings: [payslipWarningSchema],

  // Set once a PDF is generated (path or CDN URL)
  pdfPath:   { type: String },
  emailedAt: { type: Date },
}, { timestamps: true });

// ── INDEXES ──────────────────────────────────────────────────────────────────
// Unique compound index: one payslip per employee per payrun.
// This is the technical enforcement of the "no duplicate payslip" spec requirement —
// the computation engine can detect duplicates via a unique-key violation on insert.
payslipSchema.index(
  { payrun: 1, employee: 1 },
  { unique: true, background: true, name: 'unique_payslip_per_payrun_employee' }
);
// Support employee pay-history view
payslipSchema.index({ employee: 1, periodStart: 1 }, { background: true });
// Support status-based bulk queries (e.g. "fetch all Validated payslips in a run")
payslipSchema.index({ payrun: 1, status: 1 },        { background: true });
// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Payslip', payslipSchema);
