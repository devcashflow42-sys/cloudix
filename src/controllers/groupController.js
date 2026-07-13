"use strict";

const groupService = require("../services/groupService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");
const auditService = require("../services/auditService");

const create = asyncHandler(async (req, res) => {
    const data = await groupService.create(req.user.id, req.body);
    await auditService.record(req, { action: "group.create", resourceType: "group", resourceId: data.id, statusCode: 201 });
    return apiResponse.created(res, { message: "Grupo creado.", data });
});

const list = asyncHandler(async (req, res) => {
    const result = await groupService.list(req.query, req.user?.id || null);
    return apiResponse.paginated(res, { message: "Grupos obtenidos.", data: result.data, pagination: result.pagination });
});

const getById = asyncHandler(async (req, res) => {
    const data = await groupService.getById(req.params.id, req.user?.id || null);
    return apiResponse.success(res, { message: "Grupo obtenido.", data });
});

const update = asyncHandler(async (req, res) => {
    const data = await groupService.update(req.params.id, req.user.id, req.body);
    await auditService.record(req, { action: "group.update", resourceType: "group", resourceId: req.params.id, statusCode: 200 });
    return apiResponse.success(res, { message: "Grupo actualizado.", data });
});

const remove = asyncHandler(async (req, res) => {
    await groupService.remove(req.params.id, req.user.id);
    await auditService.record(req, { action: "group.delete", resourceType: "group", resourceId: req.params.id, statusCode: 200 });
    return apiResponse.success(res, { message: "Grupo eliminado." });
});

const join = asyncHandler(async (req, res) => {
    const data = await groupService.join(req.params.id, req.user.id);
    return apiResponse.success(res, { message: data.requested ? "Solicitud enviada." : "Te has unido al grupo.", data });
});

const leave = asyncHandler(async (req, res) => {
    const data = await groupService.leave(req.params.id, req.user.id);
    return apiResponse.success(res, { message: "Has salido del grupo.", data });
});

const invite = asyncHandler(async (req, res) => {
    const inviteeIds = req.body.userIds || (req.body.userId ? [req.body.userId] : []);
    const data = await groupService.invite(req.params.id, req.user.id, inviteeIds);
    return apiResponse.success(res, { message: "Invitaciones procesadas.", data });
});

const request = asyncHandler(async (req, res) => {
    const data = await groupService.requestToJoin(req.params.id, req.user.id, req.body.message);
    return apiResponse.success(res, { message: data.joined ? "Te has unido al grupo." : "Solicitud enviada.", data });
});

const listRequests = asyncHandler(async (req, res) => {
    const result = await groupService.listRequests(req.params.id, req.user.id, req.query);
    return apiResponse.paginated(res, { message: "Solicitudes pendientes.", data: result.data, pagination: result.pagination });
});

const approve = asyncHandler(async (req, res) => {
    const data = await groupService.approveRequest(req.params.id, req.user.id, req.body.userId);
    await auditService.record(req, { action: "group.approve", resourceType: "group", resourceId: req.params.id, statusCode: 200 });
    return apiResponse.success(res, { message: "Solicitud aprobada.", data });
});

const reject = asyncHandler(async (req, res) => {
    const data = await groupService.rejectRequest(req.params.id, req.user.id, req.body.userId);
    return apiResponse.success(res, { message: "Solicitud rechazada.", data });
});

const ban = asyncHandler(async (req, res) => {
    const data = await groupService.ban(req.params.id, req.user.id, req.body.userId);
    await auditService.record(req, { action: "group.ban", resourceType: "group", resourceId: req.params.id, statusCode: 200 });
    return apiResponse.success(res, { message: "Usuario baneado.", data });
});

const unban = asyncHandler(async (req, res) => {
    const data = await groupService.unban(req.params.id, req.user.id, req.body.userId);
    return apiResponse.success(res, { message: "Usuario desbaneado.", data });
});

const kick = asyncHandler(async (req, res) => {
    const data = await groupService.kick(req.params.id, req.user.id, req.body.userId);
    return apiResponse.success(res, { message: "Usuario expulsado.", data });
});

const setRole = asyncHandler(async (req, res) => {
    const data = await groupService.setRole(req.params.id, req.user.id, req.body.userId, req.body.role);
    return apiResponse.success(res, { message: "Rol actualizado.", data });
});

const listMembers = asyncHandler(async (req, res) => {
    const result = await groupService.listMembers(req.params.id, req.user?.id || null, req.query);
    return apiResponse.paginated(res, { message: "Miembros del grupo.", data: result.data, pagination: result.pagination });
});

const createPost = asyncHandler(async (req, res) => {
    const data = await groupService.createPost(req.params.id, req.user.id, req.body);
    await auditService.record(req, { action: "group.post.create", resourceType: "group_post", resourceId: data.id, statusCode: 201 });
    return apiResponse.created(res, { message: "Publicación creada.", data });
});

const listPosts = asyncHandler(async (req, res) => {
    const result = await groupService.listPosts(req.params.id, req.user?.id || null, req.query);
    return apiResponse.paginated(res, { message: "Publicaciones del grupo.", data: result.data, pagination: result.pagination });
});

const moderationHistory = asyncHandler(async (req, res) => {
    const result = await groupService.moderationHistory(req.params.id, req.user.id, req.query);
    return apiResponse.paginated(res, { message: "Historial de moderación.", data: result.data, pagination: result.pagination });
});

module.exports = {
    create, list, getById, update, remove,
    join, leave, invite, request, listRequests, approve, reject,
    ban, unban, kick, setRole, listMembers,
    createPost, listPosts, moderationHistory,
};
