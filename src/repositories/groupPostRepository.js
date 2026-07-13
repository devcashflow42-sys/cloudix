"use strict";

const { query, withTransaction } = require("../database/connection");

const POST_COLUMNS = `
    id, group_id, author_id, type, body, attachments, link_url, poll, event,
    status, likes_count, reactions_count, comments_count, shares_count, saves_count,
    created_at, updated_at
`;

async function create({ groupId, authorId, type = "text", body = null, attachments = [], linkUrl = null, poll = null, event = null, status = "published" }) {
    return withTransaction(async (client) => {
        const res = await client.query(
            `INSERT INTO group_posts (group_id, author_id, type, body, attachments, link_url, poll, event, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING ${POST_COLUMNS}`,
            [
                groupId, authorId, type, body,
                JSON.stringify(attachments || []),
                linkUrl,
                poll ? JSON.stringify(poll) : null,
                event ? JSON.stringify(event) : null,
                status,
            ],
        );
        if (status === "published") {
            await client.query(`UPDATE groups SET posts_count = posts_count + 1 WHERE id = $1`, [groupId]);
        }
        return res.rows[0];
    });
}

async function findById(id) {
    const res = await query(
        `SELECT ${POST_COLUMNS} FROM group_posts WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [id],
    );
    return res.rows[0] || null;
}

async function listByGroup(groupId, { limit, offset, status = "published" }) {
    const filters = ["p.group_id = $1", "p.deleted_at IS NULL"];
    const params = [groupId];
    let i = 2;
    if (status) { filters.push(`p.status = $${i++}`); params.push(status); }
    const where = `WHERE ${filters.join(" AND ")}`;

    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM group_posts p ${where}`, params);
    const dataRes = await query(
        `SELECT p.id, p.group_id, p.author_id, p.type, p.body, p.attachments, p.link_url,
                p.poll, p.event, p.status, p.likes_count, p.reactions_count,
                p.comments_count, p.shares_count, p.saves_count, p.created_at, p.updated_at,
                u.username AS author_username, u.avatar_url AS author_avatar
         FROM group_posts p
         JOIN users u ON u.id = p.author_id
         ${where}
         ORDER BY p.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

async function setStatus(id, status) {
    const res = await query(
        `UPDATE group_posts SET status = $2 WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, group_id, status`,
        [id, status],
    );
    return res.rows[0] || null;
}

async function softDelete(id) {
    return withTransaction(async (client) => {
        const res = await client.query(
            `UPDATE group_posts SET deleted_at = NOW(), status = 'removed'
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING id, group_id`,
            [id],
        );
        const row = res.rows[0];
        if (row) {
            await client.query(
                `UPDATE groups SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = $1`,
                [row.group_id],
            );
        }
        return !!row;
    });
}

// -------------------- REACCIONES --------------------

async function setReaction(postId, userId, reaction) {
    return withTransaction(async (client) => {
        await client.query(
            `INSERT INTO group_post_reactions (post_id, user_id, reaction)
             VALUES ($1, $2, $3)
             ON CONFLICT (post_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction`,
            [postId, userId, reaction],
        );
        return recountReactions(client, postId);
    });
}

async function removeReaction(postId, userId) {
    return withTransaction(async (client) => {
        await client.query(
            `DELETE FROM group_post_reactions WHERE post_id = $1 AND user_id = $2`,
            [postId, userId],
        );
        return recountReactions(client, postId);
    });
}

async function recountReactions(client, postId) {
    const res = await client.query(
        `UPDATE group_posts SET
            reactions_count = (SELECT COUNT(*) FROM group_post_reactions WHERE post_id = $1),
            likes_count     = (SELECT COUNT(*) FROM group_post_reactions WHERE post_id = $1 AND reaction = 'like')
         WHERE id = $1
         RETURNING likes_count, reactions_count`,
        [postId],
    );
    return res.rows[0] || null;
}

// -------------------- COMENTARIOS --------------------

async function addComment(postId, authorId, body, parentId = null) {
    return withTransaction(async (client) => {
        const res = await client.query(
            `INSERT INTO group_post_comments (post_id, author_id, body, parent_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, post_id, author_id, parent_id, body, created_at`,
            [postId, authorId, body, parentId],
        );
        await client.query(
            `UPDATE group_posts SET comments_count = comments_count + 1 WHERE id = $1`,
            [postId],
        );
        return res.rows[0];
    });
}

async function listComments(postId, { limit, offset }) {
    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM group_post_comments WHERE post_id = $1 AND deleted_at IS NULL`,
        [postId],
    );
    const dataRes = await query(
        `SELECT c.id, c.author_id, c.parent_id, c.body, c.created_at,
                u.username AS author_username, u.avatar_url AS author_avatar
         FROM group_post_comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.post_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.created_at ASC
         LIMIT $2 OFFSET $3`,
        [postId, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

// -------------------- GUARDADOS --------------------

async function toggleSave(postId, userId) {
    return withTransaction(async (client) => {
        const existing = await client.query(
            `SELECT 1 FROM group_post_saves WHERE post_id = $1 AND user_id = $2`,
            [postId, userId],
        );
        let saved;
        if (existing.rowCount > 0) {
            await client.query(`DELETE FROM group_post_saves WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
            saved = false;
        } else {
            await client.query(`INSERT INTO group_post_saves (post_id, user_id) VALUES ($1, $2)`, [postId, userId]);
            saved = true;
        }
        const res = await client.query(
            `UPDATE group_posts SET saves_count =
                (SELECT COUNT(*) FROM group_post_saves WHERE post_id = $1)
             WHERE id = $1 RETURNING saves_count`,
            [postId],
        );
        return { saved, savesCount: res.rows[0]?.saves_count ?? 0 };
    });
}

// -------------------- COMPARTIR --------------------

async function incrementShares(postId) {
    const res = await query(
        `UPDATE group_posts SET shares_count = shares_count + 1
         WHERE id = $1 AND deleted_at IS NULL RETURNING shares_count`,
        [postId],
    );
    return res.rows[0]?.shares_count ?? null;
}

// -------------------- REPORTES --------------------

async function createReport(postId, reporterId, reason, details = null) {
    const res = await query(
        `INSERT INTO group_post_reports (post_id, reporter_id, reason, details)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (post_id, reporter_id) DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details
         RETURNING id, post_id, reporter_id, reason, status, created_at`,
        [postId, reporterId, reason, details],
    );
    return res.rows[0];
}

module.exports = {
    create,
    findById,
    listByGroup,
    setStatus,
    softDelete,
    setReaction,
    removeReaction,
    addComment,
    listComments,
    toggleSave,
    incrementShares,
    createReport,
};
