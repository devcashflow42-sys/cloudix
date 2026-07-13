// GET  /stories  -> historias activas (no expiradas)
// POST /stories  -> crear una historia (expira en 24h)
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is } from "../utils/validate.js";
import { created, success } from "../utils/response.js";

const MEDIA_TYPES = ["image", "video"];

export async function onRequestGet(context) {
    await optionalAuth(context);
    const sql = getSql(context.env);
    const rows = await sql`
        SELECT s.id, s.media_url, s.media_type, s.caption, s.created_at, s.expires_at,
               u.id AS author_id, u.username, u.display_name, u.avatar_url
        FROM stories s
        JOIN users u ON u.id = s.author_id
        WHERE s.expires_at > NOW()
        ORDER BY s.created_at DESC
        LIMIT 100`;
    return success({ stories: rows }, { message: "Historias activas." });
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({
        mediaUrl: [is.nonEmptyString(body.mediaUrl), "mediaUrl es requerido."],
        mediaType: [MEDIA_TYPES.includes(body.mediaType), `mediaType debe ser: ${MEDIA_TYPES.join(", ")}.`],
    });
    const sql = getSql(context.env);
    const rows = await sql`
        INSERT INTO stories (author_id, media_url, media_type, caption, expires_at)
        VALUES (${user.id}, ${body.mediaUrl}, ${body.mediaType}, ${body.caption || null}, NOW() + INTERVAL '24 hours')
        RETURNING id, author_id, media_url, media_type, caption, created_at, expires_at`;
    return created({ story: rows[0] }, "Historia publicada.");
}
