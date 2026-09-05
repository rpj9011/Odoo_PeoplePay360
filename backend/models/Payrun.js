// backend/models/Payrun.js
const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
  type:     { type: String },
  message:  { type: String },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  severity: { type: String, enum: ['info', 'warning', 'error'] },
}, { _id: false });

const payrunSchema = new mongoose.Schema({
  name:        { type: String, required: true }, // e.g. "February 2026"
  periodStart: { type: Date,   required: true },
  periodEnd:   { type: Date,   required: true },

  // Optional scope filter set during the wizard (e.g. "All", "Full-time", "Contract")
  employeeType: { type: String },

  salaryStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure', required: true },

  status: {
    type: String,
    enum: ['Draft', 'Computed', 'Validated', 'Paid', 'Cancelled'],
    default: 'Draft',
  },

  // Employees selected in wizard step 2
  employees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Payslips generated for this run (populated after computation)
  payslips:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Payslip' }],

  // Computation / validation warnings collected during processing
  warnings: [warningSchema],

  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  computedAt:  { type: Date },

  validatedAt: { type: Date },
  validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  paidAt: { type: Date },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  payslipsSentAt: { type: Date },
}, { timestamps: true });

// ── INDEXES ──────────────────────────────────────────────────────────────────
// Dashboard queries filter by status; period queries filter by date range
payrunSchema.index({ status: 1 },                          { background: true });
payrunSchema.index({ periodStart: 1, periodEnd: 1 },       { background: true });
payrunSchema.index({ createdBy: 1, status: 1 },            { background: true });
// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Payrun', payrunSchema);
