"use strict";

const userRepo = require("../repositories/userRepository");
const tokenRepo = require("../repositories/tokenRepository");
const User = require("../models/User");
const {
    NotFoundError, ConflictError, ForbiddenError, BadRequestError,
} = require("../utils/AppError");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const { ROLES, ALL_ROLES } = require("../config/roles");
const cache = require("../utils/cache");

const USER_SORT_FIELDS = ["created_at", "updated_at", "username", "email", "last_login_at"];

async function getProfile(userId) {
    const row = await userRepo.findById(userId);
    if (!row) throw new NotFoundError("Usuario no encontrado.");
    const roles = await userRepo.findRoles(userId);
    return User.toPublicDTO(row, { roles });
}

async function updateProfile(userId, data) {
    // El repositorio ya filtra por whitelist. Aquí solo mapeamos camelCase → snake_case.
    const mapped = {
        first_name: data.firstName,
        last_name:  data.lastName,
        bio:        data.bio,
        phone:      data.phone,
        language:   data.language,
        avatar_url: data.avatarUrl,
    };
    Object.keys(mapped).forEach(k => mapped[k] === undefined && delete mapped[k]);

    const row = await userRepo.updateProfile(userId, mapped);
    if (!row) throw new NotFoundError("Usuario no encontrado.");
    const roles = await userRepo.findRoles(userId);
    cache.delByPrefix(`user:${userId}`);
    return User.toPublicDTO(row, { roles });
}

async function deleteAccount(userId) {
    const row = await userRepo.findById(userId);
    if (!row) throw new NotFoundError("Usuario no encontrado.");
    await userRepo.softDelete(userId);
    await tokenRepo.revokeAllForUser(userId);
    cache.delByPrefix(`user:${userId}`);
    return true;
}

async function listUsers(query) {
    const { page, limit, offset } = parsePagination(query);
    const sort = parseSort(query, USER_SORT_FIELDS, "created_at", "DESC");

    let isActive;
    if (query.isActive === "true" || query.active === "true")  isActive = true;
    if (query.isActive === "false" || query.active === "false") isActive = false;

    const includeDeleted = query.includeDeleted === "true";

    const { rows, total } = await userRepo.list({
        page, limit, offset, sort,
        search: query.search || query.q,
        role: query.role,
        isActive,
        includeDeleted,
    });

    return {
        data: rows.map(r => User.toPublicDTO(r, { roles: r.roles || [] })),
        pagination: buildPaginationMeta(page, limit, total),
    };
}

async function getUserById(id) {
    const row = await userRepo.findById(id, { includeDeleted: true });
    if (!row) throw new NotFoundError("Usuario no encontrado.");
    const roles = await userRepo.findRoles(id);
    return User.toPublicDTO(row, { roles });
}

async function setUserRoles({ actorUserId, targetUserId, roles }) {
    if (!Array.isArray(roles) || roles.length === 0) {
        throw new BadRequestError("Debes indicar al menos un rol.");
    }
    const unknown = roles.filter(r => !ALL_ROLES.includes(r));
    if (unknown.length) throw new BadRequestError(`Rol(es) desconocido(s): ${unknown.join(", ")}`);

    const target = await userRepo.findById(targetUserId);
    if (!target) throw new NotFoundError("Usuario no encontrado.");

    // Evita que un admin se remueva a sí mismo el rol admin.
    if (actorUserId === targetUserId && !roles.includes(ROLES.ADMIN)) {
        throw new ForbiddenError("No puedes quitarte a ti mismo el rol admin.");
    }

    await userRepo.setRoles(targetUserId, roles, actorUserId);
    return getUserById(targetUserId);
}

async function setUserStatus({ actorUserId, targetUserId, isActive }) {
    if (actorUserId === targetUserId && isActive === false) {
        throw new ForbiddenError("No puedes desactivar tu propia cuenta desde aquí.");
    }
    const target = await userRepo.findById(targetUserId, { includeDeleted: true });
    if (!target) throw new NotFoundError("Usuario no encontrado.");

    if (isActive) {
        await userRepo.restore(targetUserId);
    } else {
        await userRepo.softDelete(targetUserId);
        await tokenRepo.revokeAllForUser(targetUserId);
    }
    return getUserById(targetUserId);
}

async function stats() {
    return userRepo.stats();
}

module.exports = {
    getProfile,
    updateProfile,
    deleteAccount,
    listUsers,
    getUserById,
    setUserRoles,
    setUserStatus,
    stats,
};
