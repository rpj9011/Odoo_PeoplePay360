// backend/models/EarlyCheckoutRequest.js
const mongoose = require('mongoose');

const earlyCheckoutRequestSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendanceLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog', required: true },
  reason: { type: String, required: true, trim: true },
  requestedAt: { type: Date, required: true },
  requiredLogoutTime: { type: Date, required: true },
  remainingTimeMinutes: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: { type: Date },
}, { timestamps: true });

earlyCheckoutRequestSchema.index({ employee: 1, createdAt: -1 });
earlyCheckoutRequestSchema.index({ status: 1, createdAt: -1 });
earlyCheckoutRequestSchema.index({ attendanceLog: 1 }, { unique: false });

module.exports = mongoose.model('EarlyCheckoutRequest', earlyCheckoutRequestSchema);
