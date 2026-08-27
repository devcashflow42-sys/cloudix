// GET /users/suggestions -> "A quién seguir": usuarios activos que el
// usuario autenticado aún no sigue (excluyéndose a sí mismo), ordenados
// por número de seguidores y novedad. Endpoint aditivo para el panel
// derecho del escritorio; si no hay sesión devuelve una lista vacía.
import { optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { success } from "../utils/response.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context);
    const meId = me ? me.id : null;
    if (!meId) return success({ users: [] }, { message: "Sin sesión." });

    const url = new URL(context.request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "6", 10) || 6, 1), 12);

    const sql = getSql(context.env);
    const users = await sql`
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified,
               (SELECT COUNT(*) FROM follows f2 WHERE f2.following_id = u.id)::int AS followers
        FROM users u
        WHERE u.is_active = TRUE
          AND u.id <> ${meId}::uuid
          AND NOT EXISTS (
              SELECT 1 FROM follows f
              WHERE f.follower_id = ${meId}::uuid AND f.following_id = u.id
          )
        ORDER BY followers DESC, u.created_at DESC
        LIMIT ${limit}`;
    return success({ users }, { message: "Sugerencias obtenidas." });
}
