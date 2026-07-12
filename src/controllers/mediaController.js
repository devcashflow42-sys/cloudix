"use strict";

const mediaService = require("../services/mediaService");
const auditService = require("../services/auditService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

const upload = asyncHandler(async (req, res) => {
    const data = await mediaService.uploadFile({
        user: req.user,
        file: req.file,
        body: req.body,
    });
    await auditService.record(req, {
        action: "media.upload",
        resourceType: "media_file",
        resourceId: data.id,
        statusCode: 201,
        details: { kind: data.kind, sizeBytes: data.sizeBytes },
    });
    return apiResponse.created(res, {
        message: "Archivo subido correctamente.",
        data,
    });
});

const list = asyncHandler(async (req, res) => {
    const result = await mediaService.list({ query: req.query, viewer: req.user });
    return apiResponse.paginated(res, {
        message: "Multimedia obtenido.",
        data: result.data,
        pagination: result.pagination,
    });
});

const getById = asyncHandler(async (req, res) => {
    const data = await mediaService.getById({ id: req.params.id, viewer: req.user });
    return apiResponse.success(res, { message: "Archivo obtenido.", data });
});

const update = asyncHandler(async (req, res) => {
    const data = await mediaService.update({
        id: req.params.id,
        viewer: req.user,
        body: req.body,
    });
    await auditService.record(req, {
        action: "media.update",
        resourceType: "media_file",
        resourceId: req.params.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Archivo actualizado.", data });
});

const remove = asyncHandler(async (req, res) => {
    await mediaService.remove({ id: req.params.id, viewer: req.user });
    await auditService.record(req, {
        action: "media.delete",
        resourceType: "media_file",
        resourceId: req.params.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Archivo archivado. Puede ser restaurado por un moderador." });
});

const restore = asyncHandler(async (req, res) => {
    await mediaService.restore({ id: req.params.id });
    await auditService.record(req, {
        action: "media.restore",
        resourceType: "media_file",
        resourceId: req.params.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Archivo restaurado." });
});

const hardDelete = asyncHandler(async (req, res) => {
    await mediaService.hardDelete({ id: req.params.id, viewer: req.user });
    await auditService.record(req, {
        action: "media.hard_delete",
        resourceType: "media_file",
        resourceId: req.params.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Archivo eliminado definitivamente." });
});

const stats = asyncHandler(async (req, res) => {
    const data = await mediaService.stats();
    return apiResponse.success(res, { message: "Estadísticas de multimedia.", data });
});

const registerDownload = asyncHandler(async (req, res) => {
    await mediaService.registerDownload(req.params.id);
    return apiResponse.success(res, { message: "Descarga registrada." });
});

module.exports = {
    upload,
    list,
    getById,
    update,
    remove,
    restore,
    hardDelete,
    stats,
    registerDownload,
};
