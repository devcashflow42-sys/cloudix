"use strict";

const { ForbiddenError, UnauthorizedError } = require("../utils/AppError");
const { hasRoleLevel, roleHasPermission, ROLES } = require("../config/roles");

/**
 * Exige que el usuario tenga AL MENOS UNO de los roles listados.
 *
 *   router.get("/admin", authorize("admin", "moderator"), handler);
 */
function authorize(...allowedRoles) {
    const roles = allowedRoles.flat();
    return function (req, res, next) {
        if (!req.user) return next(new UnauthorizedError());
        const userRoles = req.user.roles || [];
        const ok = userRoles.some(r => roles.includes(r));
        if (!ok) return next(new ForbiddenError("No tienes permiso para acceder a este recurso."));
        next();
    };
}

/**
 * Exige un rol >= al nivel del rol dado.
 *
 *   router.get("/mod", authorizeMinLevel("moderator"), handler);
 */
function authorizeMinLevel(minRole) {
    return function (req, res, next) {
        if (!req.user) return next(new UnauthorizedError());
        const userRoles = req.user.roles || [];
        const ok = userRoles.some(r => hasRoleLevel(r, minRole));
        if (!ok) return next(new ForbiddenError("No tienes permiso suficiente."));
        next();
    };
}

/**
 * Exige un permiso concreto (los permisos se calculan por rol).
 */
function requirePermission(permission) {
    return function (req, res, next) {
        if (!req.user) return next(new UnauthorizedError());
        const userRoles = req.user.roles || [];
        const ok = userRoles.some(r => roleHasPermission(r, permission));
        if (!ok) return next(new ForbiddenError(`Se requiere el permiso ${permission}.`));
        next();
    };
}

/**
 * Exige que el usuario tenga el email verificado.
 */
function requireVerifiedEmail(req, res, next) {
    if (!req.user) return next(new UnauthorizedError());
    if (!req.user.emailVerified) {
        return next(new ForbiddenError("Debes verificar tu correo antes de continuar."));
    }
    next();
}

module.exports = {
    authorize,
    authorizeMinLevel,
    requirePermission,
    requireVerifiedEmail,
    ROLES,
};
