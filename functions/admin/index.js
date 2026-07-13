// GET /admin  -> panel de estadísticas (solo rol admin)
import { requireRole } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { success } from "../utils/response.js";

export async function onRequestGet(context) {
    await requireRole(context, "admin");
    const sql = getSql(context.env);

    const rows = await sql`
        SELECT
            (SELECT COUNT(*) FROM users WHERE is_active = TRUE)::int              AS users,
            (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days')::int AS new_users_week,
            (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL)::int            AS posts,
            (SELECT COUNT(*) FROM comments WHERE deleted_at IS NULL)::int         AS comments,
            (SELECT COUNT(*) FROM groups WHERE deleted_at IS NULL)::int           AS groups,
            (SELECT COUNT(*) FROM communities WHERE deleted_at IS NULL)::int      AS communities,
            (SELECT COUNT(*) FROM messages)::int                                  AS messages`;
    return success({ stats: rows[0] }, { message: "Estadísticas del sistema." });
}
