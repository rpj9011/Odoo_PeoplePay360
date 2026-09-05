const mongoose = require('mongoose');
const { CIF_STATUSES, CIF_CATEGORIES, CIF_SEVERITIES, CONFIDENTIAL_LEVELS } = require('./cif.constants');

const cifSchema = new mongoose.Schema({
  cifNumber: {
    type: Number,
    unique: true,
    sparse: true
  },
  cifId: {
    type: String,
    unique: true,
    sparse: true
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: CIF_CATEGORIES,
    required: true,
    index: true
  },
  severity: {
    type: String,
    enum: CIF_SEVERITIES,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  incidentDate: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: CIF_STATUSES,
    default: 'open',
    index: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  followUpDate: {
    type: Date
  },
  resolutionNotes: {
    type: String
  },
  confidentialLevel: {
    type: String,
    enum: CONFIDENTIAL_LEVELS,
    default: 'internal',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for performance
cifSchema.index({ employeeId: 1, status: 1 });
cifSchema.index({ severity: 1, status: 1 });
cifSchema.index({ isArchived: 1, createdAt: -1 });
cifSchema.index({ status: 1, confidentialLevel: 1 });
cifSchema.index({ isArchived: 1, status: 1 }); // Phase 3: Archive + status filtering
cifSchema.index({ category: 1, severity: 1 }); // Phase 3: Category + severity filtering
cifSchema.index({ incidentDate: 1 }); // Phase 3: Date range queries
cifSchema.index({ assignedTo: 1, status: 1 }); // Phase 3: Assignment filtering

module.exports = mongoose.model('CIF', cifSchema);
