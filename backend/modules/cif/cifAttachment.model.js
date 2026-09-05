const mongoose = require('mongoose');

const cifAttachmentSchema = new mongoose.Schema({
  cifId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CIF',
    required: true,
    index: true
  },
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    comment: 'GridFS file ID'
  },
  fileName: {
    type: String,
    required: true,
    trim: true,
    comment: 'Stored filename in GridFS'
  },
  originalName: {
    type: String,
    required: true,
    trim: true,
    comment: 'Original filename from upload'
  },
  fileType: {
    type: String,
    required: true,
    trim: true,
    comment: 'MIME type'
  },
  fileSize: {
    type: Number,
    required: true,
    comment: 'File size in bytes'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
cifAttachmentSchema.index({ cifId: 1, createdAt: -1 });
cifAttachmentSchema.index({ fileId: 1 });

module.exports = mongoose.model('CIFAttachment', cifAttachmentSchema);
