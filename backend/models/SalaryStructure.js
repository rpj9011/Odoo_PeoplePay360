// backend/models/SalaryStructure.js
const mongoose = require('mongoose');

const salaryStructureSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, uppercase: true, trim: true },
  // e.g. "REG" for "Regular Salary"

  description: { type: String },

  // Ordered list of salary rules that belong to this structure.
  // `sequence` here mirrors SalaryRule.sequence and controls the computation order
  // (lower sequence = computed first, so BASIC is available before HRA uses it).
  salaryRules: [
    {
      rule:     { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryRule', required: true },
      sequence: { type: Number, default: 10 },
    },
  ],

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// ── VIRTUAL: sortedRules ──────────────────────────────────────────────────────
// Returns the salaryRules array sorted ascending by sequence, without mutating
// the stored document.  Use .toObject({ virtuals: true }) or access via the
// instance method below when you need the ordered list in JS.
salaryStructureSchema.virtual('sortedRules').get(function () {
  return [...this.salaryRules].sort((a, b) => a.sequence - b.sequence);
});

// ── INSTANCE METHOD: getSortedRules() ────────────────────────────────────────
// Convenience alias for use in the computation engine:
//   const rules = structure.getSortedRules();
salaryStructureSchema.methods.getSortedRules = function () {
  return [...this.salaryRules].sort((a, b) => a.sequence - b.sequence);
};

// ── INDEXES ──────────────────────────────────────────────────────────────────
salaryStructureSchema.index({ isActive: 1 }, { background: true });
// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model('SalaryStructure', salaryStructureSchema);
