// GET   /notifications          -> notificaciones del usuario (auth)
// PATCH /notifications          -> marcar como leídas (todas o por ids)
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, parsePagination, paginationMeta } from "../utils/validate.js";
import { paginated, success } from "../utils/response.js";

export async function onRequestGet(context) {
    const user = await requireAuth(context);
    const url = new URL(context.request.url);
    const { page, limit, offset } = parsePagination(url);
    const unreadOnly = url.searchParams.get("unread") === "true";
    const sql = getSql(context.env);

    const totalRows = unreadOnly
        ? await sql`SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_id = ${user.id} AND read_at IS NULL`
        : await sql`SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_id = ${user.id}`;
    const rows = unreadOnly
        ? await sql`
            SELECT id, actor_id, type, entity_type, entity_id, data, read_at, created_at
            FROM notifications WHERE recipient_id = ${user.id} AND read_at IS NULL
            ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`
            SELECT id, actor_id, type, entity_type, entity_id, data, read_at, created_at
            FROM notifications WHERE recipient_id = ${user.id}
            ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return paginated(rows, paginationMeta(page, limit, totalRows[0].total), "Notificaciones obtenidas.");
}

export async function onRequestPatch(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request).catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : null;
    const sql = getSql(context.env);

    const rows = ids && ids.length
        ? await sql`
            UPDATE notifications SET read_at = NOW()
            WHERE recipient_id = ${user.id} AND read_at IS NULL AND id = ANY(${ids}::uuid[])
            RETURNING id`
        : await sql`
            UPDATE notifications SET read_at = NOW()
            WHERE recipient_id = ${user.id} AND read_at IS NULL
            RETURNING id`;
    return success({ updated: rows.length }, { message: "Notificaciones marcadas como leídas." });
}
