"use strict";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Extrae parámetros de paginación desde req.query normalizados.
 */
function parsePagination(query) {
    let page = parseInt(query.page, 10);
    let limit = parseInt(query.limit, 10);

    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

/**
 * Construye el objeto meta.pagination a partir del total.
 */
function buildPaginationMeta(page, limit, total) {
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
    };
}

/**
 * Parsea ordenamiento seguro. Solo acepta columnas whitelisted.
 * Ejemplo de sortBy: "created_at:desc" o "title:asc".
 */
function parseSort(query, allowedFields, defaultField = "created_at", defaultDir = "DESC") {
    const raw = (query.sort || query.sortBy || "").toString().trim();
    if (!raw) return { column: defaultField, direction: defaultDir };

    const [field, dir] = raw.split(":");
    const column = allowedFields.includes(field) ? field : defaultField;
    const direction = (dir || "").toUpperCase() === "ASC" ? "ASC" : "DESC";
    return { column, direction };
}

module.exports = {
    DEFAULT_LIMIT,
    MAX_LIMIT,
    parsePagination,
    buildPaginationMeta,
    parseSort,
};
