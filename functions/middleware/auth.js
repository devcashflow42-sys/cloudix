// Middleware de autenticación para las funciones edge.
import { verifyAccessToken } from "../utils/jwt.js";
import { getSql } from "../database/client.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";

function extractBearer(request) {
    const header = request.headers.get("Authorization") || "";
    const [scheme, token] = header.split(" ");
    if (!token || scheme.toLowerCase() !== "bearer") return null;
    return token;
}

/**
 * Exige un access token válido. Devuelve el usuario (fila de `users`).
 * Lanza UnauthorizedError si falta/expira el token o el usuario no existe.
 */
export async function requireAuth(context) {
    const { request, env } = context;
    const token = extractBearer(request);
    if (!token) throw new UnauthorizedError("Falta el token de acceso.");

    let payload;
    try {
        payload = await verifyAccessToken(env, token);
    } catch (err) {
        if (err?.code === "ERR_JWT_EXPIRED") throw new UnauthorizedError("El token ha expirado.");
        throw new UnauthorizedError("Token inválido.");
    }

    const sql = getSql(env);
    const rows = await sql`
        SELECT id, username, email, display_name, avatar_url, role, is_active, is_verified
        FROM users WHERE id = ${payload.sub} LIMIT 1`;
    const user = rows[0];
    if (!user) throw new UnauthorizedError("El usuario no existe.");
    if (!user.is_active) throw new UnauthorizedError("La cuenta está desactivada.");

    return user;
}

/**
 * Autenticación opcional: devuelve el usuario o null (sin lanzar).
 */
export async function optionalAuth(context) {
    try {
        return await requireAuth(context);
    } catch {
        return null;
    }
}

/**
 * Exige que el usuario tenga uno de los roles indicados.
 */
export async function requireRole(context, ...roles) {
    const user = await requireAuth(context);
    if (!roles.includes(user.role)) {
        throw new ForbiddenError("No tienes permisos para este recurso.");
    }
    return user;
}
