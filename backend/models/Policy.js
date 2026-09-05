const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    version: {
        type: String,
        required: true,
        trim: true
    },
    effectiveFrom: {
        type: Date,
        required: true
    },
    department: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['Active', 'Archived'],
        default: 'Active'
    },
    fileId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileSize: {
        type: Number
    },
    // Legacy field for backward compatibility
    fileUrl: {
        type: String
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    replacedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy'
    },
    // Onboarding / compliance flags
    isMandatoryOnboarding: {
        type: Boolean,
        default: false,
        index: true
    },
    onboardingExpiryDays: {
        type: Number,
        default: 7  // induction popup hidden after this many days
    },
    wordCount: {
        type: Number,
        default: null // set by admin or auto-computed on upload
    }
}, {
    timestamps: true
});

// Index for faster queries
policySchema.index({ status: 1, effectiveFrom: -1 });
policySchema.index({ name: 1, version: 1 });

const Policy = mongoose.model('Policy', policySchema);

module.exports = Policy;
