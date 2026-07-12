"use strict";

/**
 * Definición de roles del sistema y sus permisos.
 *
 * Jerarquía:
 *   admin > moderator > premium > user
 */

const ROLES = Object.freeze({
    ADMIN: "admin",
    MODERATOR: "moderator",
    PREMIUM: "premium",
    USER: "user",
});

const ROLE_LEVELS = Object.freeze({
    [ROLES.USER]: 1,
    [ROLES.PREMIUM]: 2,
    [ROLES.MODERATOR]: 3,
    [ROLES.ADMIN]: 4,
});

const PERMISSIONS = Object.freeze({
    // Usuarios
    USERS_READ: "users:read",
    USERS_WRITE: "users:write",
    USERS_DELETE: "users:delete",
    USERS_MANAGE_ROLES: "users:manage_roles",

    // Multimedia
    MEDIA_UPLOAD: "media:upload",
    MEDIA_READ: "media:read",
    MEDIA_WRITE: "media:write",
    MEDIA_DELETE: "media:delete",
    MEDIA_MODERATE: "media:moderate",

    // Sistema
    SYSTEM_STATS: "system:stats",
    SYSTEM_AUDIT: "system:audit",
});

const ROLE_PERMISSIONS = Object.freeze({
    [ROLES.ADMIN]: Object.values(PERMISSIONS),
    [ROLES.MODERATOR]: [
        PERMISSIONS.USERS_READ,
        PERMISSIONS.MEDIA_READ,
        PERMISSIONS.MEDIA_WRITE,
        PERMISSIONS.MEDIA_DELETE,
        PERMISSIONS.MEDIA_MODERATE,
        PERMISSIONS.MEDIA_UPLOAD,
        PERMISSIONS.SYSTEM_STATS,
    ],
    [ROLES.PREMIUM]: [
        PERMISSIONS.MEDIA_UPLOAD,
        PERMISSIONS.MEDIA_READ,
        PERMISSIONS.MEDIA_WRITE,
    ],
    [ROLES.USER]: [
        PERMISSIONS.MEDIA_UPLOAD,
        PERMISSIONS.MEDIA_READ,
    ],
});

const ROLE_DESCRIPTIONS = Object.freeze({
    [ROLES.ADMIN]: "Administrador con control total del sistema.",
    [ROLES.MODERATOR]: "Modera contenido multimedia y consulta usuarios.",
    [ROLES.PREMIUM]: "Usuario con acceso a funciones ampliadas y sin límites reducidos.",
    [ROLES.USER]: "Usuario estándar con permisos básicos.",
});

/**
 * Devuelve true si `role` tiene al menos el nivel de `minRole`.
 */
function hasRoleLevel(role, minRole) {
    return (ROLE_LEVELS[role] || 0) >= (ROLE_LEVELS[minRole] || 0);
}

/**
 * Devuelve true si `role` incluye `permission`.
 */
function roleHasPermission(role, permission) {
    return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

module.exports = {
    ROLES,
    ROLE_LEVELS,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    ROLE_DESCRIPTIONS,
    hasRoleLevel,
    roleHasPermission,
    ALL_ROLES: Object.values(ROLES),
};
