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

    // ?saved=true -> guardadas ; ?mine=true -> mis publicaciones (perfil)
    const savedOnly = url.searchParams.get("saved") === "true";
    const mineOnly = url.searchParams.get("mine") === "true";
    if ((savedOnly || mineOnly) && !meId) return paginated([], paginationMeta(1, limit, 0), "Sin sesión.");

    let totalRows, rows;
    if (mineOnly) {
        totalRows = await sql`SELECT COUNT(*)::int AS total FROM posts WHERE deleted_at IS NULL AND author_id = ${meId}::uuid`;
        rows = await sql`
            SELECT p.id, p.content, p.media, p.poll, p.visibility, p.likes_count, p.comments_count, p.created_at,
                   u.id AS author_id, u.username, u.display_name, u.avatar_url,
                   EXISTS (SELECT 1 FROM reactions r WHERE r.target_type = 'post' AND r.target_id = p.id AND r.user_id = ${meId}::uuid) AS liked,
                   EXISTS (SELECT 1 FROM post_saves ps WHERE ps.post_id = p.id AND ps.user_id = ${meId}::uuid) AS saved,
                   (SELECT COALESCE(jsonb_object_agg(option_id, cnt), '{}'::jsonb)
                    FROM (SELECT option_id, COUNT(*)::int AS cnt FROM poll_votes WHERE post_id = p.id GROUP BY option_id) t) AS poll_counts,
                   (SELECT pv.option_id FROM poll_votes pv WHERE pv.post_id = p.id AND pv.user_id = ${meId}::uuid LIMIT 1) AS my_vote
            FROM posts p
            JOIN users u ON u.id = p.author_id
            WHERE p.deleted_at IS NULL AND p.author_id = ${meId}::uuid
            ORDER BY p.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`;
    } else if (savedOnly) {
        totalRows = await sql`
            SELECT COUNT(*)::int AS total FROM post_saves ps
            JOIN posts p ON p.id = ps.post_id
            WHERE ps.user_id = ${meId}::uuid AND p.deleted_at IS NULL`;
        rows = await sql`
            SELECT p.id, p.content, p.media, p.poll, p.visibility, p.likes_count, p.comments_count, p.created_at,
                   u.id AS author_id, u.username, u.display_name, u.avatar_url,
                   EXISTS (SELECT 1 FROM reactions r WHERE r.target_type = 'post' AND r.target_id = p.id AND r.user_id = ${meId}::uuid) AS liked,
                   TRUE AS saved,
                   (SELECT COALESCE(jsonb_object_agg(option_id, cnt), '{}'::jsonb)
                    FROM (SELECT option_id, COUNT(*)::int AS cnt FROM poll_votes WHERE post_id = p.id GROUP BY option_id) t) AS poll_counts,
                   (SELECT pv.option_id FROM poll_votes pv WHERE pv.post_id = p.id AND pv.user_id = ${meId}::uuid LIMIT 1) AS my_vote
            FROM posts p
            JOIN users u ON u.id = p.author_id
            JOIN post_saves ps2 ON ps2.post_id = p.id AND ps2.user_id = ${meId}::uuid
            WHERE p.deleted_at IS NULL
            ORDER BY ps2.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`;
    } else {
        totalRows = await sql`SELECT COUNT(*)::int AS total FROM posts WHERE deleted_at IS NULL AND visibility = 'public'`;
        rows = await sql`
            SELECT p.id, p.content, p.media, p.poll, p.visibility, p.likes_count, p.comments_count, p.created_at,
                   u.id AS author_id, u.username, u.display_name, u.avatar_url,
                   CASE WHEN ${meId}::uuid IS NULL THEN FALSE
                        ELSE EXISTS (SELECT 1 FROM reactions r WHERE r.target_type = 'post' AND r.target_id = p.id AND r.user_id = ${meId}::uuid) END AS liked,
                   CASE WHEN ${meId}::uuid IS NULL THEN FALSE
                        ELSE EXISTS (SELECT 1 FROM post_saves ps WHERE ps.post_id = p.id AND ps.user_id = ${meId}::uuid) END AS saved,
                   (SELECT COALESCE(jsonb_object_agg(option_id, cnt), '{}'::jsonb)
                    FROM (SELECT option_id, COUNT(*)::int AS cnt FROM poll_votes WHERE post_id = p.id GROUP BY option_id) t) AS poll_counts,
                   (SELECT pv.option_id FROM poll_votes pv WHERE pv.post_id = p.id AND pv.user_id = ${meId}::uuid LIMIT 1) AS my_vote
            FROM posts p
            JOIN users u ON u.id = p.author_id
            WHERE p.deleted_at IS NULL AND p.visibility = 'public'
            ORDER BY p.created_at DESC
            LIMIT ${limit} OFFSET ${offset}`;
    }
    return paginated(rows, paginationMeta(page, limit, totalRows[0].total), "Feed obtenido.");
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);

    // Encuesta: { question, options: ["a","b",...] } -> se añaden ids estables o0,o1...
    let poll = null;
    if (body.poll && Array.isArray(body.poll.options)) {
        const options = body.poll.options
            .map((t) => String(t || "").trim()).filter(Boolean).slice(0, 6)
            .map((text, i) => ({ id: "o" + i, text }));
        if (options.length >= 2) poll = { question: String(body.poll.question || "").slice(0, 300), options };
    }

    const hasMedia = Array.isArray(body.media) && body.media.length > 0;
    assert({
        content: [is.nonEmptyString(body.content) || hasMedia || !!poll, "La publicación necesita texto, multimedia o encuesta."],
    });
    const visibility = ["public", "followers", "private"].includes(body.visibility) ? body.visibility : "public";
    const media = Array.isArray(body.media) ? JSON.stringify(body.media.slice(0, 10)) : "[]";

    const sql = getSql(context.env);
    const rows = await sql`
        INSERT INTO posts (author_id, content, media, poll, visibility)
        VALUES (${user.id}, ${body.content || null}, ${media}::jsonb, ${poll ? JSON.stringify(poll) : null}, ${visibility})
        RETURNING id, author_id, content, media, poll, visibility, likes_count, comments_count, created_at`;
    return created({ post: rows[0] }, "Publicación creada.");
}
