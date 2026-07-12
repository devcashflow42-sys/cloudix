"use strict";

const categoryService = require("../services/categoryService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
    const activeOnly = req.query.activeOnly !== "false";
    const data = await categoryService.list({ activeOnly });
    return apiResponse.success(res, { message: "Categorías obtenidas.", data });
});

const getById = asyncHandler(async (req, res) => {
    const data = await categoryService.getById(req.params.id);
    return apiResponse.success(res, { message: "Categoría obtenida.", data });
});

const create = asyncHandler(async (req, res) => {
    const data = await categoryService.create({
        name: req.body.name,
        description: req.body.description,
        parentId: req.body.parentId,
    });
    return apiResponse.created(res, { message: "Categoría creada.", data });
});

const update = asyncHandler(async (req, res) => {
    const data = await categoryService.update(req.params.id, req.body);
    return apiResponse.success(res, { message: "Categoría actualizada.", data });
});

const remove = asyncHandler(async (req, res) => {
    await categoryService.remove(req.params.id);
    return apiResponse.success(res, { message: "Categoría eliminada." });
});

module.exports = { list, getById, create, update, remove };
