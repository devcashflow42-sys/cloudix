// GET  /groups  -> listar/buscar grupos
// POST /groups  -> crear grupo (requiere auth); el creador queda como owner
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is, parsePagination, paginationMeta } from "../utils/validate.js";
import { created, paginated, success } from "../utils/response.js";
import { slugify } from "../utils/slug.js";
import * as groupService from "../services/groupService.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context);
    const url = new URL(context.request.url);

    // ?mine=true -> grupos a los que pertenezco (con mi rol e icono)
    if (url.searchParams.get("mine") === "true") {
        if (!me) return success({ groups: [] }, { message: "Sin sesión." });
        const groups = await groupService.listMine(context.env, me.id);
        return success({ groups }, { message: "Mis grupos." });
    }

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
        INSERT INTO groups (owner_id, name, slug, description, privacy, icon_url, members_count)
        VALUES (${user.id}, ${body.name}, ${slugify(body.name)}, ${body.description || null}, ${privacy}, ${body.iconUrl || null}, 1)
        RETURNING id, owner_id, name, slug, description, icon_url, privacy, members_count, created_at`;
    const group = rows[0];
    await sql`
        INSERT INTO group_members (group_id, user_id, role)
        VALUES (${group.id}, ${user.id}, 'owner')`;

    // Añade como miembros SOLO a los amigos indicados (personas que el creador sigue).
    const memberIds = Array.isArray(body.memberIds)
        ? [...new Set(body.memberIds)].filter(is.uuid) : [];
    if (memberIds.length) {
        await sql`
            INSERT INTO group_members (group_id, user_id, role)
            SELECT ${group.id}, f.following_id, 'member'
            FROM follows f
            WHERE f.follower_id = ${user.id} AND f.following_id = ANY(${memberIds}::uuid[])
            ON CONFLICT DO NOTHING`;
        const cnt = await sql`SELECT COUNT(*)::int AS n FROM group_members WHERE group_id = ${group.id}`;
        await sql`UPDATE groups SET members_count = ${cnt[0].n} WHERE id = ${group.id}`;
        group.members_count = cnt[0].n;
    }
    return created({ group }, "Grupo creado.");
}
