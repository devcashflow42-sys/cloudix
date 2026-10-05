// Lógica de negocio de autenticación, reutilizable por los endpoints de /auth.
import { getSql } from "../database/client.js";
import { hashPassword, verifyPassword, verifyDummyPassword, randomToken, sha256Hex } from "../utils/password.js";
import { signAccessToken } from "../utils/jwt.js";
import * as rateLimit from "../utils/rateLimit.js";
import {
    ConflictError, UnauthorizedError, BadRequestError,
} from "../utils/errors.js";

// Límites de intentos (ventanas en segundos).
const LIMITS = {
    // Fallos de login contra una misma cuenta -> bloqueo temporal de la cuenta.
    loginAccount: { max: 5, windowSec: 15 * 60, message: "Cuenta bloqueada temporalmente por demasiados intentos fallidos. Inténtalo más tarde." },
    // Fallos de login desde una misma IP (frena ataques a muchas cuentas).
    loginIp: { max: 20, windowSec: 15 * 60, message: "Demasiados intentos de inicio de sesión. Inténtalo más tarde." },
    register: { max: 10, windowSec: 60 * 60, message: "Demasiados registros desde esta red. Inténtalo más tarde." },
    forgotIp: { max: 5, windowSec: 60 * 60, message: "Demasiadas solicitudes de recuperación. Inténtalo más tarde." },
    forgotEmail: { max: 3, windowSec: 60 * 60 },
};

// Margen para refrescos concurrentes (p. ej. dos pestañas) antes de considerar
// que un refresh token revocado está siendo reutilizado.
const REFRESH_REUSE_GRACE_SECONDS = 30;

/**
 * Los tokens de verificación/restablecimiento solo deben llegar por email.
 * Exponerlos en la respuesta permitiría a cualquiera restablecer la contraseña
 * de otra cuenta, así que solo se devuelven si se activa explícitamente.
 */
function exposeDevTokens(env) {
    return env.EXPOSE_DEV_TOKENS === "true";
}

function refreshTtlSeconds(env) {
    return parseInt(env.REFRESH_TOKEN_TTL || "2592000", 10);
}

/** Emite un par de tokens (access JWT + refresh opaco persistido). */
async function issueTokens(env, sql, user) {
    const accessToken = await signAccessToken(env, { sub: user.id, role: user.role });

    const refreshToken = randomToken(48);
    const tokenHash = await sha256Hex(refreshToken);
    const ttl = refreshTtlSeconds(env);
    await sql`
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES (${user.id}, ${tokenHash}, NOW() + make_interval(secs => ${ttl}))`;

    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: parseInt(env.ACCESS_TOKEN_TTL || "900", 10) };
}

export async function register(env, { username, email, password, displayName, ip }) {
    const sql = getSql(env);
    await rateLimit.consume(sql, `register:ip:${ip}`, LIMITS.register);

    const exists = await sql`
        SELECT 1 FROM users WHERE LOWER(email) = LOWER(${email}) OR LOWER(username) = LOWER(${username}) LIMIT 1`;
    if (exists.length) throw new ConflictError("El correo o el nombre de usuario ya están en uso.");

    const passwordHash = await hashPassword(password);
    const rows = await sql`
        INSERT INTO users (username, email, password_hash, display_name)
        VALUES (${username}, ${email}, ${passwordHash}, ${displayName || username})
        RETURNING id, username, email, display_name, avatar_url, role, is_verified, created_at`;
    const user = rows[0];

    // Token de verificación de correo (en producción se enviaría por email).
    const verifyToken = randomToken();
    await sql`
        INSERT INTO email_verifications (user_id, token_hash, expires_at)
        VALUES (${user.id}, ${await sha256Hex(verifyToken)}, NOW() + INTERVAL '24 hours')`;

    const tokens = await issueTokens(env, sql, user);
    const result = { user, tokens };
    if (exposeDevTokens(env)) result.verifyToken = verifyToken;
    return result;
}

export async function login(env, { identifier, password, ip }) {
    const sql = getSql(env);
    const ipKey = `login:ip:${ip}`;
    const accountKey = `login:acct:${identifier.toLowerCase()}`;

    // Se comprueba antes de verificar la contraseña: durante el bloqueo ni
    // siquiera una contraseña correcta permite entrar.
    await rateLimit.assertNotLimited(sql, ipKey, LIMITS.loginIp);
    await rateLimit.assertNotLimited(sql, accountKey, LIMITS.loginAccount);

    const rows = await sql`
        SELECT id, username, email, display_name, avatar_url, role, is_verified, is_active, password_hash
        FROM users
        WHERE LOWER(email) = LOWER(${identifier}) OR LOWER(username) = LOWER(${identifier})
        LIMIT 1`;
    const user = rows[0];

    // Si el usuario no existe se hace igualmente un hash para que el tiempo
    // de respuesta no revele qué cuentas están registradas.
    const valid = user
        ? await verifyPassword(password, user.password_hash)
        : await verifyDummyPassword(password);

    if (!valid) {
        await Promise.all([
            rateLimit.hit(sql, ipKey, LIMITS.loginIp),
            rateLimit.hit(sql, accountKey, LIMITS.loginAccount),
        ]);
        throw new UnauthorizedError("Credenciales inválidas.");
    }
    if (!user.is_active) throw new UnauthorizedError("La cuenta está desactivada.");

    await Promise.all([
        rateLimit.reset(sql, accountKey),
        sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`,
    ]);

    delete user.password_hash;
    delete user.is_active;
    const tokens = await issueTokens(env, sql, user);
    return { user, tokens };
}

export async function refresh(env, refreshToken) {
    const sql = getSql(env);
    const tokenHash = await sha256Hex(refreshToken);

    // Rotación atómica: solo una petición puede consumir el token.
    const used = await sql`
        UPDATE refresh_tokens SET revoked_at = NOW()
        WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > NOW()
        RETURNING user_id`;

    if (!used.length) {
        // Detección de reutilización: si alguien presenta un token ya rotado,
        // probablemente fue robado -> se cierran todas las sesiones del usuario.
        const stale = await sql`
            SELECT user_id FROM refresh_tokens
            WHERE token_hash = ${tokenHash}
              AND revoked_at IS NOT NULL
              AND revoked_at < NOW() - make_interval(secs => ${REFRESH_REUSE_GRACE_SECONDS})
            LIMIT 1`;
        if (stale.length) {
            console.warn("[auth] Reutilización de refresh token detectada; revocando sesiones de", stale[0].user_id);
            await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ${stale[0].user_id} AND revoked_at IS NULL`;
        }
        throw new UnauthorizedError("Refresh token inválido o expirado.");
    }

    const users = await sql`SELECT id, role, is_active FROM users WHERE id = ${used[0].user_id} LIMIT 1`;
    const user = users[0];
    if (!user || !user.is_active) throw new UnauthorizedError("La cuenta está desactivada.");

    const tokens = await issueTokens(env, sql, { id: user.id, role: user.role });
    return { tokens };
}

export async function logout(env, refreshToken) {
    const sql = getSql(env);
    const tokenHash = await sha256Hex(refreshToken);
    await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
    return { loggedOut: true };
}

export async function forgotPassword(env, email, { ip } = {}) {
    const sql = getSql(env);
    await rateLimit.consume(sql, `forgot:ip:${ip}`, LIMITS.forgotIp);

    // Límite por correo: si se supera se responde igual que siempre (sin
    // generar token) para no revelar nada ni permitir bombardear el buzón.
    try {
        await rateLimit.consume(sql, `forgot:email:${email}`, LIMITS.forgotEmail);
    } catch (err) {
        if (err?.status === 429) return { requested: true };
        throw err;
    }

    const rows = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) AND is_active = TRUE LIMIT 1`;
    // Respuesta uniforme aunque el correo no exista (evita enumeración de usuarios).
    if (!rows.length) return { requested: true };

    const userId = rows[0].id;
    // Solo un enlace válido a la vez: se invalidan los anteriores.
    await sql`UPDATE password_resets SET used_at = NOW() WHERE user_id = ${userId} AND used_at IS NULL`;

    const resetToken = randomToken();
    await sql`
        INSERT INTO password_resets (user_id, token_hash, expires_at)
        VALUES (${userId}, ${await sha256Hex(resetToken)}, NOW() + INTERVAL '1 hour')`;
    // En producción, aquí se enviaría el email con el enlace. Nunca se devuelve
    // el token en la respuesta salvo que EXPOSE_DEV_TOKENS="true" (solo desarrollo).
    const result = { requested: true };
    if (exposeDevTokens(env)) result.resetToken = resetToken;
    return result;
}

export async function resetPassword(env, { token, newPassword }) {
    const sql = getSql(env);
    const tokenHash = await sha256Hex(token);

    // Consumo atómico: un token solo puede usarse una vez aunque lleguen
    // peticiones simultáneas.
    const rows = await sql`
        UPDATE password_resets SET used_at = NOW()
        WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > NOW()
        RETURNING user_id`;
    if (!rows.length) {
        throw new BadRequestError("El token de restablecimiento es inválido o expiró.");
    }
    const userId = rows[0].user_id;

    const passwordHash = await hashPassword(newPassword);
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
    // Cierra todas las sesiones activas e invalida otros enlaces pendientes.
    await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ${userId} AND revoked_at IS NULL`;
    await sql`UPDATE password_resets SET used_at = NOW() WHERE user_id = ${userId} AND used_at IS NULL`;
    return { reset: true };
}

export async function verifyEmail(env, token) {
    const sql = getSql(env);
    const tokenHash = await sha256Hex(token);
    const rows = await sql`
        SELECT id, user_id, expires_at, verified_at
        FROM email_verifications WHERE token_hash = ${tokenHash} LIMIT 1`;
    const row = rows[0];
    if (!row || new Date(row.expires_at) < new Date()) {
        throw new BadRequestError("El token de verificación es inválido o expiró.");
    }
    if (row.verified_at) return { verified: true, already: true };
    await sql`UPDATE email_verifications SET verified_at = NOW() WHERE id = ${row.id}`;
    await sql`UPDATE users SET is_verified = TRUE WHERE id = ${row.user_id}`;
    return { verified: true };
}
