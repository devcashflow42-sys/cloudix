"use strict";

const taxonomyRepo = require("../repositories/taxonomyRepository");
const { NotFoundError, ConflictError } = require("../utils/AppError");
const cache = require("../utils/cache");

const CACHE_KEY = "taxonomy:categories:all";

async function list({ activeOnly = true } = {}) {
    const key = `${CACHE_KEY}:${activeOnly ? "active" : "all"}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const rows = await taxonomyRepo.listCategories({ activeOnly });
    cache.set(key, rows, 300);
    return rows;
}

async function getById(id) {
    const row = await taxonomyRepo.findCategoryById(id);
    if (!row) throw new NotFoundError("Categoría no encontrada.");
    return row;
}

async function create({ name, description, parentId }) {
    const existing = await taxonomyRepo.findCategoryBySlug(taxonomyRepo.slugify(name));
    if (existing) throw new ConflictError("Ya existe una categoría con ese nombre.");
    const created = await taxonomyRepo.createCategory({ name, description, parentId });
    cache.delByPrefix(CACHE_KEY);
    return created;
}

async function update(id, fields) {
    const updated = await taxonomyRepo.updateCategory(id, {
        name: fields.name,
        description: fields.description,
        parent_id: fields.parentId,
        is_active: fields.isActive,
    });
    if (!updated) throw new NotFoundError("Categoría no encontrada.");
    cache.delByPrefix(CACHE_KEY);
    return updated;
}

async function remove(id) {
    const ok = await taxonomyRepo.deleteCategory(id);
    if (!ok) throw new NotFoundError("Categoría no encontrada.");
    cache.delByPrefix(CACHE_KEY);
    return true;
}

module.exports = { list, getById, create, update, remove };
