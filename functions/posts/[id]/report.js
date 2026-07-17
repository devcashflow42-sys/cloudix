// POST /posts/:id/report  { reason }  -> reportar publicación
import { requireAuth } from "../../middleware/auth.js";
import { getSql } from "../../database/client.js";
import { readJson, is } from "../../utils/validate.js";
import { success } from "../../utils/response.js";
import { BadRequestError } from "../../utils/errors.js";

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id no es válido.");
    const body = await readJson(context.request).catch(() => ({}));
    const sql = getSql(context.env);
    await sql`
        INSERT INTO post_reports (post_id, reporter_id, reason)
        VALUES (${id}, ${user.id}, ${(body.reason || "").slice(0, 300) || null})
        ON CONFLICT (post_id, reporter_id) DO UPDATE SET reason = EXCLUDED.reason`;
    return success({ reported: true }, { message: "Gracias por tu reporte." });
}
