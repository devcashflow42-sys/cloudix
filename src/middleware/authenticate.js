"use strict";

const jwtUtil = require("../utils/jwt");
const { UnauthorizedError } = require("../utils/AppError");
const userRepository = require("../repositories/userRepository");

/**
 * Extrae el token del header Authorization: Bearer <token>.
 */
function extractToken(req) {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header) return null;
    const parts = String(header).split(" ");
    if (parts.length !== 2) return null;
    if (parts[0].toLowerCase() !== "bearer") return null;
    return parts[1];
}

/**
 * Middleware obligatorio: si el token es inválido o falta, responde 401.
 * En caso de éxito, deja en req.user un DTO mínimo: { id, roles, email, username, tokenPayload }.
 */
async function authenticate(req, res, next) {
    try {
        const token = extractToken(req);
        if (!token) throw new UnauthorizedError("Falta el token de acceso.");

        let payload;
        try {
            payload = jwtUtil.verifyAccessToken(token);
        } catch (err) {
            if (err.name === "TokenExpiredError") throw new UnauthorizedError("El token ha expirado.");
            throw new UnauthorizedError("Token inválido.");
        }

        const user = await userRepository.findById(payload.sub);
        if (!user)              throw new UnauthorizedError("El usuario no existe.");
        if (!user.is_active)    throw new UnauthorizedError("La cuenta está desactivada.");
        if (user.deleted_at)    throw new UnauthorizedError("La cuenta fue eliminada.");

        const roles = payload.roles && Array.isArray(payload.roles) && payload.roles.length
            ? payload.roles
            : await userRepository.findRoles(user.id);

        req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            roles,
            emailVerified: user.email_verified,
            tokenPayload: payload,
        };

        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Autenticación opcional: si el token viene y es válido, hidrata req.user;
 * si no, deja que el request siga como anónimo.
 */
async function authenticateOptional(req, res, next) {
    try {
        const token = extractToken(req);
        if (!token) return next();
        const payload = jwtUtil.verifyAccessToken(token);
        const user = await userRepository.findById(payload.sub);
        if (user && user.is_active && !user.deleted_at) {
            const roles = payload.roles || await userRepository.findRoles(user.id);
            req.user = {
                id: user.id,
                email: user.email,
                username: user.username,
                roles,
                emailVerified: user.email_verified,
                tokenPayload: payload,
            };
        }
        next();
    } catch (err) {
        // Silencioso: sigue sin usuario
        next();
    }
}

module.exports = { authenticate, authenticateOptional };
