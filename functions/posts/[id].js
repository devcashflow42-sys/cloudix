// PATCH  /posts/:id  { content }  -> editar (autor)
// DELETE /posts/:id                -> eliminar (autor)
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import { BadRequestError, NotFoundError, ForbiddenError } from "../utils/errors.js";

async function ownedPost(sql, id, userId) {
    const rows = await sql`SELECT author_id FROM posts WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length) throw new NotFoundError("Publicación no encontrada.");
    if (rows[0].author_id !== userId) throw new ForbiddenError("No puedes modificar esta publicación.");
}

export async function onRequestPatch(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id no es válido.");
    const body = await readJson(context.request);
    if (!is.nonEmptyString(body.content)) throw new BadRequestError("El contenido no puede estar vacío.");
    const sql = getSql(context.env);
    await ownedPost(sql, id, user.id);
    const rows = await sql`
        UPDATE posts SET content = ${body.content.slice(0, 5000)}, updated_at = NOW()
        WHERE id = ${id} RETURNING id, content, updated_at`;
    return success({ post: rows[0] }, { message: "Publicación actualizada." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id no es válido.");
    const sql = getSql(context.env);
    await ownedPost(sql, id, user.id);
    await sql`UPDATE posts SET deleted_at = NOW() WHERE id = ${id}`;
    return success({ deleted: true }, { message: "Publicación eliminada." });
}
