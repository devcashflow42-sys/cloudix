// POST /posts/:id/vote  { optionId }  -> votar en la encuesta
import { requireAuth } from "../../middleware/auth.js";
import { getSql } from "../../database/client.js";
import { readJson, is } from "../../utils/validate.js";
import { success } from "../../utils/response.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id no es válido.");
    const body = await readJson(context.request);
    const optionId = String(body.optionId || "");
    if (!optionId) throw new BadRequestError("Falta optionId.");

    const sql = getSql(context.env);
    const rows = await sql`SELECT poll FROM posts WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length || !rows[0].poll) throw new NotFoundError("Esta publicación no tiene encuesta.");
    const valid = (rows[0].poll.options || []).some((o) => o.id === optionId);
    if (!valid) throw new BadRequestError("Opción inválida.");

    await sql`
        INSERT INTO poll_votes (post_id, user_id, option_id)
        VALUES (${id}, ${user.id}, ${optionId})
        ON CONFLICT (post_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id`;

    const counts = await sql`
        SELECT COALESCE(jsonb_object_agg(option_id, cnt), '{}'::jsonb) AS counts
        FROM (SELECT option_id, COUNT(*)::int AS cnt FROM poll_votes WHERE post_id = ${id} GROUP BY option_id) t`;
    return success({ voted: optionId, counts: counts[0].counts }, { message: "Voto registrado." });
}
