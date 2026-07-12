"use strict";

const tagService = require("../services/tagService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
    const data = await tagService.list({
        search: req.query.search || req.query.q,
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
    });
    return apiResponse.success(res, { message: "Etiquetas obtenidas.", data });
});

const create = asyncHandler(async (req, res) => {
    const names = Array.isArray(req.body.names)
        ? req.body.names
        : req.body.name ? [req.body.name] : [];
    const data = await tagService.create({ names });
    return apiResponse.created(res, { message: "Etiquetas creadas.", data });
});

const remove = asyncHandler(async (req, res) => {
    await tagService.remove(req.params.id);
    return apiResponse.success(res, { message: "Etiqueta eliminada." });
});

module.exports = { list, create, remove };
