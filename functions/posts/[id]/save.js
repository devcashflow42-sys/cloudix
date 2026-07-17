// POST   /posts/:id/save  -> guardar publicación
// DELETE /posts/:id/save  -> quitar de guardados
import { requireAuth } from "../../middleware/auth.js";
import { getSql } from "../../database/client.js";
import { is } from "../../utils/validate.js";
import { success } from "../../utils/response.js";
import { BadRequestError } from "../../utils/errors.js";

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id no es válido.");
    const sql = getSql(context.env);
    await sql`INSERT INTO post_saves (user_id, post_id) VALUES (${user.id}, ${id}) ON CONFLICT DO NOTHING`;
    return success({ saved: true }, { message: "Guardado." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id no es válido.");
    const sql = getSql(context.env);
    await sql`DELETE FROM post_saves WHERE user_id = ${user.id} AND post_id = ${id}`;
    return success({ saved: false }, { message: "Quitado de guardados." });
}
