const mongoose = require('mongoose');

const anonymousFeedbackSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
        trim: true
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    ipAddress: {
        type: String
    },
    userAgent: {
        type: String
    }
}, {
    timestamps: true
});

// Index for faster queries
anonymousFeedbackSchema.index({ submittedAt: -1 });

const AnonymousFeedback = mongoose.model('AnonymousFeedback', anonymousFeedbackSchema);

module.exports = AnonymousFeedback;
