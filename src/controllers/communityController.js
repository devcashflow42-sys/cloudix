"use strict";

const communityService = require("../services/communityService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");
const auditService = require("../services/auditService");

const create = asyncHandler(async (req, res) => {
    const data = await communityService.create(req.user.id, req.body);
    await auditService.record(req, { action: "community.create", resourceType: "community", resourceId: data.id, statusCode: 201 });
    return apiResponse.created(res, { message: "Comunidad creada.", data });
});

const list = asyncHandler(async (req, res) => {
    const result = await communityService.list(req.query, req.user?.id || null);
    return apiResponse.paginated(res, { message: "Comunidades obtenidas.", data: result.data, pagination: result.pagination });
});

const getById = asyncHandler(async (req, res) => {
    const data = await communityService.getById(req.params.id, req.user?.id || null);
    return apiResponse.success(res, { message: "Comunidad obtenida.", data });
});

const update = asyncHandler(async (req, res) => {
    const data = await communityService.update(req.params.id, req.user.id, req.body);
    await auditService.record(req, { action: "community.update", resourceType: "community", resourceId: req.params.id, statusCode: 200 });
    return apiResponse.success(res, { message: "Comunidad actualizada.", data });
});

const remove = asyncHandler(async (req, res) => {
    await communityService.remove(req.params.id, req.user.id);
    await auditService.record(req, { action: "community.delete", resourceType: "community", resourceId: req.params.id, statusCode: 200 });
    return apiResponse.success(res, { message: "Comunidad eliminada." });
});

const createGroup = asyncHandler(async (req, res) => {
    const data = await communityService.createGroup(req.params.id, req.user.id, req.body);
    return apiResponse.created(res, { message: "Grupo creado en la comunidad.", data });
});

const listGroups = asyncHandler(async (req, res) => {
    const result = await communityService.listGroups(req.params.id, req.user?.id || null, req.query);
    return apiResponse.paginated(res, { message: "Grupos de la comunidad.", data: result.data, pagination: result.pagination });
});

const invite = asyncHandler(async (req, res) => {
    const inviteeIds = req.body.userIds || (req.body.userId ? [req.body.userId] : []);
    const data = await communityService.invite(req.params.id, req.user.id, inviteeIds);
    return apiResponse.success(res, { message: "Invitaciones procesadas.", data });
});

const join = asyncHandler(async (req, res) => {
    const data = await communityService.join(req.params.id, req.user.id);
    return apiResponse.success(res, { message: "Te has unido a la comunidad.", data });
});

const leave = asyncHandler(async (req, res) => {
    const data = await communityService.leave(req.params.id, req.user.id);
    return apiResponse.success(res, { message: "Has salido de la comunidad.", data });
});

const stats = asyncHandler(async (req, res) => {
    const data = await communityService.stats(req.params.id, req.user?.id || null);
    return apiResponse.success(res, { message: "Estadísticas de la comunidad.", data });
});

const listMembers = asyncHandler(async (req, res) => {
    const result = await communityService.listMembers(req.params.id, req.user?.id || null, req.query);
    return apiResponse.paginated(res, { message: "Miembros de la comunidad.", data: result.data, pagination: result.pagination });
});

const setRole = asyncHandler(async (req, res) => {
    const data = await communityService.setRole(req.params.id, req.user.id, req.body.userId, req.body.role);
    return apiResponse.success(res, { message: "Rol actualizado.", data });
});

const suspend = asyncHandler(async (req, res) => {
    const data = await communityService.suspendMember(req.params.id, req.user.id, req.body.userId);
    return apiResponse.success(res, { message: "Usuario suspendido.", data });
});

const ban = asyncHandler(async (req, res) => {
    const data = await communityService.banMember(req.params.id, req.user.id, req.body.userId);
    return apiResponse.success(res, { message: "Usuario baneado.", data });
});

const moderationHistory = asyncHandler(async (req, res) => {
    const result = await communityService.moderationHistory(req.params.id, req.user.id, req.query);
    return apiResponse.paginated(res, { message: "Historial de moderación.", data: result.data, pagination: result.pagination });
});

module.exports = {
    create, list, getById, update, remove,
    createGroup, listGroups, invite, join, leave, stats,
    listMembers, setRole, suspend, ban, moderationHistory,
};
