"use strict";

const { query } = require("../database/connection");

async function create({ recipientId, actorId = null, type, entityType = null, entityId = null, data = {} }) {
    const res = await query(
        `INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, data)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, recipient_id, actor_id, type, entity_type, entity_id, data, read_at, created_at`,
        [recipientId, actorId, type, entityType, entityId, data],
    );
    return res.rows[0];
}

/**
 * Inserta la misma notificación para varios destinatarios en una sola sentencia.
 */
async function createMany(recipientIds, { actorId = null, type, entityType = null, entityId = null, data = {} }) {
    const ids = [...new Set(recipientIds.filter(Boolean))];
    if (ids.length === 0) return 0;
    const res = await query(
        `INSERT INTO notifications (recipient_id, actor_id, type, entity_type, entity_id, data)
         SELECT uid, $2, $3, $4, $5, $6
         FROM UNNEST($1::uuid[]) AS uid`,
        [ids, actorId, type, entityType, entityId, data],
    );
    return res.rowCount;
}

async function listForUser(userId, { limit, offset, unreadOnly = false }) {
    const filters = ["recipient_id = $1"];
    const params = [userId];
    let i = 2;
    if (unreadOnly) filters.push("read_at IS NULL");
    const where = `WHERE ${filters.join(" AND ")}`;

    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM notifications ${where}`, params);
    const dataRes = await query(
        `SELECT id, actor_id, type, entity_type, entity_id, data, read_at, created_at
         FROM notifications ${where}
         ORDER BY created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

async function markRead(userId, ids = null) {
    if (Array.isArray(ids) && ids.length > 0) {
        const res = await query(
            `UPDATE notifications SET read_at = NOW()
             WHERE recipient_id = $1 AND read_at IS NULL AND id = ANY($2::uuid[])
             RETURNING id`,
            [userId, ids],
        );
        return res.rowCount;
    }
    const res = await query(
        `UPDATE notifications SET read_at = NOW()
         WHERE recipient_id = $1 AND read_at IS NULL RETURNING id`,
        [userId],
    );
    return res.rowCount;
}

module.exports = { create, createMany, listForUser, markRead };
