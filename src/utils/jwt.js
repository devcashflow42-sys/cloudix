"use strict";

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const env = require("../config/env");

const commonOptions = {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithm: "HS256",
};

/**
 * Firma un access token (corto).
 * @param {object} payload  ej: { sub: userId, roles: ["user"] }
 */
function signAccessToken(payload) {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
        ...commonOptions,
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        subject: String(payload.sub || payload.userId),
    });
}

/**
 * Firma un refresh token (largo). Suele incluir jti para poder revocar.
 */
function signRefreshToken(payload) {
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
        ...commonOptions,
        expiresIn: env.JWT_REFRESH_EXPIRES_IN,
        subject: String(payload.sub || payload.userId),
    });
}

function verifyAccessToken(token) {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithms: ["HS256"],
    });
}

function verifyRefreshToken(token) {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, {
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        algorithms: ["HS256"],
    });
}

/**
 * Hash SHA-256 (hex) — usado para guardar refresh tokens en BD sin exponer el original.
 */
function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Token opaco aleatorio (para email verification, password reset, etc.).
 */
function generateOpaqueToken(bytes = 48) {
    return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Calcula la fecha de expiración a partir de una cadena tipo "15m", "30d".
 */
function expiryDateFromString(spec) {
    const match = /^(\d+)([smhdwy])$/.exec(spec);
    if (!match) return new Date(Date.now() + 15 * 60 * 1000);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3, y: 365 * 86400e3 };
    return new Date(Date.now() + value * multipliers[unit]);
}

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    sha256,
    generateOpaqueToken,
    expiryDateFromString,
};
