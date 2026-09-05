// backend/utils/refreshTokenUtils.js
// Utilities for issuing, rotating, and revoking opaque refresh tokens.
//
// Design decisions:
//   - Refresh tokens are opaque random bytes, NOT JWTs.
//   - Only the SHA-256 hash of the raw token is stored in MongoDB.
//   - The raw token is returned to the client exactly once (at issuance)
//     and sent back via an httpOnly cookie — never readable by JS.
//   - Token rotation: each use of a refresh token invalidates the old one
//     and issues a new one (rolling rotation).
//   - Reuse of an already-rotated (revoked) token raises RefreshTokenReuseError
//     and is logged clearly for security review.
//   - Rotation is ATOMIC: uses findOneAndUpdate with a conditional filter so
//     two concurrent callers presenting the same token can never both succeed.

const crypto = require('crypto');
const RefreshToken = require('../models/RefreshToken');

// Refresh token lifespan: 7 days (matches the old single-token lifetime)
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Custom error class for detecting possible token theft.
 * Thrown when a refresh token that has already been rotated (i.e., revoked
 * and replaced) is presented again.
 */
class RefreshTokenReuseError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RefreshTokenReuseError';
    }
}

/**
 * Generates a cryptographically random opaque refresh token string.
 * 40 bytes → 80 hex characters; sufficient entropy against brute-force.
 * @returns {string} Raw hex token
 */
function generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
}

/**
 * Returns the SHA-256 hash of a raw refresh token for DB storage / lookup.
 * @param {string} rawToken
 * @returns {string} Hex-encoded SHA-256 digest
 */
function hashRefreshToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Issues a new refresh token for a user and persists its hash to MongoDB.
 *
 * @param {string|ObjectId} userId  - AMS User._id
 * @param {'local'|'SSO'} authMethod - Propagated from the access token so
 *                                     the refresh endpoint knows how to
 *                                     re-derive the next access token.
 * @param {string} [userAgent]      - Optional UA string for future device tracking.
 * @returns {Promise<string>}        Raw token to send to the client.
 */
async function issueRefreshToken(userId, authMethod = 'local', userAgent = null) {
    const rawToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(rawToken);

    await RefreshToken.create({
        userId,
        tokenHash,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revoked: false,
        replacedByTokenHash: null,
        userAgent: userAgent || null,
        authMethod,
    });

    return rawToken;
}

/**
 * Validates an incoming refresh token, revokes it atomically, and issues a
 * new one (rolling rotation).
 *
 * ATOMICITY: The "mark as revoked" step uses a single findOneAndUpdate with a
 * conditional filter `{ tokenHash: oldHash, revoked: false }`. Only one
 * concurrent caller can win this write — MongoDB document-level locking ensures
 * the second caller gets null back, preventing the race condition that caused
 * intermittent logouts under multi-tab / retry scenarios.
 *
 * @param {string} oldRawToken - The raw token from the client cookie.
 * @returns {Promise<{ newRawToken: string, userId: string, authMethod: string }>}
 * @throws {RefreshTokenReuseError} If the token was already rotated (possible theft).
 * @throws {Error} If the token is not found, expired, or revoked for other reasons.
 */
async function rotateRefreshToken(oldRawToken) {
    const oldHash = hashRefreshToken(oldRawToken);
    const hashPrefix = oldHash.slice(0, 12);

    // Prepare the replacement hash upfront so we can set it in the atomic write.
    const newRawToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRawToken);

    // ─── ATOMIC READ-AND-REVOKE ────────────────────────────────────────────────
    // findOneAndUpdate with { revoked: false } as part of the query filter means
    // this write can only succeed once, even if two requests race with the same
    // token. { new: false } returns the pre-update document so we can read
    // userId / authMethod / expiresAt without a second round-trip.
    const preUpdateRecord = await RefreshToken.findOneAndUpdate(
        { tokenHash: oldHash, revoked: false },
        { $set: { revoked: true, replacedByTokenHash: newHash } },
        { new: false }
    );

    if (!preUpdateRecord) {
        // The atomic write found nothing with revoked:false. Distinguish between:
        //   a) Token never existed / already cleaned up by TTL → generic error
        //   b) Token exists but is already revoked → reuse / possible theft
        const existingRecord = await RefreshToken.findOne({ tokenHash: oldHash }).lean();

        if (!existingRecord) {
            // (a) Token simply doesn't exist — fabricated or TTL-expired.
            console.info(
                `[RefreshToken] INFO not-found | hash: ${hashPrefix}... | ` +
                `branch: token-not-found`
            );
            throw new Error('Refresh token not found');
        }

        // (b) Record exists but was already revoked.
        if (existingRecord.replacedByTokenHash) {
            // Already rotated before — classic reuse / token theft signal.
            console.error(
                `[RefreshToken] ⚠️  REUSE DETECTED | hash: ${hashPrefix}... | ` +
                `userId: ${existingRecord.userId} | ` +
                `replacedBy: ${existingRecord.replacedByTokenHash.slice(0, 12)}... | ` +
                `issuedAt: ${existingRecord.issuedAt ? existingRecord.issuedAt.toISOString() : 'unknown'} | ` +
                `branch: reuse-detected | ` +
                `This may indicate token theft. Manual review recommended.`
            );
            throw new RefreshTokenReuseError(
                'Refresh token has already been rotated — possible token reuse / theft'
            );
        }

        // Revoked without a replacement — e.g. revoked by logout or admin action.
        console.info(
            `[RefreshToken] INFO already-revoked | hash: ${hashPrefix}... | ` +
            `userId: ${existingRecord.userId} | ` +
            `branch: already-revoked-no-replacement`
        );
        throw new Error('Refresh token has been revoked');
    }

    // ─── POST-ATOMIC-WRITE CHECKS ─────────────────────────────────────────────
    // Check expiry on the pre-update doc (belt-and-suspenders — MongoDB TTL
    // handles cleanup but may lag by up to 60 seconds).
    if (preUpdateRecord.expiresAt < new Date()) {
        // Already marked as rotated above, but the token was expired — treat
        // as an invalid token rather than a reuse event.
        console.info(
            `[RefreshToken] INFO expired | hash: ${hashPrefix}... | ` +
            `userId: ${preUpdateRecord.userId} | ` +
            `expiresAt: ${preUpdateRecord.expiresAt.toISOString()} | ` +
            `branch: expired`
        );
        throw new Error('Refresh token has expired');
    }

    // ─── ISSUE REPLACEMENT TOKEN ──────────────────────────────────────────────
    // The atomic update already wrote newHash into replacedByTokenHash, so now
    // we just persist the new child document.
    await RefreshToken.create({
        userId: preUpdateRecord.userId,
        tokenHash: newHash,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        revoked: false,
        replacedByTokenHash: null,
        userAgent: preUpdateRecord.userAgent,
        authMethod: preUpdateRecord.authMethod,
    });

    console.info(
        `[RefreshToken] INFO success | hash: ${hashPrefix}... | ` +
        `userId: ${preUpdateRecord.userId} | ` +
        `newHash: ${newHash.slice(0, 12)}... | ` +
        `branch: rotated`
    );

    return {
        newRawToken,
        userId: preUpdateRecord.userId.toString(),
        authMethod: preUpdateRecord.authMethod,
    };
}

/**
 * Revokes a refresh token (used on logout).
 * Does not issue a replacement. Silently no-ops if the token is not found
 * (idempotent — safe to call on already-expired/deleted tokens).
 *
 * @param {string} rawToken - Raw token from the client cookie.
 * @returns {Promise<void>}
 */
async function revokeRefreshToken(rawToken) {
    if (!rawToken) return;
    const tokenHash = hashRefreshToken(rawToken);
    await RefreshToken.updateOne(
        { tokenHash, revoked: false },
        { $set: { revoked: true } }
    );
}

module.exports = {
    RefreshTokenReuseError,
    generateRefreshToken,
    hashRefreshToken,
    issueRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
};
