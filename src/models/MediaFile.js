"use strict";

const env = require("../config/env");

/**
 * Convierte una ruta relativa dentro de storage a URL pública.
 * Está montado bajo /files/ en app.js.
 */
function toPublicUrl(relPath) {
    if (!relPath) return null;
    // Ya es una URL absoluta
    if (/^https?:\/\//i.test(relPath)) return relPath;
    const cleaned = relPath.replace(/^\/+/, "");
    return `${env.APP_URL.replace(/\/+$/, "")}/files/${cleaned}`;
}

function toPublicDTO(row, extra = {}) {
    if (!row) return null;
    return {
        id: row.id,
        ownerId: row.owner_id,
        categoryId: row.category_id,
        title: row.title,
        description: row.description,
        language: row.language,
        author: row.author,
        kind: row.kind,
        mimeType: row.mime_type,
        format: row.format,
        sizeBytes: Number(row.size_bytes),
        durationSeconds: row.duration_seconds !== null ? Number(row.duration_seconds) : null,
        quality: row.quality,
        width: row.width,
        height: row.height,
        fileUrl: toPublicUrl(row.file_url),
        thumbnailUrl: toPublicUrl(row.thumbnail_url),
        coverUrl: toPublicUrl(row.cover_url),
        bannerUrl: toPublicUrl(row.banner_url),
        status: row.status,
        isPublic: row.is_public,
        viewsCount: Number(row.views_count || 0),
        downloadsCount: Number(row.downloads_count || 0),
        tags: extra.tags || row.tags || [],
        metadata: row.metadata || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    };
}

module.exports = { toPublicDTO, toPublicUrl };
