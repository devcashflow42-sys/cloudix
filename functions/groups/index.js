// GET  /groups  -> listar/buscar grupos
// POST /groups  -> crear grupo (requiere auth); el creador queda como owner
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is, parsePagination, paginationMeta } from "../utils/validate.js";
import { created, paginated } from "../utils/response.js";
import { slugify } from "../utils/slug.js";

export async function onRequestGet(context) {
    await optionalAuth(context);
    const url = new URL(context.request.url);
    const { page, limit, offset } = parsePagination(url);
    const search = (url.searchParams.get("search") || "").trim();
    const sql = getSql(context.env);

    const like = `%${search}%`;
    const totalRows = search
        ? await sql`SELECT COUNT(*)::int AS total FROM groups WHERE deleted_at IS NULL AND name ILIKE ${like}`
        : await sql`SELECT COUNT(*)::int AS total FROM groups WHERE deleted_at IS NULL`;
    const rows = search
        ? await sql`
            SELECT id, owner_id, name, slug, description, privacy, members_count, created_at
            FROM groups WHERE deleted_at IS NULL AND name ILIKE ${like}
            ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`
            SELECT id, owner_id, name, slug, description, privacy, members_count, created_at
            FROM groups WHERE deleted_at IS NULL
            ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return paginated(rows, paginationMeta(page, limit, totalRows[0].total), "Grupos obtenidos.");
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({ name: [is.nonEmptyString(body.name), "El nombre del grupo es requerido."] });
    const privacy = ["public", "private", "invite_only"].includes(body.privacy) ? body.privacy : "public";
    const sql = getSql(context.env);

    const rows = await sql`
        INSERT INTO groups (owner_id, name, slug, description, privacy, members_count)
        VALUES (${user.id}, ${body.name}, ${slugify(body.name)}, ${body.description || null}, ${privacy}, 1)
        RETURNING id, owner_id, name, slug, description, privacy, members_count, created_at`;
    const group = rows[0];
    await sql`
        INSERT INTO group_members (group_id, user_id, role)
        VALUES (${group.id}, ${user.id}, 'owner')`;
    return created({ group }, "Grupo creado.");
}
