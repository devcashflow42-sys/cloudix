"use strict";

const { query } = require("../database/connection");

// -------- REFRESH TOKENS --------

async function saveRefreshToken({ userId, tokenHash, expiresAt, userAgent, ip }) {
    const res = await query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, tokenHash, expiresAt, userAgent || null, ip || null],
    );
    return res.rows[0].id;
}

async function findRefreshToken(tokenHash) {
    const res = await query(
        `SELECT id, user_id, token_hash, expires_at, revoked_at
         FROM refresh_tokens
         WHERE token_hash = $1
         LIMIT 1`,
        [tokenHash],
    );
    return res.rows[0] || null;
}

async function revokeRefreshToken(id, replacedBy = null) {
    await query(
        `UPDATE refresh_tokens
            SET revoked_at = COALESCE(revoked_at, NOW()),
                replaced_by = COALESCE(replaced_by, $2)
          WHERE id = $1`,
        [id, replacedBy],
    );
}

async function revokeAllForUser(userId) {
    await query(
        `UPDATE refresh_tokens
            SET revoked_at = NOW()
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
    );
}

async function deleteExpiredRefreshTokens() {
    const res = await query(
        `DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '7 days'`,
    );
    return res.rowCount;
}

// -------- PASSWORD RESETS --------

async function createPasswordReset({ userId, tokenHash, expiresAt }) {
    // Invalida los previos activos para el mismo usuario
    await query(
        `UPDATE password_resets SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [userId],
    );
    const res = await query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, tokenHash, expiresAt],
    );
    return res.rows[0].id;
}

async function findPasswordReset(tokenHash) {
    const res = await query(
        `SELECT id, user_id, token_hash, expires_at, used_at
         FROM password_resets
         WHERE token_hash = $1 LIMIT 1`,
        [tokenHash],
    );
    return res.rows[0] || null;
}

async function markPasswordResetUsed(id) {
    await query(`UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [id]);
}

// -------- EMAIL VERIFICATIONS --------

async function createEmailVerification({ userId, tokenHash, expiresAt }) {
    await query(
        `UPDATE email_verifications SET verified_at = NOW()
         WHERE user_id = $1 AND verified_at IS NULL AND expires_at > NOW()`,
        [userId],
    );
    const res = await query(
        `INSERT INTO email_verifications (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [userId, tokenHash, expiresAt],
    );
    return res.rows[0].id;
}

async function findEmailVerification(tokenHash) {
    const res = await query(
        `SELECT id, user_id, token_hash, expires_at, verified_at
         FROM email_verifications
         WHERE token_hash = $1 LIMIT 1`,
        [tokenHash],
    );
    return res.rows[0] || null;
}

async function markEmailVerificationUsed(id) {
    await query(`UPDATE email_verifications SET verified_at = NOW() WHERE id = $1`, [id]);
}

module.exports = {
    saveRefreshToken,
    findRefreshToken,
    revokeRefreshToken,
    revokeAllForUser,
    deleteExpiredRefreshTokens,
    createPasswordReset,
    findPasswordReset,
    markPasswordResetUsed,
    createEmailVerification,
    findEmailVerification,
    markEmailVerificationUsed,
};
