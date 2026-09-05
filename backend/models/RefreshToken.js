// backend/models/RefreshToken.js
// Stores the SHA-256 hash of each issued refresh token.
// Raw tokens are never persisted — only their hashes.
const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // SHA-256 hash of the raw opaque refresh token (never store the raw value)
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    issuedAt: {
        type: Date,
        default: Date.now,
    },
    // MongoDB TTL index — expired documents are auto-deleted by the MongoDB reaper.
    // expiresAfterSeconds: 0 means "delete when this Date is in the past".
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 },
    },
    revoked: {
        type: Boolean,
        default: false,
        index: true,
    },
    // Set to the hash of the successor token on rotation; null until rotated.
    // Provides an audit trail to reconstruct rotation chains.
    replacedByTokenHash: {
        type: String,
        default: null,
    },
    // Optional — stored for future device-awareness features, not used in auth logic.
    userAgent: {
        type: String,
        default: null,
    },
    // 'local' or 'SSO' — copied from the access-token claim so refresh knows
    // which token claim shape to re-derive when issuing a new access token.
    authMethod: {
        type: String,
        enum: ['local', 'SSO'],
        required: true,
        default: 'local',
    },
});

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
