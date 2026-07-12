"use strict";

const { query } = require("../database/connection");

async function log({
    userId = null,
    action,
    resourceType = null,
    resourceId = null,
    ip = null,
    userAgent = null,
    requestMethod = null,
    requestPath = null,
    statusCode = null,
    details = {},
}) {
    try {
        await query(
            `INSERT INTO audit_logs
             (user_id, action, resource_type, resource_id, ip_address, user_agent,
              request_method, request_path, status_code, details)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [userId, action, resourceType, resourceId ? String(resourceId) : null,
             ip, userAgent, requestMethod, requestPath, statusCode, details],
        );
    } catch (err) {
        // Auditar no debe romper el flujo principal.
        // El middleware ya reporta el error si falla la request original.
    }
}

async function list({ page, limit, offset, sort, action, userId, resourceType }) {
    const filters = [];
    const params = [];
    let i = 1;
    if (action)       { filters.push(`action = $${i++}`);        params.push(action); }
    if (userId)       { filters.push(`user_id = $${i++}`);       params.push(userId); }
    if (resourceType) { filters.push(`resource_type = $${i++}`); params.push(resourceType); }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const orderBy = `ORDER BY ${sort.column} ${sort.direction}`;

    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
        params,
    );
    const total = totalRes.rows[0].total;

    const dataRes = await query(
        `SELECT id, user_id, action, resource_type, resource_id,
                ip_address, user_agent, request_method, request_path,
                status_code, details, created_at
         FROM audit_logs
         ${where}
         ${orderBy}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total };
}

module.exports = { log, list };
