"use strict";

const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const crypto = require("crypto");

const mediaRepo = require("../repositories/mediaRepository");
const taxonomyRepo = require("../repositories/taxonomyRepository");
const userRepo = require("../repositories/userRepository");
const MediaFile = require("../models/MediaFile");
const {
    NotFoundError, BadRequestError, ForbiddenError,
} = require("../utils/AppError");
const { parsePagination, buildPaginationMeta, parseSort } = require("../utils/pagination");
const {
    classifyKind, extractImageMeta, generateImageThumbnail,
    ffprobe, generateVideoThumbnail, inferQuality,
} = require("../utils/fileMeta");
const { hasRoleLevel, ROLES } = require("../config/roles");
const env = require("../config/env");
const cache = require("../utils/cache");
const logger = require("../utils/logger");

const MEDIA_SORT_FIELDS = ["created_at", "updated_at", "title", "views_count", "downloads_count", "size_bytes"];
const CACHE_PREFIX = "media:";

function invalidateMediaCache() {
    cache.delByPrefix(CACHE_PREFIX);
}

function keyForList(filters) {
    const raw = JSON.stringify(filters);
    return CACHE_PREFIX + "list:" + crypto.createHash("md5").update(raw).digest("hex");
}

/**
 * Toma un archivo recién subido por Multer y crea el registro completo.
 */
async function uploadFile({ user, file, body }) {
    if (!file) throw new BadRequestError("Debes adjuntar un archivo en el campo `file`.");

    const kindHint = body.kind || null;
    const kind = classifyKind(file.mimetype, kindHint);
    const storagePath = path.relative(
        path.resolve(process.cwd(), env.STORAGE_ROOT),
        file.path,
    ).split(path.sep).join("/");

    let width = null, height = null;
    let durationSeconds = null;
    let quality = null;
    let thumbnailRelative = null;
    let extraMeta = {};

    try {
        if (kind === "image") {
            const meta = await extractImageMeta(file.path);
            width = meta.width || null;
            height = meta.height || null;
            extraMeta = { format: meta.format, orientation: meta.orientation, channels: meta.channels };
            quality = inferQuality({ height });
            thumbnailRelative = await generateImageThumbnail(file.path, file.filename);
        } else if (kind === "video" || kind === "audio" || kind === "podcast") {
            const meta = await ffprobe(file.path);
            durationSeconds = meta.durationSeconds || null;
            width = meta.width || null;
            height = meta.height || null;
            extraMeta = {
                bitRate: meta.bitRate,
                videoCodec: meta.videoCodec,
                audioCodec: meta.audioCodec,
                sampleRate: meta.sampleRate,
                channels: meta.channels,
                formatName: meta.formatName,
            };
            quality = inferQuality({ height, bitRate: meta.bitRate });
            if (kind === "video") {
                thumbnailRelative = await generateVideoThumbnail(file.path, file.filename);
            }
        }
    } catch (err) {
        logger.warn("[media] No se pudieron extraer todos los metadatos", { err: err.message });
    }

    let tagIds = [];
    if (body.tags) {
        let arr = body.tags;
        if (typeof arr === "string") {
            try { arr = JSON.parse(arr); } catch (_) { arr = arr.split(",").map(s => s.trim()); }
        }
        if (Array.isArray(arr) && arr.length) {
            const tags = await taxonomyRepo.upsertTagsByName(arr);
            tagIds = tags.map(t => t.id);
        }
    }

    const created = await mediaRepo.create({
        ownerId: user.id,
        categoryId: body.categoryId || null,
        title: body.title,
        description: body.description || null,
        language: body.language || "es",
        author: body.author || null,
        kind,
        mimeType: file.mimetype,
        format: (path.extname(file.originalname || "") || "").replace(".", "").toLowerCase() || null,
        sizeBytes: file.size,
        durationSeconds,
        quality,
        width, height,
        storagePath,
        fileUrl: storagePath, // el modelo lo convierte a URL absoluta
        thumbnailUrl: thumbnailRelative || null,
        coverUrl: body.coverUrl || null,
        bannerUrl: body.bannerUrl || null,
        status: body.status || "published",
        isPublic: body.isPublic !== "false" && body.isPublic !== false,
        metadata: {
            originalName: file.originalname,
            ...extraMeta,
            ...(typeof body.metadata === "object" ? body.metadata : {}),
        },
    });

    if (tagIds.length) {
        await mediaRepo.attachTags(created.id, tagIds);
    }

    invalidateMediaCache();
    const tagsRes = await mediaRepo.getTags(created.id);
    return MediaFile.toPublicDTO(created, { tags: tagsRes.map(t => t.name) });
}

async function list({ query, viewer }) {
    const { page, limit, offset } = parsePagination(query);
    const sort = parseSort(query, MEDIA_SORT_FIELDS, "created_at", "DESC");

    let isPublic;
    if (query.isPublic === "true")  isPublic = true;
    if (query.isPublic === "false") isPublic = false;

    const viewerCanSeePrivate = viewer && viewer.roles && viewer.roles.some(
        r => hasRoleLevel(r, ROLES.MODERATOR),
    );

    const filters = {
        page, limit, offset, sort,
        search: query.search || query.q,
        kind: query.kind,
        categoryId: query.categoryId,
        ownerId: query.ownerId,
        status: query.status,
        isPublic,
        tag: query.tag,
        includeDeleted: query.includeDeleted === "true" && viewerCanSeePrivate,
        viewerId: viewer?.id,
        viewerCanSeePrivate,
    };

    const cacheKey = keyForList(filters);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const { rows, total } = await mediaRepo.list(filters);
    const payload = {
        data: rows.map(r => MediaFile.toPublicDTO(r, { tags: r.tags || [] })),
        pagination: buildPaginationMeta(page, limit, total),
    };
    cache.set(cacheKey, payload);
    return payload;
}

async function getById({ id, viewer, incrementViews = true }) {
    const cacheKey = `${CACHE_PREFIX}item:${id}`;
    let row = cache.get(cacheKey);
    if (!row) {
        row = await mediaRepo.findById(id);
        if (!row) throw new NotFoundError("Archivo multimedia no encontrado.");
        cache.set(cacheKey, row, 60);
    }

    // Control de visibilidad
    const viewerCanSeePrivate = viewer && viewer.roles && viewer.roles.some(
        r => hasRoleLevel(r, ROLES.MODERATOR),
    );
    if (!row.is_public && (!viewer || (viewer.id !== row.owner_id && !viewerCanSeePrivate))) {
        throw new ForbiddenError("Este archivo no es público.");
    }

    if (incrementViews) {
        mediaRepo.incrementViews(id).catch(() => {});
    }
    const tags = await mediaRepo.getTags(id);
    return MediaFile.toPublicDTO(row, { tags: tags.map(t => t.name) });
}

async function update({ id, viewer, body }) {
    const existing = await mediaRepo.findById(id);
    if (!existing) throw new NotFoundError("Archivo multimedia no encontrado.");

    const isOwner = existing.owner_id === viewer.id;
    const isMod = viewer.roles.some(r => hasRoleLevel(r, ROLES.MODERATOR));
    if (!isOwner && !isMod) throw new ForbiddenError("No puedes modificar este archivo.");

    const updates = {};
    if (body.title !== undefined)       updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.language !== undefined)    updates.language = body.language;
    if (body.author !== undefined)      updates.author = body.author;
    if (body.categoryId !== undefined)  updates.category_id = body.categoryId || null;
    if (body.coverUrl !== undefined)    updates.cover_url = body.coverUrl;
    if (body.bannerUrl !== undefined)   updates.banner_url = body.bannerUrl;
    if (body.thumbnailUrl !== undefined) updates.thumbnail_url = body.thumbnailUrl;
    if (body.quality !== undefined)     updates.quality = body.quality;
    if (body.isPublic !== undefined)    updates.is_public = !!body.isPublic;
    if (body.status !== undefined)      updates.status = body.status;
    if (body.metadata && typeof body.metadata === "object") {
        updates.metadata = { ...(existing.metadata || {}), ...body.metadata };
    }

    const updated = await mediaRepo.updateFields(id, updates);

    // Manejo de tags
    if (Array.isArray(body.tags)) {
        const tags = await taxonomyRepo.upsertTagsByName(body.tags);
        await mediaRepo.replaceTags(id, tags.map(t => t.id));
    }

    invalidateMediaCache();
    const tags = await mediaRepo.getTags(id);
    return MediaFile.toPublicDTO(updated, { tags: tags.map(t => t.name) });
}

async function remove({ id, viewer }) {
    const existing = await mediaRepo.findById(id);
    if (!existing) throw new NotFoundError("Archivo multimedia no encontrado.");
    const isOwner = existing.owner_id === viewer.id;
    const isMod = viewer.roles.some(r => hasRoleLevel(r, ROLES.MODERATOR));
    if (!isOwner && !isMod) throw new ForbiddenError("No puedes eliminar este archivo.");

    await mediaRepo.softDelete(id);
    invalidateMediaCache();
    return true;
}

async function restore({ id }) {
    const existing = await mediaRepo.findById(id, { includeDeleted: true });
    if (!existing) throw new NotFoundError("Archivo multimedia no encontrado.");
    await mediaRepo.restore(id);
    invalidateMediaCache();
    return true;
}

async function hardDelete({ id, viewer }) {
    const existing = await mediaRepo.findById(id, { includeDeleted: true });
    if (!existing) throw new NotFoundError("Archivo multimedia no encontrado.");
    const isMod = viewer.roles.some(r => hasRoleLevel(r, ROLES.ADMIN));
    if (!isMod) throw new ForbiddenError("Solo un administrador puede eliminar definitivamente.");

    // Elimina físicamente el archivo del disco si existe
    try {
        const absPath = path.resolve(process.cwd(), env.STORAGE_ROOT, existing.storage_path);
        await fsp.unlink(absPath).catch(() => {});
    } catch (_) { /* silencioso */ }

    await mediaRepo.hardDelete(id);
    invalidateMediaCache();
    return true;
}

async function stats() {
    return mediaRepo.stats();
}

async function registerDownload(id) {
    await mediaRepo.incrementDownloads(id);
}

module.exports = {
    uploadFile,
    list,
    getById,
    update,
    remove,
    restore,
    hardDelete,
    stats,
    registerDownload,
};
