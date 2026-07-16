// GET  /messages?withUserId=...  -> conversación 1:1 con otro usuario
// POST /messages                 -> enviar mensaje directo
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is, parsePagination, paginationMeta } from "../utils/validate.js";
import { created, paginated } from "../utils/response.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../utils/errors.js";

export async function onRequestGet(context) {
    const user = await requireAuth(context);
    const url = new URL(context.request.url);
    const other = url.searchParams.get("withUserId");
    if (!is.uuid(other)) throw new BadRequestError("withUserId es requerido y debe ser un UUID.");
    const { page, limit, offset } = parsePagination(url);
    const sql = getSql(context.env);

    const totalRows = await sql`
        SELECT COUNT(*)::int AS total FROM messages
        WHERE (sender_id = ${user.id} AND recipient_id = ${other})
           OR (sender_id = ${other} AND recipient_id = ${user.id})`;
    const rows = await sql`
        SELECT id, sender_id, recipient_id, content, read_at, created_at
        FROM messages
        WHERE (sender_id = ${user.id} AND recipient_id = ${other})
           OR (sender_id = ${other} AND recipient_id = ${user.id})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`;

    // Marca como leídos los mensajes recibidos de ese usuario.
    await sql`
        UPDATE messages SET read_at = NOW()
        WHERE recipient_id = ${user.id} AND sender_id = ${other} AND read_at IS NULL`;

    return paginated(rows, paginationMeta(page, limit, totalRows[0].total), "Conversación obtenida.");
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({
        recipientId: [is.uuid(body.recipientId), "recipientId debe ser un UUID."],
        content: [is.nonEmptyString(body.content), "El mensaje no puede estar vacío."],
    });
    if (body.recipientId === user.id) throw new BadRequestError("No puedes enviarte mensajes a ti mismo.");
    const sql = getSql(context.env);

    const target = await sql`SELECT id FROM users WHERE id = ${body.recipientId} AND is_active = TRUE LIMIT 1`;
    if (!target.length) throw new NotFoundError("Destinatario no encontrado.");

    // Regla social: solo puedes enviar mensajes a personas que sigues.
    const follows = await sql`
        SELECT 1 FROM follows
        WHERE follower_id = ${user.id} AND following_id = ${body.recipientId} LIMIT 1`;
    if (!follows.length) {
        throw new ForbiddenError("Solo puedes enviar mensajes a personas que sigues.");
    }

    const rows = await sql`
        INSERT INTO messages (sender_id, recipient_id, content)
        VALUES (${user.id}, ${body.recipientId}, ${body.content.slice(0, 4000)})
        RETURNING id, sender_id, recipient_id, content, read_at, created_at`;

    // Notificación al destinatario.
    await sql`
        INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id)
        VALUES (${body.recipientId}, ${user.id}, 'message', 'message', ${rows[0].id})`;

    return created({ message: rows[0] }, "Mensaje enviado.");
}
