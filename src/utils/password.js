"use strict";

const bcrypt = require("bcrypt");
const env = require("../config/env");

async function hash(plain) {
    return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

async function verify(plain, hashed) {
    if (!plain || !hashed) return false;
    return bcrypt.compare(plain, hashed);
}

/**
 * Valida robustez mínima de contraseña. No sustituye a express-validator,
 * pero sirve para cambios internos (seed, resets).
 */
function isStrong(password) {
    if (typeof password !== "string") return false;
    if (password.length < 8) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[A-Z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
}

module.exports = { hash, verify, isStrong };
