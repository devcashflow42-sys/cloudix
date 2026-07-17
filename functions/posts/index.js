// GET  /posts  -> feed público paginado
// POST /posts  -> crear publicación (requiere auth)
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is, parsePagination, paginationMeta } from "../utils/validate.js";
import { created, paginated } from "../utils/response.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context); // el feed es público; si hay sesión marcamos "liked"
    const meId = me ? me.id : null;
    const url = new URL(context.request.url);
    const { page, limit, offset } = parsePagination(url);
    const sql = getSql(context.env);

    const totalRows = await sql`SELECT COUNT(*)::int AS total FROM posts WHERE deleted_at IS NULL AND visibility = 'public'`;
    const rows = await sql`
        SELECT p.id, p.content, p.media, p.visibility, p.likes_count, p.comments_count, p.created_at,
               u.id AS author_id, u.username, u.display_name, u.avatar_url,
               CASE WHEN ${meId}::uuid IS NULL THEN FALSE
                    ELSE EXISTS (SELECT 1 FROM reactions r
                                 WHERE r.target_type = 'post' AND r.target_id = p.id AND r.user_id = ${meId}::uuid)
               END AS liked
        FROM posts p
        JOIN users u ON u.id = p.author_id
        WHERE p.deleted_at IS NULL AND p.visibility = 'public'
        ORDER BY p.created_at DESC
        LIMIT ${limit} OFFSET ${offset}`;
    return paginated(rows, paginationMeta(page, limit, totalRows[0].total), "Feed obtenido.");
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({
        content: [is.nonEmptyString(body.content) || Array.isArray(body.media), "La publicación necesita texto o multimedia."],
    });
    const visibility = ["public", "followers", "private"].includes(body.visibility) ? body.visibility : "public";
    const media = Array.isArray(body.media) ? JSON.stringify(body.media.slice(0, 10)) : "[]";

    const sql = getSql(context.env);
    const rows = await sql`
        INSERT INTO posts (author_id, content, media, visibility)
        VALUES (${user.id}, ${body.content || null}, ${media}::jsonb, ${visibility})
        RETURNING id, author_id, content, media, visibility, likes_count, comments_count, created_at`;
    return created({ post: rows[0] }, "Publicación creada.");
}
