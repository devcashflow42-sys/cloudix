// GET  /users/me   -> perfil del usuario autenticado
// PATCH /users/me  -> actualizar perfil
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson } from "../utils/validate.js";
import { success } from "../utils/response.js";

export async function onRequestGet(context) {
    const auth = await requireAuth(context);
    const sql = getSql(context.env);
    // Perfil completo (con bio) + contadores de publicaciones/seguidores/seguidos.
    const rows = await sql`
        SELECT u.id, u.username, u.email, u.display_name, u.bio, u.avatar_url,
               u.role, u.is_verified, u.created_at,
               (SELECT COUNT(*) FROM posts   WHERE author_id  = u.id AND deleted_at IS NULL)::int AS posts,
               (SELECT COUNT(*) FROM follows WHERE following_id = u.id)::int AS followers,
               (SELECT COUNT(*) FROM follows WHERE follower_id  = u.id)::int AS following
        FROM users u
        WHERE u.id = ${auth.id}
        LIMIT 1`;
    return success({ user: rows[0] || auth }, { message: "Perfil obtenido." });
}

export async function onRequestPatch(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    const sql = getSql(context.env);

    // Solo se permiten estos campos; el resto se ignora.
    const displayName = typeof body.displayName === "string" ? body.displayName.slice(0, 100) : user.display_name;
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 500) : null;
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.slice(0, 2000) : null;

    const rows = await sql`
        UPDATE users
        SET display_name = ${displayName},
            bio = COALESCE(${bio}, bio),
            avatar_url = COALESCE(${avatarUrl}, avatar_url),
            updated_at = NOW()
        WHERE id = ${user.id}
        RETURNING id, username, email, display_name, bio, avatar_url, role, is_verified`;
    return success({ user: rows[0] }, { message: "Perfil actualizado." });
}
