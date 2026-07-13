// GET /search?q=...&type=all|users|posts  -> búsqueda básica
import { optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { success } from "../utils/response.js";
import { BadRequestError } from "../utils/errors.js";

export async function onRequestGet(context) {
    await optionalAuth(context);
    const url = new URL(context.request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const type = url.searchParams.get("type") || "all";
    if (q.length < 2) throw new BadRequestError("La búsqueda requiere al menos 2 caracteres.");
    const like = `%${q}%`;
    const sql = getSql(context.env);

    const result = {};
    if (type === "all" || type === "users") {
        result.users = await sql`
            SELECT id, username, display_name, avatar_url, is_verified
            FROM users
            WHERE is_active = TRUE AND (username ILIKE ${like} OR display_name ILIKE ${like})
            ORDER BY is_verified DESC, username ASC
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
