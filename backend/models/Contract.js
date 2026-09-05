// backend/models/Contract.js
const mongoose = require('mongoose');
const Counter = require('./Counter');

const contractSchema = new mongoose.Schema({
  employee:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  contractNumber:  { type: String, unique: true }, // auto-generated: CON/YYYY/NNNN

  startDate: { type: Date, required: true },
  // null / undefined = open-ended (currently running)
  endDate: { type: Date, default: null },

  status: {
    type: String,
    enum: ['Draft', 'Running', 'Expired', 'Cancelled'],
    default: 'Draft',
  },

  department:   { type: String },
  jobPosition:  { type: String },
  wagePerMonth: { type: Number, required: true },

  workingSchedule:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  salaryStructure:  { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure' },

  notes: { type: String },
}, { timestamps: true });

// ── INDEXES ──────────────────────────────────────────────────────────────────
// Fast lookup of all contracts for a given employee (most common query pattern)
contractSchema.index({ employee: 1, status: 1 }, { background: true });
// Support period-overlap queries: employee + date range
contractSchema.index({ employee: 1, startDate: 1, endDate: 1 }, { background: true });
// ─────────────────────────────────────────────────────────────────────────────

// ── AUTO-GENERATE contractNumber ─────────────────────────────────────────────
// Produces "CON/2026/0042" (zero-padded 4-digit sequence, resets per year via
// a year-scoped counter key so numbering restarts each calendar year).
contractSchema.pre('save', async function (next) {
  try {
    if (!this.contractNumber) {
      const year = new Date().getFullYear();
      const counterKey = `contract_${year}`;

      const counter = await Counter.findOneAndUpdate(
        { name: counterKey },
        { $inc: { value: 1 } },
        { new: true, upsert: true }
      );

      this.contractNumber = `CON/${year}/${String(counter.value).padStart(4, '0')}`;
    }

    // ── OVERLAP VALIDATION FOR 'Running' CONTRACTS ─────────────────────────
    // Before saving a Running contract, ensure no other Running contract for
    // the same employee overlaps the [startDate, endDate||∞] window.
    if (this.status === 'Running') {
      const periodEnd = this.endDate || new Date('9999-12-31');

      const overlap = await this.constructor.findOne({
        _id:      { $ne: this._id },           // exclude self (for updates)
        employee: this.employee,
        status:   'Running',
        // Two intervals [A,B] and [C,D] overlap when A <= D && C <= B
        startDate: { $lte: periodEnd },
        $or: [
          { endDate: null },                   // open-ended contract always extends to ∞
          { endDate: { $gte: this.startDate } },
        ],
      });

      if (overlap) {
        return next(
          new Error(
            `Employee already has a Running contract (${overlap.contractNumber}) ` +
            `that overlaps the period ${this.startDate.toDateString()} – ` +
            `${this.endDate ? this.endDate.toDateString() : 'open-ended'}. ` +
            `An employee cannot have two concurrent Running contracts.`
          )
        );
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

// ── STATIC: find the Running contract that covers a payroll period ────────────
/**
 * Returns the single Running contract whose [startDate, endDate||∞] overlaps
 * [periodStart, periodEnd].  Used by the payslip computation engine.
 *
 * @param {ObjectId|string} employeeId
 * @param {Date}            periodStart
 * @param {Date}            periodEnd
 * @returns {Promise<Contract|null>}
 */
contractSchema.statics.getActiveContractForPeriod = function (employeeId, periodStart, periodEnd) {
  return this.findOne({
    employee: employeeId,
    status:   'Running',
    startDate: { $lte: periodEnd },
    $or: [
      { endDate: null },
      { endDate: { $gte: periodStart } },
    ],
  }).populate('salaryStructure workingSchedule');
};

module.exports = mongoose.model('Contract', contractSchema);
