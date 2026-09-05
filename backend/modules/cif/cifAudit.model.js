const mongoose = require('mongoose');

const cifAuditSchema = new mongoose.Schema({
  cifId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CIF',
    required: true,
    index: true
  },
  actionType: {
    type: String,
    enum: ['create', 'update', 'status_change', 'view', 'attachment_upload', 'attachment_delete'],
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed
  },
  reason: {
    type: String
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
cifAuditSchema.index({ cifId: 1, createdAt: -1 });

module.exports = mongoose.model('CIFAudit', cifAuditSchema);
