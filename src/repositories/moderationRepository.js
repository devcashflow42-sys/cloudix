"use strict";

const { query } = require("../database/connection");

async function log({ scope, scopeId, actorId = null, targetUserId = null, action, resourceType = null, resourceId = null, details = {} }) {
    try {
        await query(
            `INSERT INTO moderation_logs
             (scope, scope_id, actor_id, target_user_id, action, resource_type, resource_id, details)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [scope, scopeId, actorId, targetUserId, action, resourceType, resourceId, details],
        );
    } catch (err) {
        // El historial de moderación no debe romper el flujo principal.
    }
}

async function list({ scope, scopeId, limit, offset }) {
    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM moderation_logs WHERE scope = $1 AND scope_id = $2`,
        [scope, scopeId],
    );
    const dataRes = await query(
        `SELECT m.id, m.actor_id, m.target_user_id, m.action, m.resource_type, m.resource_id,
                m.details, m.created_at,
                a.username AS actor_username, t.username AS target_username
         FROM moderation_logs m
         LEFT JOIN users a ON a.id = m.actor_id
         LEFT JOIN users t ON t.id = m.target_user_id
         WHERE m.scope = $1 AND m.scope_id = $2
         ORDER BY m.created_at DESC
         LIMIT $3 OFFSET $4`,
        [scope, scopeId, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

module.exports = { log, list };
