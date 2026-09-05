// backend/models/AttendanceSession.js
const mongoose = require('mongoose');

const attendanceSessionSchema = new mongoose.Schema({
  attendanceLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLog', required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date }, // null if session is still active
  logoutType: { 
    type: String, 
    enum: ['MANUAL', 'AUTO', 'SYSTEM'], 
    default: 'MANUAL' 
  }, // Track if logout was manual, automatic, or system cleanup
  autoLogoutReason: { type: String }, // Reason for auto-logout (e.g., "Exceeded expected logout time + buffer")
  isLegacySession: { type: Boolean, default: false }, // Flag for legacy/orphan sessions
}, { timestamps: true });

// Index for "who's in" and dashboard queries: match active sessions (endTime: null)
attendanceSessionSchema.index({ endTime: 1 }, { background: true });

// Index for $lookup joins in attendance summary aggregate
attendanceSessionSchema.index({ attendanceLog: 1 }, { background: true });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);