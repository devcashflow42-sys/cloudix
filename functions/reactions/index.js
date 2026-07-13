// POST   /reactions  -> reaccionar (like, love, ...) a un post o comentario
// DELETE /reactions  -> quitar la reacción
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is } from "../utils/validate.js";
import { success } from "../utils/response.js";

const TYPES = ["like", "love", "haha", "wow", "sad", "angry"];
const TARGETS = ["post", "comment"];

async function syncLikeCount(sql, targetType, targetId) {
    if (targetType !== "post") return;
    await sql`
        UPDATE posts SET likes_count =
            (SELECT COUNT(*) FROM reactions WHERE target_type = 'post' AND target_id = ${targetId})
        WHERE id = ${targetId}`;
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({
        targetType: [TARGETS.includes(body.targetType), `targetType debe ser: ${TARGETS.join(", ")}.`],
        targetId: [is.uuid(body.targetId), "targetId debe ser un UUID."],
        type: [TYPES.includes(body.type || "like"), `type debe ser: ${TYPES.join(", ")}.`],
    });
    const type = body.type || "like";
    const sql = getSql(context.env);
    await sql`
        INSERT INTO reactions (user_id, target_type, target_id, type)
        VALUES (${user.id}, ${body.targetType}, ${body.targetId}, ${type})
        ON CONFLICT (user_id, target_type, target_id)
        DO UPDATE SET type = EXCLUDED.type`;
    await syncLikeCount(sql, body.targetType, body.targetId);
    return success({ reacted: true, type }, { message: "Reacción registrada." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({
        targetType: [TARGETS.includes(body.targetType), `targetType debe ser: ${TARGETS.join(", ")}.`],
        targetId: [is.uuid(body.targetId), "targetId debe ser un UUID."],
    });
    const sql = getSql(context.env);
    await sql`
        DELETE FROM reactions
        WHERE user_id = ${user.id} AND target_type = ${body.targetType} AND target_id = ${body.targetId}`;
    await syncLikeCount(sql, body.targetType, body.targetId);
    return success({ reacted: false }, { message: "Reacción eliminada." });
}
