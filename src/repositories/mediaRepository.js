"use strict";

const { query, withTransaction } = require("../database/connection");

const BASE_COLUMNS = `
    m.id, m.owner_id, m.category_id,
    m.title, m.description, m.language, m.author,
    m.kind, m.mime_type, m.format, m.size_bytes, m.duration_seconds,
    m.quality, m.width, m.height,
    m.storage_path, m.file_url, m.thumbnail_url, m.cover_url, m.banner_url,
    m.status, m.is_public, m.views_count, m.downloads_count,
    m.metadata, m.deleted_at, m.created_at, m.updated_at
`;

async function create(data) {
    const res = await query(
        `INSERT INTO media_files
         (owner_id, category_id, title, description, language, author,
          kind, mime_type, format, size_bytes, duration_seconds, quality,
          width, height, storage_path, file_url, thumbnail_url, cover_url,
          banner_url, status, is_public, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING ${BASE_COLUMNS}`,
        [
            data.ownerId, data.categoryId || null, data.title, data.description || null,
            data.language || "es", data.author || null,
            data.kind, data.mimeType, data.format || null, data.sizeBytes,
            data.durationSeconds || null, data.quality || null,
            data.width || null, data.height || null,
            data.storagePath, data.fileUrl, data.thumbnailUrl || null,
            data.coverUrl || null, data.bannerUrl || null,
            data.status || "published",
            data.isPublic !== false,
            data.metadata || {},
        ],
    );
    return res.rows[0];
}

async function findById(id, { includeDeleted = false } = {}) {
    const res = await query(
        `SELECT ${BASE_COLUMNS}
         FROM media_files m
         WHERE m.id = $1 ${includeDeleted ? "" : "AND m.deleted_at IS NULL"}
         LIMIT 1`,
        [id],
    );
    return res.rows[0] || null;
}

async function updateFields(id, fields) {
    const allowed = [
        "title", "description", "language", "author",
        "category_id", "status", "is_public",
        "cover_url", "banner_url", "thumbnail_url",
        "quality", "metadata",
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
    if (sets.length === 0) return findById(id);
    values.push(id);
    const res = await query(
        `UPDATE media_files
            SET ${sets.join(", ")}
          WHERE id = $${i} AND deleted_at IS NULL
          RETURNING ${BASE_COLUMNS}`,
        values,
    );
    return res.rows[0] || null;
}

async function softDelete(id) {
    const res = await query(
        `UPDATE media_files SET deleted_at = NOW(), status = 'archived'
         WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id],
    );
    return res.rowCount > 0;
}

async function restore(id) {
    const res = await query(
        `UPDATE media_files SET deleted_at = NULL, status = 'published'
         WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
        [id],
    );
    return res.rowCount > 0;
}

async function hardDelete(id) {
    const res = await query(`DELETE FROM media_files WHERE id = $1 RETURNING id`, [id]);
    return res.rowCount > 0;
}

async function incrementViews(id) {
    await query(`UPDATE media_files SET views_count = views_count + 1 WHERE id = $1`, [id]);
}

async function incrementDownloads(id) {
    await query(`UPDATE media_files SET downloads_count = downloads_count + 1 WHERE id = $1`, [id]);
}

/**
 * Listado avanzado con filtros, búsqueda y paginación.
 *
 * @param {object} opts
 *   page, limit, offset, sort,
 *   search, kind, categoryId, ownerId, status, isPublic,
 *   tag (slug), includeDeleted, viewerId (para restringir privados)
 */
async function list(opts) {
    const {
        page, limit, offset, sort,
        search, kind, categoryId, ownerId, status, isPublic,
        tag, includeDeleted = false, viewerId, viewerCanSeePrivate = false,
    } = opts;

    const filters = [];
    const params = [];
    let i = 1;

    if (!includeDeleted) filters.push("m.deleted_at IS NULL");
    if (search) {
        filters.push(`(
            LOWER(m.title)               LIKE LOWER($${i}) OR
            LOWER(COALESCE(m.description,'')) LIKE LOWER($${i}) OR
            LOWER(COALESCE(m.author,''))      LIKE LOWER($${i})
        )`);
        params.push(`%${search}%`);
        i++;
    }
    if (kind)       { filters.push(`m.kind = $${i++}`);        params.push(kind); }
    if (categoryId) { filters.push(`m.category_id = $${i++}`); params.push(categoryId); }
    if (ownerId)    { filters.push(`m.owner_id = $${i++}`);    params.push(ownerId); }
    if (status)     { filters.push(`m.status = $${i++}`);      params.push(status); }
    if (typeof isPublic === "boolean") {
        filters.push(`m.is_public = $${i++}`); params.push(isPublic);
    }
    if (tag) {
        filters.push(`EXISTS (
            SELECT 1 FROM media_file_tags mft
            JOIN media_tags t ON t.id = mft.tag_id
            WHERE mft.media_file_id = m.id AND t.slug = $${i}
        )`);
        params.push(tag);
        i++;
    }

    // Visibilidad: no listar privados que no sean del propio viewer, salvo admin/mod.
    if (!viewerCanSeePrivate) {
        if (viewerId) {
            filters.push(`(m.is_public = TRUE OR m.owner_id = $${i++})`);
            params.push(viewerId);
        } else {
            filters.push(`m.is_public = TRUE`);
        }
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const orderBy = `ORDER BY m.${sort.column} ${sort.direction}`;

    const totalRes = await query(
        `SELECT COUNT(*)::int AS total FROM media_files m ${where}`,
        params,
    );
    const total = totalRes.rows[0].total;

    const dataRes = await query(
        `SELECT ${BASE_COLUMNS},
                COALESCE(ARRAY(
                    SELECT t.name FROM media_file_tags mft
                    JOIN media_tags t ON t.id = mft.tag_id
                    WHERE mft.media_file_id = m.id
                    ORDER BY t.name
                ), ARRAY[]::text[]) AS tags
         FROM media_files m
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
            COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'image')    AS total_images,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'video')    AS total_videos,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'audio')    AS total_audio,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'podcast')  AS total_podcasts,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'document') AS total_documents,
            COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'other')    AS total_other,
            COALESCE(SUM(size_bytes) FILTER (WHERE deleted_at IS NULL), 0)::bigint AS total_bytes,
            COALESCE(SUM(views_count) FILTER (WHERE deleted_at IS NULL), 0)::bigint AS total_views,
            COALESCE(SUM(downloads_count) FILTER (WHERE deleted_at IS NULL), 0)::bigint AS total_downloads
        FROM media_files
    `);
    return res.rows[0];
}

async function attachTags(mediaId, tagIds = []) {
    if (tagIds.length === 0) return;
    await withTransaction(async (client) => {
        for (const tagId of tagIds) {
            await client.query(
                `INSERT INTO media_file_tags (media_file_id, tag_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [mediaId, tagId],
            );
            await client.query(
                `UPDATE media_tags SET usage_count = usage_count + 1 WHERE id = $1`,
                [tagId],
            );
        }
    });
}

async function replaceTags(mediaId, tagIds = []) {
    await withTransaction(async (client) => {
        const current = await client.query(
            `SELECT tag_id FROM media_file_tags WHERE media_file_id = $1`,
            [mediaId],
        );
        const currentIds = current.rows.map(r => r.tag_id);
        const toRemove = currentIds.filter(id => !tagIds.includes(id));
        const toAdd = tagIds.filter(id => !currentIds.includes(id));

        if (toRemove.length) {
            await client.query(
                `DELETE FROM media_file_tags
                  WHERE media_file_id = $1 AND tag_id = ANY($2::uuid[])`,
                [mediaId, toRemove],
            );
            await client.query(
                `UPDATE media_tags SET usage_count = GREATEST(usage_count - 1, 0)
                  WHERE id = ANY($1::uuid[])`,
                [toRemove],
            );
        }
        for (const tagId of toAdd) {
            await client.query(
                `INSERT INTO media_file_tags (media_file_id, tag_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [mediaId, tagId],
            );
            await client.query(
                `UPDATE media_tags SET usage_count = usage_count + 1 WHERE id = $1`,
                [tagId],
            );
        }
    });
}

async function getTags(mediaId) {
    const res = await query(
        `SELECT t.id, t.name, t.slug
         FROM media_file_tags mft
         JOIN media_tags t ON t.id = mft.tag_id
         WHERE mft.media_file_id = $1
         ORDER BY t.name`,
        [mediaId],
    );
    return res.rows;
}

module.exports = {
    create,
    findById,
    updateFields,
    softDelete,
    restore,
    hardDelete,
    incrementViews,
    incrementDownloads,
    list,
    stats,
    attachTags,
    replaceTags,
    getTags,
};
