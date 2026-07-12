"use strict";

const os = require("os");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");
const { healthCheck } = require("../database/connection");
const userService = require("../services/userService");
const mediaService = require("../services/mediaService");
const auditService = require("../services/auditService");
const cache = require("../utils/cache");
const env = require("../config/env");

const health = asyncHandler(async (req, res) => {
    const db = await healthCheck();
    const memory = process.memoryUsage();
    const data = {
        status: db.ok ? "ok" : "degraded",
        service: env.APP_NAME,
        version: "1.0.0",
        environment: env.NODE_ENV,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        database: db,
        cache: { entries: cache.size() },
        node: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        memory: {
            rss: memory.rss,
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
        },
    };
    return apiResponse.success(res, {
        message: data.status === "ok" ? "Servicio operativo." : "Servicio degradado.",
        data,
        status: data.status === "ok" ? 200 : 503,
    });
});

const stats = asyncHandler(async (req, res) => {
    const [users, media] = await Promise.all([userService.stats(), mediaService.stats()]);
    return apiResponse.success(res, {
        message: "Estadísticas del sistema.",
        data: { users, media },
    });
});

const audit = asyncHandler(async (req, res) => {
    const result = await auditService.list(req.query);
    return apiResponse.paginated(res, {
        message: "Registros de auditoría obtenidos.",
        data: result.data,
        pagination: result.pagination,
    });
});

module.exports = { health, stats, audit };
