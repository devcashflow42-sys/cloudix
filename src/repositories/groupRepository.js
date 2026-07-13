"use strict";

const { query, withTransaction } = require("../database/connection");

const GROUP_COLUMNS = `
    id, owner_id, community_id, name, slug, description, photo_url, banner_url,
    privacy, topic, rules, tags,
    who_can_post, who_can_comment, who_can_invite, who_can_approve,
    members_count, posts_count, metadata, created_at, updated_at
`;

function slugify(str) {
    return String(str || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 150);
}

// -------------------- GRUPOS --------------------

async function create({ ownerId, communityId = null, name, description = null, privacy = "public", topic = null, rules = null, tags = [] }) {
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`;
    return withTransaction(async (client) => {
        const res = await client.query(
            `INSERT INTO groups (owner_id, community_id, name, slug, description, privacy, topic, rules, tags)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING ${GROUP_COLUMNS}`,
            [ownerId, communityId, name, slug, description, privacy, topic, rules, tags],
        );
        const group = res.rows[0];
        // El creador es el owner y primer miembro.
        await client.query(
            `INSERT INTO group_members (group_id, user_id, role, status)
             VALUES ($1, $2, 'owner', 'active')`,
            [group.id, ownerId],
        );
        await client.query(`UPDATE groups SET members_count = 1 WHERE id = $1`, [group.id]);
        if (communityId) {
            await client.query(
                `UPDATE communities SET groups_count = groups_count + 1 WHERE id = $1 AND deleted_at IS NULL`,
                [communityId],
            );
        }
        group.members_count = 1;
        return group;
    });
}

async function findById(id) {
    const res = await query(
        `SELECT ${GROUP_COLUMNS} FROM groups WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [id],
    );
    return res.rows[0] || null;
}

async function list({ limit, offset, sort, search, privacy, communityId, ownerId, memberId }) {
    const filters = ["g.deleted_at IS NULL"];
    const params = [];
    let i = 1;

    if (search)      { filters.push(`(g.name ILIKE $${i} OR g.description ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (privacy)     { filters.push(`g.privacy = $${i++}`);     params.push(privacy); }
    if (communityId) { filters.push(`g.community_id = $${i++}`); params.push(communityId); }
    if (ownerId)     { filters.push(`g.owner_id = $${i++}`);    params.push(ownerId); }

    let joinMember = "";
    if (memberId) {
        joinMember = `JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $${i++} AND gm.status = 'active'`;
        params.push(memberId);
    }

    const where = `WHERE ${filters.join(" AND ")}`;
    const orderBy = `ORDER BY g.${sort.column} ${sort.direction}`;

    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM groups g ${joinMember} ${where}`,
        params,
    );
    const total = totalRes.rows[0].total;

    const dataRes = await query(
        `SELECT ${GROUP_COLUMNS.replace(/(^|,)\s*/g, "$1g.")}
         FROM groups g ${joinMember} ${where} ${orderBy}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total };
}

async function update(id, fields) {
    const allowed = [
        "name", "description", "photo_url", "banner_url", "privacy", "topic",
        "rules", "tags", "community_id",
        "who_can_post", "who_can_comment", "who_can_invite", "who_can_approve",
    ];
    const sets = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            sets.push(`${key} = $${i++}`);
            values.push(fields[key]);
        }
    }
    if (fields.name !== undefined) {
        sets.push(`slug = $${i++}`);
        values.push(`${slugify(fields.name)}-${Math.random().toString(36).slice(2, 8)}`);
    }
    if (sets.length === 0) return findById(id);
    values.push(id);
    const res = await query(
        `UPDATE groups SET ${sets.join(", ")}
         WHERE id = $${i} AND deleted_at IS NULL
         RETURNING ${GROUP_COLUMNS}`,
        values,
    );
    return res.rows[0] || null;
}

async function softDelete(id) {
    const res = await query(
        `UPDATE groups SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, community_id`,
        [id],
    );
    const row = res.rows[0];
    if (row && row.community_id) {
        await query(
            `UPDATE communities SET groups_count = GREATEST(groups_count - 1, 0) WHERE id = $1`,
            [row.community_id],
        );
    }
    return !!row;
}

// -------------------- MIEMBROS --------------------

async function findMember(groupId, userId) {
    const res = await query(
        `SELECT group_id, user_id, role, status, banned_at, joined_at
         FROM group_members WHERE group_id = $1 AND user_id = $2 LIMIT 1`,
        [groupId, userId],
    );
    return res.rows[0] || null;
}

async function listMembers(groupId, { limit, offset, role, status = "active" }) {
    const filters = ["gm.group_id = $1"];
    const params = [groupId];
    let i = 2;
    if (status) { filters.push(`gm.status = $${i++}`); params.push(status); }
    if (role)   { filters.push(`gm.role = $${i++}`);   params.push(role); }
    const where = `WHERE ${filters.join(" AND ")}`;

    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM group_members gm ${where}`, params);
    const dataRes = await query(
        `SELECT gm.user_id, gm.role, gm.status, gm.joined_at,
                u.username, u.avatar_url, u.first_name, u.last_name
         FROM group_members gm
         JOIN users u ON u.id = gm.user_id
         ${where}
         ORDER BY gm.joined_at ASC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

async function addMember(groupId, userId, role = "member") {
    return withTransaction(async (client) => {
        const res = await client.query(
            `INSERT INTO group_members (group_id, user_id, role, status)
             VALUES ($1, $2, $3, 'active')
             ON CONFLICT (group_id, user_id)
             DO UPDATE SET status = 'active', banned_at = NULL, banned_by = NULL, role = EXCLUDED.role
             RETURNING (xmax = 0) AS inserted`,
            [groupId, userId, role],
        );
        // Recalcular contador de miembros activos (robusto ante upserts).
        await client.query(
            `UPDATE groups SET members_count =
                (SELECT COUNT(*) FROM group_members WHERE group_id = $1 AND status = 'active')
             WHERE id = $1`,
            [groupId],
        );
        return res.rows[0]?.inserted === true;
    });
}

async function removeMember(groupId, userId) {
    return withTransaction(async (client) => {
        const res = await client.query(
            `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING user_id`,
            [groupId, userId],
        );
        if (res.rowCount > 0) {
            await client.query(
                `UPDATE groups SET members_count = GREATEST(members_count - 1, 0) WHERE id = $1`,
                [groupId],
            );
        }
        return res.rowCount > 0;
    });
}

async function setMemberRole(groupId, userId, role) {
    const res = await query(
        `UPDATE group_members SET role = $3
         WHERE group_id = $1 AND user_id = $2 AND status = 'active'
         RETURNING user_id, role`,
        [groupId, userId, role],
    );
    return res.rows[0] || null;
}

async function setBan(groupId, userId, banned, bannedBy = null) {
    return withTransaction(async (client) => {
        let row;
        if (banned) {
            const res = await client.query(
                `UPDATE group_members
                 SET status = 'banned', banned_at = NOW(), banned_by = $3
                 WHERE group_id = $1 AND user_id = $2
                 RETURNING user_id, status`,
                [groupId, userId, bannedBy],
            );
            row = res.rows[0] || null;
        } else {
            const res = await client.query(
                `UPDATE group_members
                 SET status = 'active', banned_at = NULL, banned_by = NULL
                 WHERE group_id = $1 AND user_id = $2
                 RETURNING user_id, status`,
                [groupId, userId],
            );
            row = res.rows[0] || null;
        }
        await client.query(
            `UPDATE groups SET members_count =
                (SELECT COUNT(*) FROM group_members WHERE group_id = $1 AND status = 'active')
             WHERE id = $1`,
            [groupId],
        );
        return row;
    });
}

async function countAdmins(groupId) {
    const res = await query(
        `SELECT COUNT(*)::int AS total FROM group_members
         WHERE group_id = $1 AND status = 'active' AND role IN ('owner','admin')`,
        [groupId],
    );
    return res.rows[0].total;
}

// -------------------- SOLICITUDES --------------------

async function findRequest(groupId, userId, status = "pending") {
    const res = await query(
        `SELECT id, group_id, user_id, message, status, created_at
         FROM group_join_requests
         WHERE group_id = $1 AND user_id = $2 AND status = $3 LIMIT 1`,
        [groupId, userId, status],
    );
    return res.rows[0] || null;
}

async function createRequest(groupId, userId, message = null) {
    const res = await query(
        `INSERT INTO group_join_requests (group_id, user_id, message)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, user_id, status) DO UPDATE SET message = EXCLUDED.message
         RETURNING id, group_id, user_id, message, status, created_at`,
        [groupId, userId, message],
    );
    return res.rows[0];
}

async function decideRequest(groupId, userId, status, decidedBy) {
    const res = await query(
        `UPDATE group_join_requests
         SET status = $3, decided_by = $4, decided_at = NOW()
         WHERE group_id = $1 AND user_id = $2 AND status = 'pending'
         RETURNING id, group_id, user_id, status`,
        [groupId, userId, status, decidedBy],
    );
    return res.rows[0] || null;
}

async function listRequests(groupId, { limit, offset, status = "pending" }) {
    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM group_join_requests WHERE group_id = $1 AND status = $2`,
        [groupId, status],
    );
    const dataRes = await query(
        `SELECT r.id, r.user_id, r.message, r.status, r.created_at,
                u.username, u.avatar_url
         FROM group_join_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.group_id = $1 AND r.status = $2
         ORDER BY r.created_at ASC
         LIMIT $3 OFFSET $4`,
        [groupId, status, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

// -------------------- INVITACIONES --------------------

async function findInvitation(groupId, inviteeId, status = "pending") {
    const res = await query(
        `SELECT id, group_id, inviter_id, invitee_id, status, created_at
         FROM group_invitations
         WHERE group_id = $1 AND invitee_id = $2 AND status = $3 LIMIT 1`,
        [groupId, inviteeId, status],
    );
    return res.rows[0] || null;
}

async function createInvitation(groupId, inviterId, inviteeId) {
    const res = await query(
        `INSERT INTO group_invitations (group_id, inviter_id, invitee_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (group_id, invitee_id, status) DO UPDATE SET inviter_id = EXCLUDED.inviter_id
         RETURNING id, group_id, inviter_id, invitee_id, status, created_at`,
        [groupId, inviterId, inviteeId],
    );
    return res.rows[0];
}

async function consumeInvitation(groupId, inviteeId) {
    const res = await query(
        `UPDATE group_invitations
         SET status = 'accepted', responded_at = NOW()
         WHERE group_id = $1 AND invitee_id = $2 AND status = 'pending'
         RETURNING id`,
        [groupId, inviteeId],
    );
    return res.rowCount > 0;
}

module.exports = {
    slugify,
    create,
    findById,
    list,
    update,
    softDelete,
    findMember,
    listMembers,
    addMember,
    removeMember,
    setMemberRole,
    setBan,
    countAdmins,
    findRequest,
    createRequest,
    decideRequest,
    listRequests,
    findInvitation,
    createInvitation,
    consumeInvitation,
};
