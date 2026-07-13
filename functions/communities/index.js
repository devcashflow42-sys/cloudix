// GET  /communities  -> listar/buscar comunidades
// POST /communities  -> crear comunidad (requiere auth); el creador queda como founder
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is, parsePagination, paginationMeta } from "../utils/validate.js";
import { created, paginated } from "../utils/response.js";
import { slugify } from "../utils/slug.js";

export async function onRequestGet(context) {
    await optionalAuth(context);
    const url = new URL(context.request.url);
    const { page, limit, offset } = parsePagination(url);
    const sql = getSql(context.env);

    const totalRows = await sql`SELECT COUNT(*)::int AS total FROM communities WHERE deleted_at IS NULL`;
    const rows = await sql`
        SELECT id, founder_id, name, slug, description, privacy, members_count, created_at
        FROM communities WHERE deleted_at IS NULL
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return paginated(rows, paginationMeta(page, limit, totalRows[0].total), "Comunidades obtenidas.");
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({ name: [is.nonEmptyString(body.name), "El nombre de la comunidad es requerido."] });
    const privacy = ["public", "private", "invite_only"].includes(body.privacy) ? body.privacy : "public";
    const sql = getSql(context.env);

    const rows = await sql`
        INSERT INTO communities (founder_id, name, slug, description, privacy, members_count)
        VALUES (${user.id}, ${body.name}, ${slugify(body.name)}, ${body.description || null}, ${privacy}, 1)
        RETURNING id, founder_id, name, slug, description, privacy, members_count, created_at`;
    const community = rows[0];
    await sql`
        INSERT INTO community_members (community_id, user_id, role)
        VALUES (${community.id}, ${user.id}, 'founder')`;
    return created({ community }, "Comunidad creada.");
}
