"use strict";

const groupRepo = require("../repositories/groupRepository");
const postRepo = require("../repositories/groupPostRepository");
const communityRepo = require("../repositories/communityRepository");
const userRepository = require("../repositories/userRepository");
const moderationRepo = require("../repositories/moderationRepository");
const notificationService = require("./notificationService");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const {
    NotFoundError, ForbiddenError, ConflictError, BadRequestError,
} = require("../utils/AppError");
const {
    GROUP_ROLES, GROUP_PERMISSIONS,
    groupRoleHasPermission, groupRoleAtLeast, minRoleForSetting,
} = require("../config/groupRoles");

const GROUP_SORT_FIELDS = ["created_at", "name", "members_count", "posts_count"];

// -------------------- Helpers de permisos --------------------

async function getGroupOr404(groupId) {
    const group = await groupRepo.findById(groupId);
    if (!group) throw new NotFoundError("Grupo no encontrado.");
    return group;
}

async function getActiveMember(groupId, userId) {
    const member = await groupRepo.findMember(groupId, userId);
    if (!member || member.status !== "active") return null;
    return member;
}

/** Exige que el usuario sea miembro activo y devuelve su membresía. */
async function requireMember(groupId, userId) {
    const member = await getActiveMember(groupId, userId);
    if (!member) throw new ForbiddenError("No eres miembro de este grupo.");
    return member;
}

/** Exige un permiso concreto según el rol del usuario en el grupo. */
async function requirePermission(groupId, userId, permission) {
    const member = await requireMember(groupId, userId);
    if (!groupRoleHasPermission(member.role, permission)) {
        throw new ForbiddenError("No tienes permisos suficientes en este grupo.");
    }
    return member;
}

// -------------------- CRUD de grupo --------------------

async function create(userId, payload) {
    if (payload.communityId) {
        const community = await communityRepo.findById(payload.communityId);
        if (!community) throw new NotFoundError("La comunidad indicada no existe.");
        const cm = await communityRepo.findMember(payload.communityId, userId);
        if (!cm || cm.status !== "active") {
            throw new ForbiddenError("Debes ser miembro de la comunidad para crear grupos en ella.");
        }
    }
    const group = await groupRepo.create({
        ownerId: userId,
        communityId: payload.communityId || null,
        name: payload.name,
        description: payload.description || null,
        privacy: payload.privacy || "public",
        topic: payload.topic || null,
        rules: payload.rules || null,
        tags: payload.tags || [],
    });
    return group;
}

async function getById(groupId, userId = null) {
    const group = await getGroupOr404(groupId);
    let membership = null;
    if (userId) {
        const m = await groupRepo.findMember(groupId, userId);
        if (m) membership = { role: m.role, status: m.status };
    }
    // Los grupos privados/solo-invitación ocultan el detalle a no miembros.
    if (group.privacy !== "public" && (!membership || membership.status !== "active")) {
        return {
            id: group.id,
            name: group.name,
            slug: group.slug,
            description: group.description,
            photo_url: group.photo_url,
            banner_url: group.banner_url,
            privacy: group.privacy,
            members_count: group.members_count,
            restricted: true,
        };
    }
    return { ...group, membership };
}

async function list(query, userId = null) {
    const { page, limit, offset } = parsePagination(query);
    const sort = parseSort(query, GROUP_SORT_FIELDS, "created_at", "DESC");
    const mine = query.mine === "true" && userId;

    const { rows, total } = await groupRepo.list({
        limit, offset, sort,
        search: query.search || query.q,
        privacy: query.privacy,
        communityId: query.communityId,
        ownerId: query.ownerId,
        memberId: mine ? userId : null,
    });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

async function update(groupId, userId, fields) {
    await getGroupOr404(groupId);
    await requirePermission(groupId, userId, GROUP_PERMISSIONS.EDIT_GROUP);

    const updates = {
        name: fields.name,
        description: fields.description,
        photo_url: fields.photoUrl,
        banner_url: fields.bannerUrl,
        privacy: fields.privacy,
        topic: fields.topic,
        rules: fields.rules,
        tags: fields.tags,
        who_can_post: fields.whoCanPost,
        who_can_comment: fields.whoCanComment,
        who_can_invite: fields.whoCanInvite,
        who_can_approve: fields.whoCanApprove,
    };
    const updated = await groupRepo.update(groupId, updates);
    if (!updated) throw new NotFoundError("Grupo no encontrado.");
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId,
        action: "group_updated", resourceType: "group", resourceId: groupId,
        details: { fields: Object.keys(updates).filter(k => updates[k] !== undefined) },
    });
    return updated;
}

async function remove(groupId, userId) {
    const group = await getGroupOr404(groupId);
    const member = await requireMember(groupId, userId);
    // Solo el propietario (o admin global, resuelto en la capa de rutas) puede borrar.
    if (member.role !== GROUP_ROLES.OWNER) {
        throw new ForbiddenError("Solo el propietario puede eliminar el grupo.");
    }
    await groupRepo.softDelete(groupId);
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId,
        action: "group_deleted", resourceType: "group", resourceId: groupId,
    });
    return { id: group.id };
}

// -------------------- Membresía --------------------

async function join(groupId, userId) {
    const group = await getGroupOr404(groupId);
    const existing = await groupRepo.findMember(groupId, userId);
    if (existing && existing.status === "banned") {
        throw new ForbiddenError("Has sido baneado de este grupo.");
    }
    if (existing && existing.status === "active") {
        throw new ConflictError("Ya eres miembro de este grupo.");
    }

    if (group.privacy === "public") {
        await groupRepo.addMember(groupId, userId, GROUP_ROLES.MEMBER);
        return { joined: true, status: "active" };
    }

    // Privado o solo-invitación: se requiere invitación aceptada.
    const invitation = await groupRepo.findInvitation(groupId, userId, "pending");
    if (invitation) {
        await groupRepo.addMember(groupId, userId, GROUP_ROLES.MEMBER);
        await groupRepo.consumeInvitation(groupId, userId);
        return { joined: true, status: "active" };
    }

    if (group.privacy === "invite_only") {
        throw new ForbiddenError("Este grupo es solo por invitación.");
    }
    // Privado sin invitación -> se crea una solicitud.
    return requestToJoin(groupId, userId);
}

async function requestToJoin(groupId, userId, message = null) {
    const group = await getGroupOr404(groupId);
    const existing = await groupRepo.findMember(groupId, userId);
    if (existing && existing.status === "banned") throw new ForbiddenError("Has sido baneado de este grupo.");
    if (existing && existing.status === "active") throw new ConflictError("Ya eres miembro de este grupo.");
    if (group.privacy === "public") {
        await groupRepo.addMember(groupId, userId, GROUP_ROLES.MEMBER);
        return { joined: true, status: "active" };
    }

    const request = await groupRepo.createRequest(groupId, userId, message);

    // Notificar a quienes pueden aprobar (owner + admins).
    const approvers = await groupRepo.listMembers(groupId, { limit: 100, offset: 0, role: null, status: "active" });
    const approverIds = approvers.rows
        .filter(m => groupRoleAtLeast(m.role, minRoleForSetting(group.who_can_approve)))
        .map(m => m.user_id);
    await notificationService.notifyMany(approverIds, {
        actorId: userId,
        type: notificationService.TYPES.JOIN_REQUEST,
        entityType: "group",
        entityId: groupId,
        data: { groupName: group.name },
    });

    return { requested: true, status: "pending", requestId: request.id };
}

async function leave(groupId, userId) {
    const group = await getGroupOr404(groupId);
    const member = await getActiveMember(groupId, userId);
    if (!member) throw new ConflictError("No eres miembro de este grupo.");
    if (member.role === GROUP_ROLES.OWNER) {
        throw new BadRequestError("El propietario no puede salir del grupo; transfiere la propiedad o elimínalo.");
    }
    await groupRepo.removeMember(groupId, userId);
    return { left: true };
}

async function invite(groupId, userId, inviteeIds = []) {
    const group = await getGroupOr404(groupId);
    const member = await requireMember(groupId, userId);
    // La configuración del grupo define quién puede invitar.
    if (!groupRoleAtLeast(member.role, minRoleForSetting(group.who_can_invite))
        && !groupRoleHasPermission(member.role, GROUP_PERMISSIONS.INVITE_MEMBERS)) {
        throw new ForbiddenError("No tienes permiso para invitar en este grupo.");
    }

    const results = [];
    for (const inviteeId of [...new Set(inviteeIds)]) {
        const invitee = await userRepository.findById(inviteeId);
        if (!invitee) { results.push({ inviteeId, status: "user_not_found" }); continue; }
        const existing = await groupRepo.findMember(groupId, inviteeId);
        if (existing && existing.status === "active") { results.push({ inviteeId, status: "already_member" }); continue; }
        if (existing && existing.status === "banned") { results.push({ inviteeId, status: "banned" }); continue; }

        await groupRepo.createInvitation(groupId, userId, inviteeId);
        await notificationService.notify(inviteeId, {
            actorId: userId,
            type: notificationService.TYPES.GROUP_INVITE,
            entityType: "group",
            entityId: groupId,
            data: { groupName: group.name },
        });
        results.push({ inviteeId, status: "invited" });
    }
    return { invitations: results };
}

async function listRequests(groupId, userId, query) {
    await getGroupOr404(groupId);
    await requirePermission(groupId, userId, GROUP_PERMISSIONS.MANAGE_REQUESTS);
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await groupRepo.listRequests(groupId, { limit, offset, status: "pending" });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

async function approveRequest(groupId, userId, targetUserId) {
    const group = await getGroupOr404(groupId);
    await requirePermission(groupId, userId, GROUP_PERMISSIONS.MANAGE_REQUESTS);

    const request = await groupRepo.findRequest(groupId, targetUserId, "pending");
    if (!request) throw new NotFoundError("No hay una solicitud pendiente de ese usuario.");

    await groupRepo.decideRequest(groupId, targetUserId, "approved", userId);
    await groupRepo.addMember(groupId, targetUserId, GROUP_ROLES.MEMBER);
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId, targetUserId,
        action: "request_approved", resourceType: "user", resourceId: targetUserId,
    });
    await notificationService.notify(targetUserId, {
        actorId: userId,
        type: notificationService.TYPES.REQUEST_APPROVED,
        entityType: "group", entityId: groupId,
        data: { groupName: group.name },
    });
    return { approved: true, userId: targetUserId };
}

async function rejectRequest(groupId, userId, targetUserId) {
    const group = await getGroupOr404(groupId);
    await requirePermission(groupId, userId, GROUP_PERMISSIONS.MANAGE_REQUESTS);

    const decided = await groupRepo.decideRequest(groupId, targetUserId, "rejected", userId);
    if (!decided) throw new NotFoundError("No hay una solicitud pendiente de ese usuario.");
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId, targetUserId,
        action: "request_rejected", resourceType: "user", resourceId: targetUserId,
    });
    await notificationService.notify(targetUserId, {
        actorId: userId,
        type: notificationService.TYPES.REQUEST_REJECTED,
        entityType: "group", entityId: groupId,
        data: { groupName: group.name },
    });
    return { rejected: true, userId: targetUserId };
}

async function kick(groupId, userId, targetUserId) {
    await getGroupOr404(groupId);
    const actor = await requirePermission(groupId, userId, GROUP_PERMISSIONS.MANAGE_MEMBERS);
    const target = await groupRepo.findMember(groupId, targetUserId);
    if (!target) throw new NotFoundError("Ese usuario no es miembro del grupo.");
    assertCanActOn(actor, target);
    await groupRepo.removeMember(groupId, targetUserId);
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId, targetUserId,
        action: "member_kicked", resourceType: "user", resourceId: targetUserId,
    });
    return { kicked: true, userId: targetUserId };
}

async function ban(groupId, userId, targetUserId) {
    const group = await getGroupOr404(groupId);
    const actor = await requirePermission(groupId, userId, GROUP_PERMISSIONS.MANAGE_MEMBERS);
    const target = await groupRepo.findMember(groupId, targetUserId);
    // Se puede banear a alguien aunque aún no sea miembro (prevención).
    if (target) assertCanActOn(actor, target);

    if (target) {
        await groupRepo.setBan(groupId, targetUserId, true, userId);
    } else {
        await groupRepo.addMember(groupId, targetUserId, GROUP_ROLES.MEMBER);
        await groupRepo.setBan(groupId, targetUserId, true, userId);
    }
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId, targetUserId,
        action: "member_banned", resourceType: "user", resourceId: targetUserId,
    });
    await notificationService.notify(targetUserId, {
        actorId: userId,
        type: notificationService.TYPES.BANNED,
        entityType: "group", entityId: groupId,
        data: { groupName: group.name },
    });
    return { banned: true, userId: targetUserId };
}

async function unban(groupId, userId, targetUserId) {
    await getGroupOr404(groupId);
    await requirePermission(groupId, userId, GROUP_PERMISSIONS.MANAGE_MEMBERS);
    const target = await groupRepo.findMember(groupId, targetUserId);
    if (!target || target.status !== "banned") {
        throw new NotFoundError("Ese usuario no está baneado.");
    }
    // Al desbanear se elimina la membresía; el usuario deberá volver a unirse.
    await groupRepo.removeMember(groupId, targetUserId);
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId, targetUserId,
        action: "member_unbanned", resourceType: "user", resourceId: targetUserId,
    });
    return { unbanned: true, userId: targetUserId };
}

async function setRole(groupId, userId, targetUserId, role) {
    await getGroupOr404(groupId);
    const actor = await requireMember(groupId, userId);
    if (actor.role !== GROUP_ROLES.OWNER) {
        throw new ForbiddenError("Solo el propietario puede cambiar roles.");
    }
    if (role === GROUP_ROLES.OWNER) {
        throw new BadRequestError("Usa la transferencia de propiedad para asignar un nuevo propietario.");
    }
    const updated = await groupRepo.setMemberRole(groupId, targetUserId, role);
    if (!updated) throw new NotFoundError("Ese usuario no es miembro del grupo.");
    if (role === GROUP_ROLES.ADMIN) {
        await notificationService.notify(targetUserId, {
            actorId: userId,
            type: notificationService.TYPES.NEW_ADMIN,
            entityType: "group", entityId: groupId,
        });
    }
    await moderationRepo.log({
        scope: "group", scopeId: groupId, actorId: userId, targetUserId,
        action: "role_changed", resourceType: "user", resourceId: targetUserId, details: { role },
    });
    return updated;
}

async function listMembers(groupId, userId, query) {
    const group = await getGroupOr404(groupId);
    if (group.privacy !== "public") await requireMember(groupId, userId);
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await groupRepo.listMembers(groupId, {
        limit, offset, role: query.role, status: query.status || "active",
    });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

/**
 * Evita que un rol inferior actúe sobre uno igual o superior.
 */
function assertCanActOn(actor, target) {
    if (target.role === GROUP_ROLES.OWNER) {
        throw new ForbiddenError("No puedes actuar sobre el propietario del grupo.");
    }
    if (!groupRoleAtLeast(actor.role, GROUP_ROLES.OWNER) && groupRoleAtLeast(target.role, actor.role)) {
        throw new ForbiddenError("No puedes actuar sobre un miembro con rol igual o superior al tuyo.");
    }
}

// -------------------- Publicaciones --------------------

async function createPost(groupId, userId, payload) {
    const group = await getGroupOr404(groupId);
    const member = await requireMember(groupId, userId);

    // ¿Quién puede publicar? -> configuración del grupo.
    if (!groupRoleAtLeast(member.role, minRoleForSetting(group.who_can_post))) {
        throw new ForbiddenError("No tienes permiso para publicar en este grupo.");
    }

    const type = payload.type || "text";
    if (type === "text" && !payload.body) {
        throw new BadRequestError("Una publicación de texto requiere contenido.");
    }
    if (type === "poll" && (!payload.poll || !Array.isArray(payload.poll.options) || payload.poll.options.length < 2)) {
        throw new BadRequestError("Una encuesta requiere al menos dos opciones.");
    }
    if (type === "link" && !payload.linkUrl) {
        throw new BadRequestError("Una publicación de enlace requiere una URL.");
    }
    const mediaTypes = ["image", "video", "music", "audio", "document"];
    if (mediaTypes.includes(type) && (!Array.isArray(payload.attachments) || payload.attachments.length === 0)) {
        throw new BadRequestError(`Una publicación de tipo ${type} requiere al menos un adjunto.`);
    }

    const post = await postRepo.create({
        groupId,
        authorId: userId,
        type,
        body: payload.body || null,
        attachments: payload.attachments || [],
        linkUrl: payload.linkUrl || null,
        poll: payload.poll || null,
        event: payload.event || null,
        status: "published",
    });

    // Notificar al resto de miembros activos.
    const members = await groupRepo.listMembers(groupId, { limit: 500, offset: 0, status: "active" });
    await notificationService.notifyMany(
        members.rows.map(m => m.user_id),
        {
            actorId: userId,
            type: notificationService.TYPES.POST_CREATED,
            entityType: "group", entityId: groupId,
            data: { groupName: group.name, postId: post.id, postType: type },
        },
    );
    return post;
}

async function listPosts(groupId, userId, query) {
    const group = await getGroupOr404(groupId);
    if (group.privacy !== "public") await requireMember(groupId, userId);
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await postRepo.listByGroup(groupId, { limit, offset, status: "published" });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

async function moderationHistory(groupId, userId, query) {
    await getGroupOr404(groupId);
    await requirePermission(groupId, userId, GROUP_PERMISSIONS.MODERATE_POSTS);
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await moderationRepo.list({ scope: "group", scopeId: groupId, limit, offset });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

module.exports = {
    create,
    getById,
    list,
    update,
    remove,
    join,
    requestToJoin,
    leave,
    invite,
    listRequests,
    approveRequest,
    rejectRequest,
    kick,
    ban,
    unban,
    setRole,
    listMembers,
    createPost,
    listPosts,
    moderationHistory,
};
