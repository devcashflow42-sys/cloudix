"use strict";

/**
 * Mapea una fila de la tabla `users` a un objeto DTO seguro (sin password_hash)
 * para exponer al cliente.
 */
function toPublicDTO(row, extra = {}) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        phone: row.phone,
        language: row.language,
        emailVerified: row.email_verified,
        isActive: row.is_active,
        lastLoginAt: row.last_login_at,
        metadata: row.metadata || {},
        roles: extra.roles || row.roles || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    };
}

/**
 * DTO mínimo (id, username, avatar) para embebidos.
 */
function toSummaryDTO(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        avatarUrl: row.avatar_url || null,
    };
}

module.exports = { toPublicDTO, toSummaryDTO };
