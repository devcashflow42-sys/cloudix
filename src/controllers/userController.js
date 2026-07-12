"use strict";

const userService = require("../services/userService");
const auditService = require("../services/auditService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

const getProfile = asyncHandler(async (req, res) => {
    const data = await userService.getProfile(req.user.id);
    return apiResponse.success(res, { message: "Perfil obtenido.", data });
});

const updateProfile = asyncHandler(async (req, res) => {
    const data = await userService.updateProfile(req.user.id, req.body);
    await auditService.record(req, {
        action: "user.profile_update",
        resourceType: "user",
        resourceId: req.user.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Perfil actualizado.", data });
});

const deleteAccount = asyncHandler(async (req, res) => {
    await userService.deleteAccount(req.user.id);
    await auditService.record(req, {
        action: "user.account_delete",
        resourceType: "user",
        resourceId: req.user.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Cuenta eliminada correctamente." });
});

const listUsers = asyncHandler(async (req, res) => {
    const result = await userService.listUsers(req.query);
    return apiResponse.paginated(res, {
        message: "Usuarios obtenidos.",
        data: result.data,
        pagination: result.pagination,
    });
});

const getUserById = asyncHandler(async (req, res) => {
    const data = await userService.getUserById(req.params.id);
    return apiResponse.success(res, { message: "Usuario obtenido.", data });
});

const setRoles = asyncHandler(async (req, res) => {
    const data = await userService.setUserRoles({
        actorUserId: req.user.id,
        targetUserId: req.params.id,
        roles: req.body.roles,
    });
    await auditService.record(req, {
        action: "user.roles_update",
        resourceType: "user",
        resourceId: req.params.id,
        statusCode: 200,
        details: { roles: req.body.roles },
    });
    return apiResponse.success(res, { message: "Roles actualizados.", data });
});

const setStatus = asyncHandler(async (req, res) => {
    const data = await userService.setUserStatus({
        actorUserId: req.user.id,
        targetUserId: req.params.id,
        isActive: !!req.body.isActive,
    });
    await auditService.record(req, {
        action: "user.status_update",
        resourceType: "user",
        resourceId: req.params.id,
        statusCode: 200,
        details: { isActive: !!req.body.isActive },
    });
    return apiResponse.success(res, { message: "Estado actualizado.", data });
});

const stats = asyncHandler(async (req, res) => {
    const data = await userService.stats();
    return apiResponse.success(res, { message: "Estadísticas de usuarios.", data });
});

module.exports = {
    getProfile,
    updateProfile,
    deleteAccount,
    listUsers,
    getUserById,
    setRoles,
    setStatus,
    stats,
};
