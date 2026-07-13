"use strict";

const communityRepo = require("../repositories/communityRepository");
const groupRepo = require("../repositories/groupRepository");
const userRepository = require("../repositories/userRepository");
const moderationRepo = require("../repositories/moderationRepository");
const notificationService = require("./notificationService");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const {
    NotFoundError, ForbiddenError, ConflictError, BadRequestError,
} = require("../utils/AppError");
const {
    COMMUNITY_ROLES, COMMUNITY_PERMISSIONS,
    communityRoleHasPermission, communityRoleAtLeast,
} = require("../config/groupRoles");

const COMMUNITY_SORT_FIELDS = ["created_at", "name", "members_count", "groups_count"];

// -------------------- Helpers --------------------

async function getCommunityOr404(communityId) {
    const community = await communityRepo.findById(communityId);
    if (!community) throw new NotFoundError("Comunidad no encontrada.");
    return community;
}

async function requireMember(communityId, userId) {
    const member = await communityRepo.findMember(communityId, userId);
    if (!member || member.status !== "active") {
        throw new ForbiddenError("No eres miembro de esta comunidad.");
    }
    return member;
}

async function requirePermission(communityId, userId, permission) {
    const member = await requireMember(communityId, userId);
    if (!communityRoleHasPermission(member.role, permission)) {
        throw new ForbiddenError("No tienes permisos suficientes en esta comunidad.");
    }
    return member;
}

// -------------------- CRUD --------------------

async function create(userId, payload) {
    return communityRepo.create({
        founderId: userId,
        name: payload.name,
        description: payload.description || null,
        privacy: payload.privacy || "public",
        rules: payload.rules || null,
        tags: payload.tags || [],
        categories: payload.categories || [],
    });
}

async function getById(communityId, userId = null) {
    const community = await getCommunityOr404(communityId);
    let membership = null;
    if (userId) {
        const m = await communityRepo.findMember(communityId, userId);
        if (m) membership = { role: m.role, status: m.status };
    }
    if (community.privacy !== "public" && (!membership || membership.status !== "active")) {
        return {
            id: community.id,
            name: community.name,
            slug: community.slug,
            description: community.description,
            icon_url: community.icon_url,
            banner_url: community.banner_url,
            privacy: community.privacy,
            members_count: community.members_count,
            groups_count: community.groups_count,
            restricted: true,
        };
    }
    return { ...community, membership };
}

async function list(query, userId = null) {
    const { page, limit, offset } = parsePagination(query);
    const sort = parseSort(query, COMMUNITY_SORT_FIELDS, "created_at", "DESC");
    const mine = query.mine === "true" && userId;
    const { rows, total } = await communityRepo.list({
        limit, offset, sort,
        search: query.search || query.q,
        privacy: query.privacy,
        memberId: mine ? userId : null,
    });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

async function update(communityId, userId, fields) {
    await getCommunityOr404(communityId);
    await requirePermission(communityId, userId, COMMUNITY_PERMISSIONS.EDIT_COMMUNITY);
    const updates = {
        name: fields.name,
        description: fields.description,
        icon_url: fields.iconUrl,
        banner_url: fields.bannerUrl,
        privacy: fields.privacy,
        rules: fields.rules,
        tags: fields.tags,
        categories: fields.categories,
    };
    const updated = await communityRepo.update(communityId, updates);
    if (!updated) throw new NotFoundError("Comunidad no encontrada.");
    await moderationRepo.log({
        scope: "community", scopeId: communityId, actorId: userId,
        action: "community_updated", resourceType: "community", resourceId: communityId,
    });
    return updated;
}

async function remove(communityId, userId) {
    await getCommunityOr404(communityId);
    const member = await requireMember(communityId, userId);
    if (member.role !== COMMUNITY_ROLES.FOUNDER) {
        throw new ForbiddenError("Solo el fundador puede eliminar la comunidad.");
    }
    await communityRepo.softDelete(communityId);
    await moderationRepo.log({
        scope: "community", scopeId: communityId, actorId: userId,
        action: "community_deleted", resourceType: "community", resourceId: communityId,
    });
    return { id: communityId };
}

// -------------------- Membresía --------------------

async function join(communityId, userId) {
    const community = await getCommunityOr404(communityId);
    const existing = await communityRepo.findMember(communityId, userId);
    if (existing && existing.status === "banned") throw new ForbiddenError("Has sido baneado de esta comunidad.");
    if (existing && existing.status === "active") throw new ConflictError("Ya eres miembro de esta comunidad.");
    if (community.privacy === "invite_only") {
        throw new ForbiddenError("Esta comunidad es solo por invitación.");
    }
    await communityRepo.addMember(communityId, userId, COMMUNITY_ROLES.MEMBER);
    return { joined: true, status: "active" };
}

async function leave(communityId, userId) {
    await getCommunityOr404(communityId);
    const member = await communityRepo.findMember(communityId, userId);
    if (!member || member.status !== "active") throw new ConflictError("No eres miembro de esta comunidad.");
    if (member.role === COMMUNITY_ROLES.FOUNDER) {
        throw new BadRequestError("El fundador no puede abandonar la comunidad; transfiérela o elimínala.");
    }
    await communityRepo.removeMember(communityId, userId);
    return { left: true };
}

async function invite(communityId, userId, inviteeIds = []) {
    const community = await getCommunityOr404(communityId);
    await requirePermission(communityId, userId, COMMUNITY_PERMISSIONS.INVITE_MEMBERS);
    const results = [];
    for (const inviteeId of [...new Set(inviteeIds)]) {
        const invitee = await userRepository.findById(inviteeId);
        if (!invitee) { results.push({ inviteeId, status: "user_not_found" }); continue; }
        const existing = await communityRepo.findMember(communityId, inviteeId);
        if (existing && existing.status === "active") { results.push({ inviteeId, status: "already_member" }); continue; }
        await communityRepo.createInvitation(communityId, userId, inviteeId);
        await notificationService.notify(inviteeId, {
            actorId: userId,
            type: notificationService.TYPES.COMMUNITY_INVITE,
            entityType: "community", entityId: communityId,
            data: { communityName: community.name },
        });
        results.push({ inviteeId, status: "invited" });
    }
    return { invitations: results };
}

async function suspendMember(communityId, userId, targetUserId) {
    await getCommunityOr404(communityId);
    await requirePermission(communityId, userId, COMMUNITY_PERMISSIONS.MODERATE);
    const target = await communityRepo.findMember(communityId, targetUserId);
    if (!target) throw new NotFoundError("Ese usuario no es miembro de la comunidad.");
    if (target.role === COMMUNITY_ROLES.FOUNDER) throw new ForbiddenError("No puedes suspender al fundador.");
    await communityRepo.setMemberStatus(communityId, targetUserId, "suspended");
    await moderationRepo.log({
        scope: "community", scopeId: communityId, actorId: userId, targetUserId,
        action: "member_suspended", resourceType: "user", resourceId: targetUserId,
    });
    return { suspended: true, userId: targetUserId };
}

async function banMember(communityId, userId, targetUserId) {
    await getCommunityOr404(communityId);
    await requirePermission(communityId, userId, COMMUNITY_PERMISSIONS.MANAGE_MEMBERS);
    const target = await communityRepo.findMember(communityId, targetUserId);
    if (!target) throw new NotFoundError("Ese usuario no es miembro de la comunidad.");
    if (target.role === COMMUNITY_ROLES.FOUNDER) throw new ForbiddenError("No puedes banear al fundador.");
    await communityRepo.setMemberStatus(communityId, targetUserId, "banned");
    await moderationRepo.log({
        scope: "community", scopeId: communityId, actorId: userId, targetUserId,
        action: "member_banned", resourceType: "user", resourceId: targetUserId,
    });
    await notificationService.notify(targetUserId, {
        actorId: userId,
        type: notificationService.TYPES.BANNED,
        entityType: "community", entityId: communityId,
    });
    return { banned: true, userId: targetUserId };
}

async function setRole(communityId, userId, targetUserId, role) {
    await getCommunityOr404(communityId);
    const actor = await requireMember(communityId, userId);
    if (!communityRoleAtLeast(actor.role, COMMUNITY_ROLES.ADMIN)) {
        throw new ForbiddenError("Solo administradores o el fundador pueden cambiar roles.");
    }
    if (role === COMMUNITY_ROLES.FOUNDER) {
        throw new BadRequestError("El rol de fundador no puede asignarse manualmente.");
    }
    const updated = await communityRepo.setMemberRole(communityId, targetUserId, role);
    if (!updated) throw new NotFoundError("Ese usuario no es miembro de la comunidad.");
    if (role === COMMUNITY_ROLES.ADMIN) {
        await notificationService.notify(targetUserId, {
            actorId: userId,
            type: notificationService.TYPES.NEW_ADMIN,
            entityType: "community", entityId: communityId,
        });
    }
    await moderationRepo.log({
        scope: "community", scopeId: communityId, actorId: userId, targetUserId,
        action: "role_changed", resourceType: "user", resourceId: targetUserId, details: { role },
    });
    return updated;
}

async function listMembers(communityId, userId, query) {
    const community = await getCommunityOr404(communityId);
    if (community.privacy !== "public") await requireMember(communityId, userId);
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await communityRepo.listMembers(communityId, {
        limit, offset, role: query.role, status: query.status || "active",
    });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

// -------------------- Grupos de la comunidad --------------------

async function createGroup(communityId, userId, payload) {
    await getCommunityOr404(communityId);
    await requirePermission(communityId, userId, COMMUNITY_PERMISSIONS.MANAGE_GROUPS);
    const group = await groupRepo.create({
        ownerId: userId,
        communityId,
        name: payload.name,
        description: payload.description || null,
        privacy: payload.privacy || "public",
        topic: payload.topic || null,
        rules: payload.rules || null,
        tags: payload.tags || [],
    });
    await moderationRepo.log({
        scope: "community", scopeId: communityId, actorId: userId,
        action: "group_created", resourceType: "group", resourceId: group.id,
    });
    return group;
}

async function listGroups(communityId, userId, query) {
    const community = await getCommunityOr404(communityId);
    if (community.privacy !== "public") await requireMember(communityId, userId);
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await communityRepo.listGroups(communityId, { limit, offset });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

// -------------------- Estadísticas --------------------

async function stats(communityId, userId) {
    const community = await getCommunityOr404(communityId);
    if (community.privacy !== "public") await requireMember(communityId, userId);
    const [counters, recent] = await Promise.all([
        communityRepo.stats(communityId),
        communityRepo.recentPosts(communityId, { limit: 5 }),
    ]);
    return {
        community: { id: community.id, name: community.name },
        members: counters.members,
        admins: counters.admins,
        groups: counters.groups,
        posts: counters.posts,
        growth: {
            newMembersLastWeek: counters.members_last_week,
            newPostsLastWeek: counters.posts_last_week,
        },
        recentPosts: recent,
    };
}

async function moderationHistory(communityId, userId, query) {
    await getCommunityOr404(communityId);
    await requirePermission(communityId, userId, COMMUNITY_PERMISSIONS.MODERATE);
    const { page, limit, offset } = parsePagination(query);
    const { rows, total } = await moderationRepo.list({ scope: "community", scopeId: communityId, limit, offset });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

module.exports = {
    create,
    getById,
    list,
    update,
    remove,
    join,
    leave,
    invite,
    suspendMember,
    banMember,
    setRole,
    listMembers,
    createGroup,
    listGroups,
    stats,
    moderationHistory,
};
