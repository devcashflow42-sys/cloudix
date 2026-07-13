// POST   /follows/:id  -> seguir al usuario :id
// DELETE /follows/:id  -> dejar de seguir
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de usuario no es válido.");
    if (id === user.id) throw new BadRequestError("No puedes seguirte a ti mismo.");

    const sql = getSql(context.env);
    const target = await sql`SELECT id FROM users WHERE id = ${id} AND is_active = TRUE LIMIT 1`;
    if (!target.length) throw new NotFoundError("Usuario no encontrado.");

    await sql`
        INSERT INTO follows (follower_id, following_id)
        VALUES (${user.id}, ${id})
        ON CONFLICT (follower_id, following_id) DO NOTHING`;
    return success({ following: true, userId: id }, { message: "Ahora sigues a este usuario." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de usuario no es válido.");

    const sql = getSql(context.env);
    await sql`DELETE FROM follows WHERE follower_id = ${user.id} AND following_id = ${id}`;
    return success({ following: false, userId: id }, { message: "Dejaste de seguir a este usuario." });
}
