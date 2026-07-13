// Lógica de negocio de autenticación, reutilizable por los endpoints de /auth.
import { getSql } from "../database/client.js";
import { hashPassword, verifyPassword, randomToken, sha256Hex } from "../utils/password.js";
import { signAccessToken } from "../utils/jwt.js";
import {
    ConflictError, UnauthorizedError, BadRequestError,
} from "../utils/errors.js";

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

export async function register(env, { username, email, password, displayName }) {
    const sql = getSql(env);
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
    return { user, tokens, verifyToken };
}

export async function login(env, { identifier, password }) {
    const sql = getSql(env);
    const rows = await sql`
        SELECT id, username, email, display_name, avatar_url, role, is_verified, is_active, password_hash
        FROM users
        WHERE LOWER(email) = LOWER(${identifier}) OR LOWER(username) = LOWER(${identifier})
        LIMIT 1`;
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new UnauthorizedError("Credenciales inválidas.");
    }
    if (!user.is_active) throw new UnauthorizedError("La cuenta está desactivada.");

    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;

    delete user.password_hash;
    delete user.is_active;
    const tokens = await issueTokens(env, sql, user);
    return { user, tokens };
}

export async function refresh(env, refreshToken) {
    const sql = getSql(env);
    const tokenHash = await sha256Hex(refreshToken);
    const rows = await sql`
        SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
               u.id AS uid, u.role, u.is_active
        FROM refresh_tokens rt
        JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = ${tokenHash}
        LIMIT 1`;
    const row = rows[0];
    if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) {
        throw new UnauthorizedError("Refresh token inválido o expirado.");
    }
    if (!row.is_active) throw new UnauthorizedError("La cuenta está desactivada.");

    // Rotación: se revoca el token usado y se emite uno nuevo.
    await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ${row.id}`;
    const tokens = await issueTokens(env, sql, { id: row.user_id, role: row.role });
    return { tokens };
}

export async function logout(env, refreshToken) {
    const sql = getSql(env);
    const tokenHash = await sha256Hex(refreshToken);
    await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
    return { loggedOut: true };
}

export async function forgotPassword(env, email) {
    const sql = getSql(env);
    const rows = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${email}) LIMIT 1`;
    // Respuesta uniforme aunque el correo no exista (evita enumeración de usuarios).
    if (!rows.length) return { requested: true, resetToken: null };

    const resetToken = randomToken();
    await sql`
        INSERT INTO password_resets (user_id, token_hash, expires_at)
        VALUES (${rows[0].id}, ${await sha256Hex(resetToken)}, NOW() + INTERVAL '1 hour')`;
    // En producción, aquí se enviaría el email con el enlace. Se devuelve para pruebas.
    return { requested: true, resetToken };
}

export async function resetPassword(env, { token, newPassword }) {
    const sql = getSql(env);
    const tokenHash = await sha256Hex(token);
    const rows = await sql`
        SELECT id, user_id, expires_at, used_at
        FROM password_resets WHERE token_hash = ${tokenHash} LIMIT 1`;
    const row = rows[0];
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
        throw new BadRequestError("El token de restablecimiento es inválido o expiró.");
    }
    const passwordHash = await hashPassword(newPassword);
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${row.user_id}`;
    await sql`UPDATE password_resets SET used_at = NOW() WHERE id = ${row.id}`;
    // Cierra todas las sesiones activas por seguridad.
    await sql`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ${row.user_id} AND revoked_at IS NULL`;
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
