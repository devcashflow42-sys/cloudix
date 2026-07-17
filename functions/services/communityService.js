// Lógica de comunidades: membresía y roles. (Runtime edge.)
import { getSql } from "../database/client.js";
import { NotFoundError, ForbiddenError, BadRequestError, ConflictError } from "../utils/errors.js";

export const RANKS = { member: 1, collaborator: 2, moderator: 3, admin: 4, founder: 5 };
export const ASSIGNABLE = ["admin", "moderator", "collaborator", "member"]; // 'founder' no se asigna

function rank(r) { return RANKS[r] || 0; }

async function myRole(sql, communityId, userId) {
    if (!userId) return null;
    const r = await sql`SELECT role FROM community_members WHERE community_id = ${communityId} AND user_id = ${userId} LIMIT 1`;
    return r.length ? r[0].role : null;
}

export async function listMine(env, userId) {
    const sql = getSql(env);
    return sql`
        SELECT c.id, c.name, c.slug, c.description, c.icon_url, c.privacy, c.members_count, c.created_at,
               cm.role AS my_role
        FROM community_members cm
        JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
        WHERE cm.user_id = ${userId}
        ORDER BY c.created_at DESC`;
}

export async function detail(env, communityId, userId) {
    const sql = getSql(env);
    const rows = await sql`
        SELECT id, founder_id, name, slug, description, icon_url, privacy, members_count, created_at
        FROM communities WHERE id = ${communityId} AND deleted_at IS NULL LIMIT 1`;
    if (!rows.length) throw new NotFoundError("Comunidad no encontrada.");
    const community = rows[0];
    community.my_role = await myRole(sql, communityId, userId);
    if (community.privacy !== "public" && !community.my_role) throw new ForbiddenError("Esta comunidad es privada.");
    return community;
}

export async function listMembers(env, communityId, userId) {
    const sql = getSql(env);
    const c = await sql`SELECT privacy FROM communities WHERE id = ${communityId} AND deleted_at IS NULL LIMIT 1`;
    if (!c.length) throw new NotFoundError("Comunidad no encontrada.");
    const role = await myRole(sql, communityId, userId);
    if (c[0].privacy !== "public" && !role) throw new ForbiddenError("Esta comunidad es privada.");
    const members = await sql`
        SELECT u.id, u.username, u.display_name, u.avatar_url, m.role, m.joined_at
        FROM community_members m JOIN users u ON u.id = m.user_id
        WHERE m.community_id = ${communityId}
        ORDER BY CASE m.role WHEN 'founder' THEN 5 WHEN 'admin' THEN 4 WHEN 'moderator' THEN 3 WHEN 'collaborator' THEN 2 ELSE 1 END DESC,
                 m.joined_at ASC`;
    return { members, my_role: role };
}

async function requireManager(sql, communityId, actorId) {
    const role = await myRole(sql, communityId, actorId);
    if (!role) throw new ForbiddenError("No eres miembro de esta comunidad.");
    if (rank(role) < RANKS.admin) throw new ForbiddenError("Necesitas ser administrador o fundador.");
    return role;
}

export async function addMember(env, communityId, actorId, targetId) {
    const sql = getSql(env);
    await requireManager(sql, communityId, actorId);
    const target = await sql`SELECT id FROM users WHERE id = ${targetId} AND is_active = TRUE LIMIT 1`;
    if (!target.length) throw new NotFoundError("Usuario no encontrado.");
    const follows = await sql`SELECT 1 FROM follows WHERE follower_id = ${actorId} AND following_id = ${targetId} LIMIT 1`;
    if (!follows.length) throw new ForbiddenError("Solo puedes añadir a personas que sigues.");
    const exists = await sql`SELECT 1 FROM community_members WHERE community_id = ${communityId} AND user_id = ${targetId} LIMIT 1`;
    if (exists.length) throw new ConflictError("Ese usuario ya es miembro.");
    await sql`INSERT INTO community_members (community_id, user_id, role) VALUES (${communityId}, ${targetId}, 'member')`;
    await sql`UPDATE communities SET members_count = (SELECT COUNT(*) FROM community_members WHERE community_id = ${communityId}) WHERE id = ${communityId}`;
    await sql`INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id) VALUES (${targetId}, ${actorId}, 'community_add', 'community', ${communityId})`;
    return { added: true };
}

export async function setRole(env, communityId, actorId, targetId, newRole) {
    if (!ASSIGNABLE.includes(newRole)) throw new BadRequestError("Rol inválido.");
    const sql = getSql(env);
    const actorRole = await requireManager(sql, communityId, actorId);
    if (targetId === actorId) throw new BadRequestError("No puedes cambiar tu propio rol.");
    const t = await sql`SELECT role FROM community_members WHERE community_id = ${communityId} AND user_id = ${targetId} LIMIT 1`;
    if (!t.length) throw new NotFoundError("Ese usuario no es miembro.");
    if (t[0].role === "founder") throw new ForbiddenError("No puedes cambiar el rol del fundador.");
    if (rank(actorRole) <= rank(t[0].role)) throw new ForbiddenError("No puedes gestionar a un miembro de rango igual o superior.");
    if (rank(newRole) >= rank(actorRole)) throw new ForbiddenError("No puedes asignar un rol igual o superior al tuyo.");
    await sql`UPDATE community_members SET role = ${newRole} WHERE community_id = ${communityId} AND user_id = ${targetId}`;
    return { updated: true, role: newRole };
}

export async function removeMember(env, communityId, actorId, targetId) {
    const sql = getSql(env);
    const actorRole = await myRole(sql, communityId, actorId);
    if (!actorRole) throw new ForbiddenError("No eres miembro de esta comunidad.");
    const t = await sql`SELECT role FROM community_members WHERE community_id = ${communityId} AND user_id = ${targetId} LIMIT 1`;
    if (!t.length) throw new NotFoundError("Ese usuario no es miembro.");
    if (targetId === actorId) {
        if (actorRole === "founder") throw new BadRequestError("El fundador no puede salir; elimina la comunidad o transfiérela.");
    } else {
        if (rank(actorRole) < RANKS.admin) throw new ForbiddenError("Necesitas ser administrador o fundador.");
        if (t[0].role === "founder") throw new ForbiddenError("No puedes expulsar al fundador.");
        if (rank(actorRole) <= rank(t[0].role)) throw new ForbiddenError("No puedes expulsar a un miembro de rango igual o superior.");
    }
    await sql`DELETE FROM community_members WHERE community_id = ${communityId} AND user_id = ${targetId}`;
    await sql`UPDATE communities SET members_count = (SELECT COUNT(*) FROM community_members WHERE community_id = ${communityId}) WHERE id = ${communityId}`;
    return { removed: true, left: targetId === actorId };
}

export async function softDelete(env, communityId, userId) {
    const sql = getSql(env);
    const c = await sql`SELECT founder_id FROM communities WHERE id = ${communityId} AND deleted_at IS NULL LIMIT 1`;
    if (!c.length) throw new NotFoundError("Comunidad no encontrada.");
    if (c[0].founder_id !== userId) throw new ForbiddenError("Solo el fundador puede eliminar la comunidad.");
    await sql`UPDATE communities SET deleted_at = NOW() WHERE id = ${communityId}`;
    return { deleted: true };
}
