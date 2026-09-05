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

// ── IMMUTABILITY GUARD (audit item #33) ─────────────────────────────────────
// Once a Payrun reaches 'Paid' status it must never roll back.
// This pre-save hook fires on every save() call and rejects any attempt to
// change status away from 'Paid', regardless of who calls save().
payrunSchema.pre('save', async function (next) {
  if (!this.isModified('status')) return next();

  // Fetch the original status from DB only when status is being changed.
  // isNew === true means this is a first insert, so there is no "original".
  if (this.isNew) return next();

  try {
    const original = await this.constructor
      .findById(this._id)
      .select('status')
      .lean();

    if (original && original.status === 'Paid' && this.status !== 'Paid') {
      return next(
        new Error(
          `Payrun "${this.name}" is already in Paid status and cannot be ` +
          `rolled back to "${this.status}". This action is permanently blocked ` +
          `to prevent payroll integrity violations.`
        )
      );
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Payrun', payrunSchema);
