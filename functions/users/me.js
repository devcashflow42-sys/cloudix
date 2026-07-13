// GET  /users/me   -> perfil del usuario autenticado
// PATCH /users/me  -> actualizar perfil
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson } from "../utils/validate.js";
import { success } from "../utils/response.js";

export async function onRequestGet(context) {
    const user = await requireAuth(context);
    return success({ user }, { message: "Perfil obtenido." });
}

export async function onRequestPatch(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    const sql = getSql(context.env);

    // Solo se permiten estos campos; el resto se ignora.
    const displayName = typeof body.displayName === "string" ? body.displayName.slice(0, 100) : user.display_name;
    const bio = typeof body.bio === "string" ? body.bio.slice(0, 500) : null;
    const avatarUrl = typeof body.avatarUrl === "string" ? body.avatarUrl.slice(0, 2000) : null;

    const rows = await sql`
        UPDATE users
        SET display_name = ${displayName},
            bio = COALESCE(${bio}, bio),
            avatar_url = COALESCE(${avatarUrl}, avatar_url),
            updated_at = NOW()
        WHERE id = ${user.id}
        RETURNING id, username, email, display_name, bio, avatar_url, role, is_verified`;
    return success({ user: rows[0] }, { message: "Perfil actualizado." });
}
