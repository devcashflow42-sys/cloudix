"use strict";

const taxonomyRepo = require("../repositories/taxonomyRepository");
const { NotFoundError } = require("../utils/AppError");
const cache = require("../utils/cache");

const CACHE_KEY = "taxonomy:tags";

async function list({ search, limit } = {}) {
    const key = `${CACHE_KEY}:${search || ""}:${limit || 100}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const rows = await taxonomyRepo.listTags({ search, limit });
    cache.set(key, rows, 120);
    return rows;
}

async function create({ names }) {
    if (!Array.isArray(names) || names.length === 0) {
        return [];
    }
    const rows = await taxonomyRepo.upsertTagsByName(names);
    cache.delByPrefix(CACHE_KEY);
    return rows;
}

async function remove(id) {
    const ok = await taxonomyRepo.deleteTag(id);
    if (!ok) throw new NotFoundError("Etiqueta no encontrada.");
    cache.delByPrefix(CACHE_KEY);
    return true;
}

module.exports = { list, create, remove };
