"use strict";

const { query, withTransaction } = require("../database/connection");

const BASE_USER_COLUMNS = `
    u.id, u.username, u.email, u.password_hash,
    u.first_name, u.last_name, u.avatar_url, u.bio, u.phone, u.language,
    u.email_verified, u.is_active, u.last_login_at, u.last_login_ip,
    u.failed_attempts, u.locked_until, u.metadata,
    u.deleted_at, u.created_at, u.updated_at
`;

async function findById(id, { includeDeleted = false } = {}) {
    const res = await query(
        `SELECT ${BASE_USER_COLUMNS}
         FROM users u
         WHERE u.id = $1 ${includeDeleted ? "" : "AND u.deleted_at IS NULL"}
         LIMIT 1`,
        [id],
    );
    return res.rows[0] || null;
}

async function findByEmail(email, { includeDeleted = false } = {}) {
    const res = await query(
        `SELECT ${BASE_USER_COLUMNS}
         FROM users u
         WHERE LOWER(u.email) = LOWER($1) ${includeDeleted ? "" : "AND u.deleted_at IS NULL"}
         LIMIT 1`,
        [email],
    );
    return res.rows[0] || null;
}

async function findByUsername(username, { includeDeleted = false } = {}) {
    const res = await query(
        `SELECT ${BASE_USER_COLUMNS}
         FROM users u
         WHERE LOWER(u.username) = LOWER($1) ${includeDeleted ? "" : "AND u.deleted_at IS NULL"}
         LIMIT 1`,
        [username],
    );
    return res.rows[0] || null;
}

async function existsByEmailOrUsername(email, username) {
    const res = await query(
        `SELECT
             MAX(CASE WHEN LOWER(email)    = LOWER($1) THEN 1 ELSE 0 END) AS email_taken,
             MAX(CASE WHEN LOWER(username) = LOWER($2) THEN 1 ELSE 0 END) AS username_taken
         FROM users
         WHERE deleted_at IS NULL AND (LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2))`,
        [email, username],
    );
    const row = res.rows[0] || {};
    return {
        emailTaken: Number(row.email_taken) === 1,
        usernameTaken: Number(row.username_taken) === 1,
    };
}

async function create({ username, email, passwordHash, firstName, lastName, language = "es" }) {
    const res = await query(
        `INSERT INTO users
         (username, email, password_hash, first_name, last_name, language)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${BASE_USER_COLUMNS}`,
        [username, email.toLowerCase(), passwordHash, firstName || null, lastName || null, language],
    );
    return res.rows[0];
}

async function updateProfile(id, fields) {
    // Whitelist de campos actualizables desde el perfil.
    const allowed = ["first_name", "last_name", "bio", "phone", "language", "avatar_url"];
    const sets = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
        if (fields[key] !== undefined) {
            sets.push(`${key} = $${i++}`);
            values.push(fields[key]);
        }
    }
    if (sets.length === 0) return findById(id);
    values.push(id);
    const res = await query(
        `UPDATE users SET ${sets.join(", ")}
         WHERE id = $${i} AND deleted_at IS NULL
         RETURNING ${BASE_USER_COLUMNS}`,
        values,
    );
    return res.rows[0] || null;
}

async function updatePassword(id, passwordHash) {
    await query(
        `UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL
         WHERE id = $2`,
        [passwordHash, id],
    );
}

async function markEmailVerified(id) {
    await query(
        `UPDATE users SET email_verified = TRUE WHERE id = $1`,
        [id],
    );
}

async function updateLoginSuccess(id, ip) {
    await query(
        `UPDATE users
            SET last_login_at   = NOW(),
                last_login_ip   = $2,
                failed_attempts = 0,
                locked_until    = NULL
         WHERE id = $1`,
        [id, ip || null],
    );
}

async function incrementFailedAttempts(id) {
    const res = await query(
        `UPDATE users
            SET failed_attempts = failed_attempts + 1,
                locked_until = CASE
                    WHEN failed_attempts + 1 >= 5 THEN NOW() + INTERVAL '15 minutes'
                    ELSE locked_until
                END
         WHERE id = $1
         RETURNING failed_attempts, locked_until`,
        [id],
    );
    return res.rows[0];
}

async function softDelete(id) {
    await query(
        `UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = $1`,
        [id],
    );
}

async function restore(id) {
    await query(
        `UPDATE users SET deleted_at = NULL, is_active = TRUE WHERE id = $1`,
        [id],
    );
}

async function findRoles(userId) {
    const res = await query(
        `SELECT r.name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1
         ORDER BY r.level DESC`,
        [userId],
    );
    return res.rows.map(r => r.name);
}

async function assignRole(userId, roleName, assignedBy = null) {
    return withTransaction(async (client) => {
        const roleRes = await client.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
        if (roleRes.rowCount === 0) return false;
        await client.query(
            `INSERT INTO user_roles (user_id, role_id, assigned_by)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [userId, roleRes.rows[0].id, assignedBy],
        );
        return true;
    });
}

async function removeRole(userId, roleName) {
    const res = await query(
        `DELETE FROM user_roles
         WHERE user_id = $1
           AND role_id = (SELECT id FROM roles WHERE name = $2)`,
        [userId, roleName],
    );
    return res.rowCount > 0;
}

async function setRoles(userId, roleNames = [], assignedBy = null) {
    await withTransaction(async (client) => {
        await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        if (roleNames.length === 0) return;
        const roleRes = await client.query(
            `SELECT id, name FROM roles WHERE name = ANY($1::text[])`,
            [roleNames],
        );
        for (const r of roleRes.rows) {
            await client.query(
                `INSERT INTO user_roles (user_id, role_id, assigned_by)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [userId, r.id, assignedBy],
            );
        }
    });
}

async function list({ page, limit, offset, search, role, isActive, includeDeleted, sort }) {
    const filters = [];
    const params = [];
    let i = 1;

    if (!includeDeleted) filters.push("u.deleted_at IS NULL");

    if (search) {
        filters.push(`(
            LOWER(u.username)  LIKE LOWER($${i}) OR
            LOWER(u.email)     LIKE LOWER($${i}) OR
            LOWER(COALESCE(u.first_name,'')) LIKE LOWER($${i}) OR
            LOWER(COALESCE(u.last_name,''))  LIKE LOWER($${i})
        )`);
        params.push(`%${search}%`);
        i++;
    }
    if (typeof isActive === "boolean") {
        filters.push(`u.is_active = $${i++}`);
        params.push(isActive);
    }
    if (role) {
        filters.push(`EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = u.id AND r.name = $${i++}
        )`);
        params.push(role);
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const orderBy = `ORDER BY u.${sort.column} ${sort.direction}`;

    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM users u ${where}`,
        params,
    );
    const total = totalRes.rows[0].total;

    const dataRes = await query(
        `SELECT ${BASE_USER_COLUMNS},
                COALESCE(ARRAY(
                    SELECT r.name FROM user_roles ur
                    JOIN roles r ON r.id = ur.role_id
                    WHERE ur.user_id = u.id
                    ORDER BY r.level DESC
                ), ARRAY[]::text[]) AS roles
         FROM users u
         ${where}
         ${orderBy}
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset],
    );
    return { rows: dataRes.rows, total };
}

async function stats() {
    const res = await query(`
        SELECT
            COUNT(*)                                          FILTER (WHERE deleted_at IS NULL) AS active_total,
            COUNT(*)                                          FILTER (WHERE deleted_at IS NOT NULL) AS deleted_total,
            COUNT(*)                                          FILTER (WHERE email_verified = TRUE AND deleted_at IS NULL) AS verified_total,
            COUNT(*)                                          FILTER (WHERE created_at >= NOW() - INTERVAL '30 days' AND deleted_at IS NULL) AS last_30_days,
            COUNT(*)                                          FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'  AND deleted_at IS NULL) AS last_7_days
        FROM users
    `);
    return res.rows[0];
}

module.exports = {
    findById,
    findByEmail,
    findByUsername,
    existsByEmailOrUsername,
    create,
    updateProfile,
    updatePassword,
    markEmailVerified,
    updateLoginSuccess,
    incrementFailedAttempts,
    softDelete,
    restore,
    findRoles,
    assignRole,
    removeRole,
    setRoles,
    list,
    stats,
};
