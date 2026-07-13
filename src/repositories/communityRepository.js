"use strict";

const { query, withTransaction } = require("../database/connection");
const { slugify } = require("./groupRepository");

const COMMUNITY_COLUMNS = `
    id, founder_id, name, slug, description, icon_url, banner_url,
    privacy, rules, tags, categories, members_count, groups_count,
    metadata, created_at, updated_at
`;

// -------------------- COMUNIDADES --------------------

async function create({ founderId, name, description = null, privacy = "public", rules = null, tags = [], categories = [] }) {
    const slug = `${slugify(name)}-${Math.random().toString(36).slice(2, 8)}`;
    return withTransaction(async (client) => {
        const res = await client.query(
            `INSERT INTO communities (founder_id, name, slug, description, privacy, rules, tags, categories)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING ${COMMUNITY_COLUMNS}`,
            [founderId, name, slug, description, privacy, rules, tags, categories],
        );
        const community = res.rows[0];
        await client.query(
            `INSERT INTO community_members (community_id, user_id, role, status)
             VALUES ($1, $2, 'founder', 'active')`,
            [community.id, founderId],
        );
        await client.query(`UPDATE communities SET members_count = 1 WHERE id = $1`, [community.id]);
        community.members_count = 1;
        return community;
    });
}

async function findById(id) {
    const res = await query(
        `SELECT ${COMMUNITY_COLUMNS} FROM communities WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
        [id],
    );
    return res.rows[0] || null;
}

async function list({ limit, offset, sort, search, privacy, memberId }) {
    const filters = ["c.deleted_at IS NULL"];
    const params = [];
    let i = 1;

    if (search)  { filters.push(`(c.name ILIKE $${i} OR c.description ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (privacy) { filters.push(`c.privacy = $${i++}`); params.push(privacy); }

    let joinMember = "";
    if (memberId) {
        joinMember = `JOIN community_members cm ON cm.community_id = c.id AND cm.user_id = $${i++} AND cm.status = 'active'`;
        params.push(memberId);
    }

    const where = `WHERE ${filters.join(" AND ")}`;
    const orderBy = `ORDER BY c.${sort.column} ${sort.direction}`;

    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM communities c ${joinMember} ${where}`,
        params,
    );
    const dataRes = await query(
        `SELECT ${COMMUNITY_COLUMNS.replace(/(^|,)\s*/g, "$1c.")}
         FROM communities c ${joinMember} ${where} ${orderBy}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

async function update(id, fields) {
    const allowed = [
        "name", "description", "icon_url", "banner_url", "privacy",
        "rules", "tags", "categories",
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
        `UPDATE communities SET ${sets.join(", ")}
         WHERE id = $${i} AND deleted_at IS NULL
         RETURNING ${COMMUNITY_COLUMNS}`,
        values,
    );
    return res.rows[0] || null;
}

async function softDelete(id) {
    const res = await query(
        `UPDATE communities SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id],
    );
    return res.rowCount > 0;
}

// -------------------- MIEMBROS --------------------

async function findMember(communityId, userId) {
    const res = await query(
        `SELECT community_id, user_id, role, status, joined_at
         FROM community_members WHERE community_id = $1 AND user_id = $2 LIMIT 1`,
        [communityId, userId],
    );
    return res.rows[0] || null;
}

async function listMembers(communityId, { limit, offset, role, status = "active" }) {
    const filters = ["cm.community_id = $1"];
    const params = [communityId];
    let i = 2;
    if (status) { filters.push(`cm.status = $${i++}`); params.push(status); }
    if (role)   { filters.push(`cm.role = $${i++}`);   params.push(role); }
    const where = `WHERE ${filters.join(" AND ")}`;

    const totalRes = await query(`SELECT COUNT(*)::int AS total FROM community_members cm ${where}`, params);
    const dataRes = await query(
        `SELECT cm.user_id, cm.role, cm.status, cm.joined_at,
                u.username, u.avatar_url
         FROM community_members cm
         JOIN users u ON u.id = cm.user_id
         ${where}
         ORDER BY cm.joined_at ASC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

async function addMember(communityId, userId, role = "member") {
    return withTransaction(async (client) => {
        const res = await client.query(
            `INSERT INTO community_members (community_id, user_id, role, status)
             VALUES ($1, $2, $3, 'active')
             ON CONFLICT (community_id, user_id)
             DO UPDATE SET status = 'active', role = EXCLUDED.role
             RETURNING (xmax = 0) AS inserted`,
            [communityId, userId, role],
        );
        await client.query(
            `UPDATE communities SET members_count =
                (SELECT COUNT(*) FROM community_members WHERE community_id = $1 AND status = 'active')
             WHERE id = $1`,
            [communityId],
        );
        return res.rows[0]?.inserted === true;
    });
}

async function removeMember(communityId, userId) {
    return withTransaction(async (client) => {
        const res = await client.query(
            `DELETE FROM community_members WHERE community_id = $1 AND user_id = $2 RETURNING user_id`,
            [communityId, userId],
        );
        if (res.rowCount > 0) {
            await client.query(
                `UPDATE communities SET members_count = GREATEST(members_count - 1, 0) WHERE id = $1`,
                [communityId],
            );
        }
        return res.rowCount > 0;
    });
}

async function setMemberStatus(communityId, userId, status) {
    return withTransaction(async (client) => {
        const res = await client.query(
            `UPDATE community_members SET status = $3
             WHERE community_id = $1 AND user_id = $2
             RETURNING user_id, status`,
            [communityId, userId, status],
        );
        await client.query(
            `UPDATE communities SET members_count =
                (SELECT COUNT(*) FROM community_members WHERE community_id = $1 AND status = 'active')
             WHERE id = $1`,
            [communityId],
        );
        return res.rows[0] || null;
    });
}

async function setMemberRole(communityId, userId, role) {
    const res = await query(
        `UPDATE community_members SET role = $3
         WHERE community_id = $1 AND user_id = $2 AND status = 'active'
         RETURNING user_id, role`,
        [communityId, userId, role],
    );
    return res.rows[0] || null;
}

// -------------------- INVITACIONES --------------------

async function createInvitation(communityId, inviterId, inviteeId) {
    const res = await query(
        `INSERT INTO community_invitations (community_id, inviter_id, invitee_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (community_id, invitee_id, status) DO UPDATE SET inviter_id = EXCLUDED.inviter_id
         RETURNING id, community_id, inviter_id, invitee_id, status, created_at`,
        [communityId, inviterId, inviteeId],
    );
    return res.rows[0];
}

// -------------------- GRUPOS DE LA COMUNIDAD --------------------

async function listGroups(communityId, { limit, offset }) {
    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM groups WHERE community_id = $1 AND deleted_at IS NULL`,
        [communityId],
    );
    const dataRes = await query(
        `SELECT id, owner_id, name, slug, description, photo_url, banner_url,
                privacy, topic, members_count, posts_count, created_at
         FROM groups
         WHERE community_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [communityId, limit, offset],
    );
    return { rows: dataRes.rows, total: totalRes.rows[0].total };
}

// -------------------- ESTADÍSTICAS --------------------

async function stats(communityId) {
    const res = await query(
        `SELECT
            (SELECT COUNT(*) FROM community_members WHERE community_id = $1 AND status = 'active')::int AS members,
            (SELECT COUNT(*) FROM community_members WHERE community_id = $1 AND status = 'active' AND role IN ('founder','admin'))::int AS admins,
            (SELECT COUNT(*) FROM groups WHERE community_id = $1 AND deleted_at IS NULL)::int AS groups,
            (SELECT COUNT(*) FROM group_posts p JOIN groups g ON g.id = p.group_id
               WHERE g.community_id = $1 AND p.deleted_at IS NULL)::int AS posts,
            (SELECT COUNT(*) FROM group_posts p JOIN groups g ON g.id = p.group_id
               WHERE g.community_id = $1 AND p.deleted_at IS NULL
               AND p.created_at >= NOW() - INTERVAL '7 days')::int AS posts_last_week,
            (SELECT COUNT(*) FROM community_members
               WHERE community_id = $1 AND status = 'active'
               AND joined_at >= NOW() - INTERVAL '7 days')::int AS members_last_week`,
        [communityId],
    );
    return res.rows[0];
}

async function recentPosts(communityId, { limit = 5 } = {}) {
    const res = await query(
        `SELECT p.id, p.group_id, p.author_id, p.type, p.body, p.created_at,
                g.name AS group_name, u.username AS author_username
         FROM group_posts p
         JOIN groups g ON g.id = p.group_id
         JOIN users u ON u.id = p.author_id
         WHERE g.community_id = $1 AND p.deleted_at IS NULL AND p.status = 'published'
         ORDER BY p.created_at DESC
         LIMIT $2`,
        [communityId, limit],
    );
    return res.rows;
}

module.exports = {
    create,
    findById,
    list,
    update,
    softDelete,
    findMember,
    listMembers,
    addMember,
    removeMember,
    setMemberStatus,
    setMemberRole,
    createInvitation,
    listGroups,
    stats,
    recentPosts,
};
