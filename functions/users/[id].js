// GET /users/:id  -> perfil público de un usuario
import { getSql } from "../database/client.js";
import { is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";

export async function onRequestGet(context) {
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de usuario no es válido.");

    const sql = getSql(context.env);
    const rows = await sql`
        SELECT u.id, u.username, u.display_name, u.bio, u.avatar_url, u.is_verified, u.created_at,
               (SELECT COUNT(*) FROM follows WHERE following_id = u.id)::int AS followers,
               (SELECT COUNT(*) FROM follows WHERE follower_id  = u.id)::int AS following,
               (SELECT COUNT(*) FROM posts WHERE author_id = u.id AND deleted_at IS NULL)::int AS posts
        FROM users u
        WHERE u.id = ${id} AND u.is_active = TRUE
        LIMIT 1`;
    if (!rows.length) throw new NotFoundError("Usuario no encontrado.");
    return success({ user: rows[0] }, { message: "Perfil obtenido." });
}
