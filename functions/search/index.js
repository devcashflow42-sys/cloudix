// GET /search?q=...&type=all|users|posts  -> búsqueda básica
import { optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { success } from "../utils/response.js";
import { BadRequestError } from "../utils/errors.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context);
    const meId = me ? me.id : null;
    const url = new URL(context.request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const type = url.searchParams.get("type") || "all";
    if (q.length < 2) throw new BadRequestError("La búsqueda requiere al menos 2 caracteres.");
    const like = `%${q}%`;
    const sql = getSql(context.env);

    const result = {};
    if (type === "all" || type === "users") {
        // is_following indica si el usuario autenticado ya sigue a cada resultado.
        // También se excluye a uno mismo de los resultados.
        result.users = await sql`
            SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_verified,
                   CASE WHEN ${meId}::uuid IS NULL THEN FALSE
                        ELSE EXISTS (SELECT 1 FROM follows f
                                     WHERE f.follower_id = ${meId}::uuid AND f.following_id = u.id)
                   END AS is_following
            FROM users u
            WHERE u.is_active = TRUE
              AND (${meId}::uuid IS NULL OR u.id <> ${meId}::uuid)
              AND (u.username ILIKE ${like} OR u.display_name ILIKE ${like})
            ORDER BY u.is_verified DESC, u.username ASC
            LIMIT 20`;
    }
    if (type === "all" || type === "posts") {
        result.posts = await sql`
            SELECT p.id, p.content, p.likes_count, p.comments_count, p.created_at,
                   u.username, u.display_name, u.avatar_url
            FROM posts p
            JOIN users u ON u.id = p.author_id
            WHERE p.deleted_at IS NULL AND p.visibility = 'public' AND p.content ILIKE ${like}
            ORDER BY p.created_at DESC
            LIMIT 20`;
    }
    return success(result, { message: "Resultados de búsqueda." });
}
