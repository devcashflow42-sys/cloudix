"use strict";

const auditRepo = require("../repositories/auditRepository");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");

const AUDIT_SORT_FIELDS = ["created_at", "action", "resource_type", "status_code"];

/**
 * Registra una entrada de auditoría a partir de un req.
 */
async function record(req, { action, resourceType, resourceId, statusCode, details }) {
    return auditRepo.log({
        userId: req.user?.id || null,
        action,
        resourceType,
        resourceId,
        ip: req.ip,
        userAgent: req.get?.("user-agent") || null,
        requestMethod: req.method,
        requestPath: req.originalUrl,
        statusCode,
        details: details || {},
    });
}

async function list(query) {
    const { page, limit, offset } = parsePagination(query);
    const sort = parseSort(query, AUDIT_SORT_FIELDS, "created_at", "DESC");
    const { rows, total } = await auditRepo.list({
        page, limit, offset, sort,
        action: query.action,
        userId: query.userId,
        resourceType: query.resourceType,
    });
    return {
        data: rows,
        pagination: buildPaginationMeta(page, limit, total),
    };
}

module.exports = { record, list };
