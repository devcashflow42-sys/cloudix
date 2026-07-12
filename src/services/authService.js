"use strict";

const userRepo = require("../repositories/userRepository");
const tokenRepo = require("../repositories/tokenRepository");
const passwordUtil = require("../utils/password");
const jwtUtil = require("../utils/jwt");
const {
    ConflictError, UnauthorizedError, NotFoundError, BadRequestError, ForbiddenError,
} = require("../utils/AppError");
const { ROLES } = require("../config/roles");
const env = require("../config/env");
const logger = require("../utils/logger");

/**
 * Emite un par de tokens (access + refresh) y almacena el refresh en BD
 * (como hash sha-256) para poder revocarlo.
 */
async function issueTokenPair(user, { userAgent, ip } = {}) {
    const roles = await userRepo.findRoles(user.id);
    const accessToken = jwtUtil.signAccessToken({
        sub: user.id,
        email: user.email,
        username: user.username,
        roles,
    });
    const refreshToken = jwtUtil.signRefreshToken({
        sub: user.id,
        type: "refresh",
    });
    const tokenHash = jwtUtil.sha256(refreshToken);
    const expiresAt = jwtUtil.expiryDateFromString(env.JWT_REFRESH_EXPIRES_IN);
    const refreshId = await tokenRepo.saveRefreshToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgent,
        ip,
    });
    return { accessToken, refreshToken, refreshId, roles, expiresAt };
}

async function register({ username, email, password, firstName, lastName, language }) {
    const { emailTaken, usernameTaken } = await userRepo.existsByEmailOrUsername(email, username);
    if (emailTaken)    throw new ConflictError("El correo ya está registrado.", { field: "email" });
    if (usernameTaken) throw new ConflictError("El nombre de usuario ya está en uso.", { field: "username" });

    const hash = await passwordUtil.hash(password);
    const user = await userRepo.create({
        username,
        email,
        passwordHash: hash,
        firstName,
        lastName,
        language,
    });
    await userRepo.assignRole(user.id, ROLES.USER);

    // Token de verificación de email
    const verificationTokenRaw = jwtUtil.generateOpaqueToken(24);
    const verificationHash = jwtUtil.sha256(verificationTokenRaw);
    await tokenRepo.createEmailVerification({
        userId: user.id,
        tokenHash: verificationHash,
        expiresAt: jwtUtil.expiryDateFromString("2d"),
    });

    logger.info(`[auth] Nuevo registro: ${email}`);
    return { user, roles: [ROLES.USER], verificationToken: verificationTokenRaw };
}

async function login({ identifier, password, userAgent, ip }) {
    if (!identifier || !password) {
        throw new BadRequestError("Debes proporcionar credenciales.");
    }
    // Identifier puede ser email o username
    const user = identifier.includes("@")
        ? await userRepo.findByEmail(identifier)
        : await userRepo.findByUsername(identifier);
    if (!user) throw new UnauthorizedError("Credenciales inválidas.");
    if (!user.is_active) throw new ForbiddenError("La cuenta está desactivada.");
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new ForbiddenError("Cuenta bloqueada temporalmente por intentos fallidos. Intenta más tarde.");
    }

    const ok = await passwordUtil.verify(password, user.password_hash);
    if (!ok) {
        const failed = await userRepo.incrementFailedAttempts(user.id);
        const remaining = Math.max(0, 5 - failed.failed_attempts);
        throw new UnauthorizedError(
            remaining > 0
                ? `Credenciales inválidas. Intentos restantes: ${remaining}.`
                : "Credenciales inválidas. La cuenta ha quedado bloqueada temporalmente.",
        );
    }

    await userRepo.updateLoginSuccess(user.id, ip);
    const tokens = await issueTokenPair(user, { userAgent, ip });
    return { user, ...tokens };
}

async function refresh({ refreshToken, userAgent, ip }) {
    if (!refreshToken) throw new UnauthorizedError("Falta el refresh token.");

    let payload;
    try {
        payload = jwtUtil.verifyRefreshToken(refreshToken);
    } catch (err) {
        throw new UnauthorizedError("Refresh token inválido o expirado.");
    }
    const tokenHash = jwtUtil.sha256(refreshToken);
    const stored = await tokenRepo.findRefreshToken(tokenHash);
    if (!stored)                           throw new UnauthorizedError("Refresh token no reconocido.");
    if (stored.revoked_at)                 throw new UnauthorizedError("Refresh token revocado.");
    if (new Date(stored.expires_at) < new Date()) throw new UnauthorizedError("Refresh token expirado.");
    if (stored.user_id !== payload.sub)    throw new UnauthorizedError("Refresh token inconsistente.");

    const user = await userRepo.findById(payload.sub);
    if (!user)           throw new UnauthorizedError("El usuario no existe.");
    if (!user.is_active) throw new ForbiddenError("La cuenta está desactivada.");

    // Rotación: emite nuevo par y revoca el viejo
    const tokens = await issueTokenPair(user, { userAgent, ip });
    await tokenRepo.revokeRefreshToken(stored.id, tokens.refreshId);
    return { user, ...tokens };
}

async function logout({ refreshToken }) {
    if (!refreshToken) return;
    const tokenHash = jwtUtil.sha256(refreshToken);
    const stored = await tokenRepo.findRefreshToken(tokenHash);
    if (stored && !stored.revoked_at) {
        await tokenRepo.revokeRefreshToken(stored.id);
    }
}

async function logoutAll(userId) {
    await tokenRepo.revokeAllForUser(userId);
}

async function forgotPassword({ email }) {
    const user = await userRepo.findByEmail(email);
    // No revelamos si el email existe o no.
    if (!user) return { emailSent: true, token: null };
    const raw = jwtUtil.generateOpaqueToken(24);
    const hash = jwtUtil.sha256(raw);
    await tokenRepo.createPasswordReset({
        userId: user.id,
        tokenHash: hash,
        expiresAt: jwtUtil.expiryDateFromString("1h"),
    });
    logger.info(`[auth] Solicitud de reset de contraseña para ${email}`);
    // En un sistema real aquí se enviaría un email con el token.
    return { emailSent: true, token: raw, userId: user.id };
}

async function resetPassword({ token, newPassword }) {
    if (!token) throw new BadRequestError("Falta el token de recuperación.");
    const hash = jwtUtil.sha256(token);
    const record = await tokenRepo.findPasswordReset(hash);
    if (!record)                           throw new BadRequestError("Token de recuperación inválido.");
    if (record.used_at)                    throw new BadRequestError("Este token ya fue utilizado.");
    if (new Date(record.expires_at) < new Date()) throw new BadRequestError("El token ha expirado.");

    const passwordHash = await passwordUtil.hash(newPassword);
    await userRepo.updatePassword(record.user_id, passwordHash);
    await tokenRepo.markPasswordResetUsed(record.id);
    await tokenRepo.revokeAllForUser(record.user_id);
    logger.info(`[auth] Contraseña restablecida para user ${record.user_id}`);
    return true;
}

async function changePassword({ userId, currentPassword, newPassword }) {
    const user = await userRepo.findById(userId);
    if (!user) throw new NotFoundError("Usuario no encontrado.");
    const ok = await passwordUtil.verify(currentPassword, user.password_hash);
    if (!ok) throw new UnauthorizedError("La contraseña actual es incorrecta.");
    const hash = await passwordUtil.hash(newPassword);
    await userRepo.updatePassword(userId, hash);
    await tokenRepo.revokeAllForUser(userId);
    return true;
}

async function sendVerification({ userId }) {
    const user = await userRepo.findById(userId);
    if (!user) throw new NotFoundError("Usuario no encontrado.");
    if (user.email_verified) throw new ConflictError("El correo ya está verificado.");
    const raw = jwtUtil.generateOpaqueToken(24);
    const hash = jwtUtil.sha256(raw);
    await tokenRepo.createEmailVerification({
        userId,
        tokenHash: hash,
        expiresAt: jwtUtil.expiryDateFromString("2d"),
    });
    return { verificationToken: raw };
}

async function verifyEmail({ token }) {
    if (!token) throw new BadRequestError("Falta el token de verificación.");
    const hash = jwtUtil.sha256(token);
    const record = await tokenRepo.findEmailVerification(hash);
    if (!record)                           throw new BadRequestError("Token de verificación inválido.");
    if (record.verified_at)                throw new BadRequestError("Este token ya fue utilizado.");
    if (new Date(record.expires_at) < new Date()) throw new BadRequestError("El token ha expirado.");
    await userRepo.markEmailVerified(record.user_id);
    await tokenRepo.markEmailVerificationUsed(record.id);
    return true;
}

module.exports = {
    register,
    login,
    refresh,
    logout,
    logoutAll,
    forgotPassword,
    resetPassword,
    changePassword,
    sendVerification,
    verifyEmail,
    issueTokenPair,
};
