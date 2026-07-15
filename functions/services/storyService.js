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

export async function listActive(env, { limit = 100 } = {}) {
    const sql = getSql(env);
    return sql`
        SELECT s.id, s.author_id, s.media_url, s.media_type, s.caption,
               s.created_at, s.expires_at,
               GREATEST(EXTRACT(EPOCH FROM (s.expires_at - NOW()))::int, 0) AS seconds_remaining,
               u.username, u.display_name, u.avatar_url
        FROM stories s
        JOIN users u ON u.id = s.author_id
        WHERE s.expires_at > NOW()
        ORDER BY s.created_at DESC
        LIMIT ${limit}`;
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
