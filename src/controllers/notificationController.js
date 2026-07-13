"use strict";

const notificationService = require("../services/notificationService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");

const list = asyncHandler(async (req, res) => {
    const result = await notificationService.list(req.user.id, req.query);
    return apiResponse.paginated(res, {
        message: "Notificaciones obtenidas.",
        data: result.data,
        pagination: result.pagination,
    });
});

const markRead = asyncHandler(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
    const data = await notificationService.markRead(req.user.id, ids);
    return apiResponse.success(res, { message: "Notificaciones marcadas como leídas.", data });
});

module.exports = { list, markRead };
