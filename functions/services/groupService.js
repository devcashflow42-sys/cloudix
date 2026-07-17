// Lógica de grupos: membresía, roles y chat. (Runtime edge.)
import { getSql } from "../database/client.js";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../utils/errors.js";

export const RANKS = { member: 1, moderator: 2, admin: 3, owner: 4 };
export const ASSIGNABLE = ["admin", "moderator", "member"]; // 'owner' no se asigna manualmente

function rank(r) { return RANKS[r] || 0; }

async function myRole(sql, groupId, userId) {
    if (!userId) return null;
    const r = await sql`SELECT role FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId} LIMIT 1`;
    return r.length ? r[0].role : null;
}

export async function listMine(env, userId) {
    const sql = getSql(env);
    return sql`
        SELECT g.id, g.name, g.slug, g.description, g.icon_url, g.privacy, g.members_count, g.created_at,
               gm.role AS my_role
        FROM group_members gm
        JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
        WHERE gm.user_id = ${userId}
        ORDER BY g.created_at DESC`;
}

export async function detail(env, groupId, userId) {
    const sql = getSql(env);
    const rows = await sql`
        SELECT id, owner_id, name, slug, description, icon_url, privacy, members_count, created_at
        FROM groups WHERE id = ${groupId} AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length) throw new NotFoundError("Grupo no encontrado.");
    const group = rows[0];
    group.my_role = await myRole(sql, groupId, userId);
    if (group.privacy !== "public" && !group.my_role) throw new ForbiddenError("Este grupo es privado.");
    return group;
}

export async function listMembers(env, groupId, userId) {
    const sql = getSql(env);
    const g = await sql`SELECT privacy FROM groups WHERE id = ${groupId} AND deleted_at IS NULL LIMIT 1`;
    if (!g.length) throw new NotFoundError("Grupo no encontrado.");
    const role = await myRole(sql, groupId, userId);
    if (g[0].privacy !== "public" && !role) throw new ForbiddenError("Este grupo es privado.");
    const members = await sql`
        SELECT u.id, u.username, u.display_name, u.avatar_url, m.role, m.joined_at
        FROM group_members m JOIN users u ON u.id = m.user_id
        WHERE m.group_id = ${groupId}
        ORDER BY CASE m.role WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'moderator' THEN 2 ELSE 1 END DESC,
                 m.joined_at ASC`;
    return { members, my_role: role };
}

async function requireManager(sql, groupId, actorId) {
    const role = await myRole(sql, groupId, actorId);
    if (!role) throw new ForbiddenError("No eres miembro de este grupo.");
    if (rank(role) < RANKS.admin) throw new ForbiddenError("Necesitas ser administrador o propietario.");
    return role;
}

export async function addMember(env, groupId, actorId, targetId) {
    const sql = getSql(env);
    await requireManager(sql, groupId, actorId);
    const target = await sql`SELECT id FROM users WHERE id = ${targetId} AND is_active = TRUE LIMIT 1`;
    if (!target.length) throw new NotFoundError("Usuario no encontrado.");
    // Solo puedes añadir a personas que sigues (amigos).
    const follows = await sql`SELECT 1 FROM follows WHERE follower_id = ${actorId} AND following_id = ${targetId} LIMIT 1`;
    if (!follows.length) throw new ForbiddenError("Solo puedes añadir a personas que sigues.");
    const exists = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${targetId} LIMIT 1`;
    if (exists.length) throw new ConflictError("Ese usuario ya es miembro.");
    await sql`INSERT INTO group_members (group_id, user_id, role) VALUES (${groupId}, ${targetId}, 'member')`;
    await sql`UPDATE groups SET members_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ${groupId}) WHERE id = ${groupId}`;
    await sql`INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id) VALUES (${targetId}, ${actorId}, 'group_add', 'group', ${groupId})`;
    return { added: true };
}

export async function setRole(env, groupId, actorId, targetId, newRole) {
    if (!ASSIGNABLE.includes(newRole)) throw new BadRequestError("Rol inválido.");
    const sql = getSql(env);
    const actorRole = await requireManager(sql, groupId, actorId);
    if (targetId === actorId) throw new BadRequestError("No puedes cambiar tu propio rol.");
    const t = await sql`SELECT role FROM group_members WHERE group_id = ${groupId} AND user_id = ${targetId} LIMIT 1`;
    if (!t.length) throw new NotFoundError("Ese usuario no es miembro.");
    if (t[0].role === "owner") throw new ForbiddenError("No puedes cambiar el rol del propietario.");
    if (rank(actorRole) <= rank(t[0].role)) throw new ForbiddenError("No puedes gestionar a un miembro de rango igual o superior.");
    if (rank(newRole) >= rank(actorRole)) throw new ForbiddenError("No puedes asignar un rol igual o superior al tuyo.");
    await sql`UPDATE group_members SET role = ${newRole} WHERE group_id = ${groupId} AND user_id = ${targetId}`;
    return { updated: true, role: newRole };
}

export async function removeMember(env, groupId, actorId, targetId) {
    const sql = getSql(env);
    const actorRole = await myRole(sql, groupId, actorId);
    if (!actorRole) throw new ForbiddenError("No eres miembro de este grupo.");
    const t = await sql`SELECT role FROM group_members WHERE group_id = ${groupId} AND user_id = ${targetId} LIMIT 1`;
    if (!t.length) throw new NotFoundError("Ese usuario no es miembro.");

    if (targetId === actorId) {
        // salir del grupo
        if (actorRole === "owner") throw new BadRequestError("El propietario no puede salir; elimina el grupo o transfiérelo.");
    } else {
        // expulsar
        if (rank(actorRole) < RANKS.admin) throw new ForbiddenError("Necesitas ser administrador o propietario.");
        if (t[0].role === "owner") throw new ForbiddenError("No puedes expulsar al propietario.");
        if (rank(actorRole) <= rank(t[0].role)) throw new ForbiddenError("No puedes expulsar a un miembro de rango igual o superior.");
    }
    await sql`DELETE FROM group_members WHERE group_id = ${groupId} AND user_id = ${targetId}`;
    await sql`UPDATE groups SET members_count = (SELECT COUNT(*) FROM group_members WHERE group_id = ${groupId}) WHERE id = ${groupId}`;
    return { removed: true, left: targetId === actorId };
}

// -------- chat de grupo --------
export async function listMessages(env, groupId, userId) {
    const sql = getSql(env);
    if (!(await myRole(sql, groupId, userId))) throw new ForbiddenError("No eres miembro de este grupo.");
    const rows = await sql`
        SELECT m.id, m.sender_id, m.content, m.created_at,
               u.username, u.display_name, u.avatar_url
        FROM group_messages m JOIN users u ON u.id = m.sender_id
        WHERE m.group_id = ${groupId}
        ORDER BY m.created_at DESC
        LIMIT 100`;
    return rows;
}

export async function sendMessage(env, groupId, userId, content) {
    const text = String(content || "").trim();
    if (!text) throw new BadRequestError("El mensaje no puede estar vacío.");
    const sql = getSql(env);
    if (!(await myRole(sql, groupId, userId))) throw new ForbiddenError("No eres miembro de este grupo.");
    const rows = await sql`
        INSERT INTO group_messages (group_id, sender_id, content)
        VALUES (${groupId}, ${userId}, ${text.slice(0, 4000)})
        RETURNING id, sender_id, content, created_at`;
    return rows[0];
}

export async function softDelete(env, groupId, userId) {
    const sql = getSql(env);
    const g = await sql`SELECT owner_id FROM groups WHERE id = ${groupId} AND deleted_at IS NULL LIMIT 1`;
    if (!g.length) throw new NotFoundError("Grupo no encontrado.");
    if (g[0].owner_id !== userId) throw new ForbiddenError("Solo el propietario puede eliminar el grupo.");
    await sql`UPDATE groups SET deleted_at = NOW() WHERE id = ${groupId}`;
    return { deleted: true };
}
