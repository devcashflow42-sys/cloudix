"use strict";

const notificationRepo = require("../repositories/notificationRepository");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const logger = require("../utils/logger");

/**
 * Tipos de notificación soportados por el módulo de grupos/comunidades.
 */
const TYPES = Object.freeze({
    POST_CREATED: "post_created",
    JOIN_REQUEST: "join_request",
    REQUEST_APPROVED: "request_approved",
    REQUEST_REJECTED: "request_rejected",
    GROUP_INVITE: "group_invite",
    COMMUNITY_INVITE: "community_invite",
    NEW_ADMIN: "new_admin",
    EVENT_CREATED: "event_created",
    ANNOUNCEMENT: "announcement",
    BANNED: "banned",
});

/**
 * Emite una notificación a un único destinatario. Nunca lanza:
 * notificar es un efecto secundario y no debe tumbar la operación principal.
 */
async function notify(recipientId, payload) {
    if (!recipientId) return null;
    try {
        return await notificationRepo.create({ recipientId, ...payload });
    } catch (err) {
        logger.warn("No se pudo crear la notificación", { err: err.message, type: payload?.type });
        return null;
    }
}

/**
 * Emite la misma notificación a varios destinatarios (fan-out).
 */
async function notifyMany(recipientIds, payload) {
    const ids = (recipientIds || []).filter(id => id && id !== payload.actorId);
    if (ids.length === 0) return 0;
    try {
        return await notificationRepo.createMany(ids, payload);
    } catch (err) {
        logger.warn("No se pudo crear notificaciones en lote", { err: err.message, type: payload?.type });
        return 0;
    }
}

async function list(userId, query) {
    const { page, limit, offset } = parsePagination(query);
    const unreadOnly = query.unread === "true" || query.unreadOnly === "true";
    const { rows, total } = await notificationRepo.listForUser(userId, { limit, offset, unreadOnly });
    return { data: rows, pagination: buildPaginationMeta(page, limit, total) };
}

async function markRead(userId, ids) {
    const count = await notificationRepo.markRead(userId, ids);
    return { updated: count };
}

module.exports = { TYPES, notify, notifyMany, list, markRead };
