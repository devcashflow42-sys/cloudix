"use strict";

/**
 * Roles y permisos internos de Grupos y Comunidades.
 *
 * Estos roles son independientes de los roles globales del sistema
 * (config/roles.js). Un usuario "user" del sistema puede ser "owner"
 * de un grupo y "member" de otro.
 */

// ---------------- GRUPOS ----------------

const GROUP_ROLES = Object.freeze({
    OWNER: "owner",
    ADMIN: "admin",
    MODERATOR: "moderator",
    MEMBER: "member",
});

const GROUP_ROLE_LEVELS = Object.freeze({
    [GROUP_ROLES.MEMBER]: 1,
    [GROUP_ROLES.MODERATOR]: 2,
    [GROUP_ROLES.ADMIN]: 3,
    [GROUP_ROLES.OWNER]: 4,
});

const GROUP_PERMISSIONS = Object.freeze({
    EDIT_GROUP: "group:edit",              // nombre, descripción, foto, banner, privacidad, config
    DELETE_GROUP: "group:delete",
    MANAGE_MEMBERS: "group:manage_members", // expulsar, banear, cambiar roles
    MANAGE_REQUESTS: "group:manage_requests", // aprobar/rechazar solicitudes
    INVITE_MEMBERS: "group:invite",
    MODERATE_POSTS: "group:moderate_posts", // eliminar/aprobar publicaciones ajenas
    CREATE_POST: "group:create_post",
    COMMENT: "group:comment",
});

const GROUP_ROLE_PERMISSIONS = Object.freeze({
    [GROUP_ROLES.OWNER]: Object.values(GROUP_PERMISSIONS),
    [GROUP_ROLES.ADMIN]: [
        GROUP_PERMISSIONS.EDIT_GROUP,
        GROUP_PERMISSIONS.MANAGE_MEMBERS,
        GROUP_PERMISSIONS.MANAGE_REQUESTS,
        GROUP_PERMISSIONS.INVITE_MEMBERS,
        GROUP_PERMISSIONS.MODERATE_POSTS,
        GROUP_PERMISSIONS.CREATE_POST,
        GROUP_PERMISSIONS.COMMENT,
    ],
    [GROUP_ROLES.MODERATOR]: [
        GROUP_PERMISSIONS.MANAGE_REQUESTS,
        GROUP_PERMISSIONS.INVITE_MEMBERS,
        GROUP_PERMISSIONS.MODERATE_POSTS,
        GROUP_PERMISSIONS.CREATE_POST,
        GROUP_PERMISSIONS.COMMENT,
    ],
    [GROUP_ROLES.MEMBER]: [
        GROUP_PERMISSIONS.CREATE_POST,
        GROUP_PERMISSIONS.COMMENT,
    ],
});

// ---------------- COMUNIDADES ----------------

const COMMUNITY_ROLES = Object.freeze({
    FOUNDER: "founder",
    ADMIN: "admin",
    MODERATOR: "moderator",
    COLLABORATOR: "collaborator",
    MEMBER: "member",
});

const COMMUNITY_ROLE_LEVELS = Object.freeze({
    [COMMUNITY_ROLES.MEMBER]: 1,
    [COMMUNITY_ROLES.COLLABORATOR]: 2,
    [COMMUNITY_ROLES.MODERATOR]: 3,
    [COMMUNITY_ROLES.ADMIN]: 4,
    [COMMUNITY_ROLES.FOUNDER]: 5,
});

const COMMUNITY_PERMISSIONS = Object.freeze({
    EDIT_COMMUNITY: "community:edit",
    DELETE_COMMUNITY: "community:delete",
    MANAGE_MEMBERS: "community:manage_members",
    MANAGE_GROUPS: "community:manage_groups",   // crear/asociar grupos
    INVITE_MEMBERS: "community:invite",
    MODERATE: "community:moderate",             // aprobar/eliminar publicaciones, suspender/banear
    CREATE_CONTENT: "community:create_content", // anuncios, eventos, canales
});

const COMMUNITY_ROLE_PERMISSIONS = Object.freeze({
    [COMMUNITY_ROLES.FOUNDER]: Object.values(COMMUNITY_PERMISSIONS),
    [COMMUNITY_ROLES.ADMIN]: [
        COMMUNITY_PERMISSIONS.EDIT_COMMUNITY,
        COMMUNITY_PERMISSIONS.MANAGE_MEMBERS,
        COMMUNITY_PERMISSIONS.MANAGE_GROUPS,
        COMMUNITY_PERMISSIONS.INVITE_MEMBERS,
        COMMUNITY_PERMISSIONS.MODERATE,
        COMMUNITY_PERMISSIONS.CREATE_CONTENT,
    ],
    [COMMUNITY_ROLES.MODERATOR]: [
        COMMUNITY_PERMISSIONS.MODERATE,
        COMMUNITY_PERMISSIONS.INVITE_MEMBERS,
        COMMUNITY_PERMISSIONS.CREATE_CONTENT,
    ],
    [COMMUNITY_ROLES.COLLABORATOR]: [
        COMMUNITY_PERMISSIONS.MANAGE_GROUPS,
        COMMUNITY_PERMISSIONS.CREATE_CONTENT,
    ],
    [COMMUNITY_ROLES.MEMBER]: [],
});

// ---------------- Helpers ----------------

function groupRoleHasPermission(role, permission) {
    return (GROUP_ROLE_PERMISSIONS[role] || []).includes(permission);
}

function groupRoleAtLeast(role, minRole) {
    return (GROUP_ROLE_LEVELS[role] || 0) >= (GROUP_ROLE_LEVELS[minRole] || 0);
}

function communityRoleHasPermission(role, permission) {
    return (COMMUNITY_ROLE_PERMISSIONS[role] || []).includes(permission);
}

function communityRoleAtLeast(role, minRole) {
    return (COMMUNITY_ROLE_LEVELS[role] || 0) >= (COMMUNITY_ROLE_LEVELS[minRole] || 0);
}

/**
 * Traduce una configuración "who_can_*" (members/moderators/admins) al
 * rol mínimo requerido para realizar la acción.
 */
function minRoleForSetting(setting) {
    switch (setting) {
        case "admins":     return GROUP_ROLES.ADMIN;
        case "moderators": return GROUP_ROLES.MODERATOR;
        case "members":
        default:           return GROUP_ROLES.MEMBER;
    }
}

module.exports = {
    GROUP_ROLES,
    GROUP_ROLE_LEVELS,
    GROUP_PERMISSIONS,
    GROUP_ROLE_PERMISSIONS,
    ALL_GROUP_ROLES: Object.values(GROUP_ROLES),

    COMMUNITY_ROLES,
    COMMUNITY_ROLE_LEVELS,
    COMMUNITY_PERMISSIONS,
    COMMUNITY_ROLE_PERMISSIONS,
    ALL_COMMUNITY_ROLES: Object.values(COMMUNITY_ROLES),

    groupRoleHasPermission,
    groupRoleAtLeast,
    communityRoleHasPermission,
    communityRoleAtLeast,
    minRoleForSetting,
};
