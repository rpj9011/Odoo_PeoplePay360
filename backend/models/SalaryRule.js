// backend/models/SalaryRule.js
const mongoose = require('mongoose');

const salaryRuleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  // e.g. "BASIC", "HRA", "PF"

  category: {
    type: String,
    enum: ['Basic', 'Allowance', 'Gross', 'Deduction', 'Net'],
    required: true,
  },

  sequence: { type: Number, required: true, default: 10 },

  computationMethod: {
    type: String,
    enum: ['FixedAmount', 'PercentageOfWage', 'PercentageOfCategory', 'Formula'],
    required: true,
  },

  // ── Computation inputs (only one is relevant depending on computationMethod) ──
  // Used when computationMethod = 'FixedAmount'
  fixedAmount: { type: Number },

  // Used when computationMethod = 'PercentageOfWage' or 'PercentageOfCategory'
  // Stored as a plain number, e.g. 12 means 12 %
  percentage: { type: Number },

  // Used when computationMethod = 'PercentageOfCategory' — specifies which category
  // total to apply the percentage against (e.g. PF = 12% of Basic)
  percentageBaseCategory: {
    type: String,
    enum: ['Basic', 'Gross'],
  },

  // Used when computationMethod = 'Formula'.
  // Store the expression as a plain string (e.g. "BASIC * 0.12").
  // DO NOT use eval() — a restricted expression evaluator will be implemented in
  // the computation-engine phase to safely parse and run these formulas.
  formula: { type: String },

  // Sign convention:
  //   Earning   → adds to gross
  //   Deduction → subtracts from gross to arrive at net
  appliesTo: {
    type: String,
    enum: ['Earning', 'Deduction'],
    required: true,
  },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// ── INDEXES ──────────────────────────────────────────────────────────────────
salaryRuleSchema.index({ category: 1, sequence: 1 }, { background: true });
salaryRuleSchema.index({ isActive: 1 },              { background: true });
// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model('SalaryRule', salaryRuleSchema);
