// Lógica de Historias/Estados con expiración automática a las 24 horas.
//
// Reglas:
//  - created_at = momento de publicación; expires_at = created_at + 24h.
//  - Una historia solo es visible mientras expires_at > NOW() (filtro en la
//    consulta), así que "desaparece" en el instante exacto de expirar aunque
//    aún no se haya borrado físicamente.
//  - La eliminación física la hace cleanupExpired() (tarea programada) y una
//    purga oportunista acotada al crear, para no depender del cron.
import { getSql } from "../database/client.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../utils/errors.js";

export const STORY_TTL_HOURS = 24;
export const MEDIA_TYPES = ["image", "video"];

// Purga acotada de historias vencidas (no bloquea; borra como mucho `limit`).
async function purge(sql, limit = 500) {
    const rows = await sql`
        DELETE FROM stories
        WHERE id IN (SELECT id FROM stories WHERE expires_at <= NOW() LIMIT ${limit})
        RETURNING id`;
    return rows.length;
}

export async function create(env, authorId, input) {
    if (typeof input.mediaUrl !== "string" || !input.mediaUrl.trim()) {
        throw new BadRequestError("mediaUrl es requerido.");
    }
    if (!MEDIA_TYPES.includes(input.mediaType)) {
        throw new BadRequestError(`mediaType debe ser: ${MEDIA_TYPES.join(", ")}.`);
    }
    const sql = getSql(env);
    // Ambos NOW() dentro de la misma sentencia devuelven el MISMO instante,
    // por lo que expires_at = created_at + 24h de forma exacta.
    const rows = await sql`
        INSERT INTO stories (author_id, media_url, media_type, caption, created_at, expires_at)
        VALUES (${authorId}, ${input.mediaUrl.trim()}, ${input.mediaType},
                ${input.caption ? String(input.caption).slice(0, 300) : null},
                NOW(), NOW() + INTERVAL '24 hours')
        RETURNING id, author_id, media_url, media_type, caption, created_at, expires_at,
                  GREATEST(EXTRACT(EPOCH FROM (expires_at - NOW()))::int, 0) AS seconds_remaining`;

    // Mantiene la tabla limpia aunque no haya cron configurado.
    await purge(sql, 200);
    return rows[0];
}

export async function listActive(env, { limit = 200, meId = null } = {}) {
    const sql = getSql(env);
    // Devuelve las historias activas con contadores de vistas/reacciones y, si
    // hay sesión, si YO ya la vi, mi reacción y si sigo al autor.
    // Orden ascendente por autor para reproducirlas en secuencia.
    return sql`
        SELECT s.id, s.author_id, s.media_url, s.media_type, s.caption,
               s.created_at, s.expires_at,
               GREATEST(EXTRACT(EPOCH FROM (s.expires_at - NOW()))::int, 0) AS seconds_remaining,
               u.username, u.display_name, u.avatar_url,
               (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id)::int AS views_count,
               (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id AND v.reaction IS NOT NULL)::int AS reactions_count,
               CASE WHEN ${meId}::uuid IS NULL THEN FALSE
                    ELSE EXISTS (SELECT 1 FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = ${meId}::uuid)
               END AS viewed,
               (SELECT v.reaction FROM story_views v WHERE v.story_id = s.id AND v.viewer_id = ${meId}::uuid) AS my_reaction,
               CASE WHEN ${meId}::uuid IS NULL THEN FALSE
                    WHEN s.author_id = ${meId}::uuid THEN TRUE
                    ELSE EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ${meId}::uuid AND f.following_id = s.author_id)
               END AS author_following
        FROM stories s
        JOIN users u ON u.id = s.author_id
        WHERE s.expires_at > NOW()
        ORDER BY (s.author_id = ${meId}::uuid) DESC, s.author_id, s.created_at ASC
        LIMIT ${limit}`;
}

// Registra una vista (idempotente; conserva la reacción si ya existía).
export async function registerView(env, storyId, viewerId) {
    const sql = getSql(env);
    const st = await sql`SELECT author_id FROM stories WHERE id = ${storyId} AND expires_at > NOW() LIMIT 1`;
    if (!st.length) throw new NotFoundError("Historia no encontrada o expirada.");
    if (st[0].author_id === viewerId) return { viewed: true, own: true }; // no cuentes tus propias vistas
    await sql`
        INSERT INTO story_views (story_id, viewer_id)
        VALUES (${storyId}, ${viewerId})
        ON CONFLICT (story_id, viewer_id) DO NOTHING`;
    return { viewed: true };
}

// Reacciona a una historia (like/love). Reaccionar también cuenta como vista.
export async function setReaction(env, storyId, viewerId, reaction) {
    if (!["like", "love"].includes(reaction)) throw new BadRequestError("La reacción debe ser 'like' o 'love'.");
    const sql = getSql(env);
    const st = await sql`SELECT id FROM stories WHERE id = ${storyId} AND expires_at > NOW() LIMIT 1`;
    if (!st.length) throw new NotFoundError("Historia no encontrada o expirada.");
    await sql`
        INSERT INTO story_views (story_id, viewer_id, reaction)
        VALUES (${storyId}, ${viewerId}, ${reaction})
        ON CONFLICT (story_id, viewer_id) DO UPDATE SET reaction = EXCLUDED.reaction`;
    return { reacted: true, reaction };
}

export async function removeReaction(env, storyId, viewerId) {
    const sql = getSql(env);
    await sql`UPDATE story_views SET reaction = NULL WHERE story_id = ${storyId} AND viewer_id = ${viewerId}`;
    return { reacted: false };
}

// Lista de quién vio la historia (solo el dueño). Incluye su reacción.
export async function getViewers(env, storyId, ownerId) {
    const sql = getSql(env);
    const st = await sql`SELECT author_id FROM stories WHERE id = ${storyId} LIMIT 1`;
    if (!st.length) throw new NotFoundError("Historia no encontrada.");
    if (st[0].author_id !== ownerId) throw new ForbiddenError("Solo puedes ver quién vio tu propia historia.");
    const viewers = await sql`
        SELECT u.id, u.username, u.display_name, u.avatar_url, v.reaction, v.created_at
        FROM story_views v
        JOIN users u ON u.id = v.viewer_id
        WHERE v.story_id = ${storyId}
        ORDER BY v.created_at DESC`;
    const counts = await sql`
        SELECT COUNT(*)::int AS views,
               COUNT(*) FILTER (WHERE reaction IS NOT NULL)::int AS reactions
        FROM story_views WHERE story_id = ${storyId}`;
    return { viewers, views: counts[0].views, reactions: counts[0].reactions };
}

export async function listByAuthor(env, authorId, { limit = 50 } = {}) {
    const sql = getSql(env);
    return sql`
        SELECT id, media_url, media_type, caption, created_at, expires_at,
               GREATEST(EXTRACT(EPOCH FROM (expires_at - NOW()))::int, 0) AS seconds_remaining
        FROM stories
        WHERE author_id = ${authorId} AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT ${limit}`;
}

export async function deleteOwn(env, userId, id) {
    const sql = getSql(env);
    const rows = await sql`SELECT author_id FROM stories WHERE id = ${id} LIMIT 1`;
    if (!rows.length) throw new NotFoundError("Historia no encontrada.");
    if (rows[0].author_id !== userId) throw new ForbiddenError("No puedes eliminar esta historia.");
    await sql`DELETE FROM stories WHERE id = ${id}`;
    return { deleted: true, id };
}

// Tarea programada: elimina físicamente las historias vencidas.
export async function cleanupExpired(env, limit = 1000) {
    const sql = getSql(env);
    const deleted = await purge(sql, limit);
    return { deleted };
}
