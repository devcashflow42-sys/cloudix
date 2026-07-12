"use strict";

const { query } = require("../database/connection");

function slugify(str) {
    return String(str || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 100);
}

// -------- CATEGORÍAS --------

async function listCategories({ activeOnly = true } = {}) {
    const res = await query(
        `SELECT id, name, slug, description, parent_id, is_active, created_at, updated_at
         FROM media_categories
         ${activeOnly ? "WHERE is_active = TRUE" : ""}
         ORDER BY name ASC`,
    );
    return res.rows;
}

async function findCategoryById(id) {
    const res = await query(
        `SELECT id, name, slug, description, parent_id, is_active, created_at, updated_at
         FROM media_categories WHERE id = $1 LIMIT 1`,
        [id],
    );
    return res.rows[0] || null;
}

async function findCategoryBySlug(slug) {
    const res = await query(
        `SELECT id, name, slug, description, parent_id, is_active, created_at, updated_at
         FROM media_categories WHERE slug = $1 LIMIT 1`,
        [slug],
    );
    return res.rows[0] || null;
}

async function createCategory({ name, description = null, parentId = null }) {
    const slug = slugify(name);
    const res = await query(
        `INSERT INTO media_categories (name, slug, description, parent_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug, description, parent_id, is_active, created_at, updated_at`,
        [name, slug, description, parentId],
    );
    return res.rows[0];
}

async function updateCategory(id, fields) {
    const allowed = ["name", "description", "parent_id", "is_active"];
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
        values.push(slugify(fields.name));
    }
    if (sets.length === 0) return findCategoryById(id);
    values.push(id);
    const res = await query(
        `UPDATE media_categories SET ${sets.join(", ")}
          WHERE id = $${i}
          RETURNING id, name, slug, description, parent_id, is_active, created_at, updated_at`,
        values,
    );
    return res.rows[0] || null;
}

async function deleteCategory(id) {
    const res = await query(`DELETE FROM media_categories WHERE id = $1 RETURNING id`, [id]);
    return res.rowCount > 0;
}

// -------- TAGS --------

async function listTags({ search, limit = 100 } = {}) {
    if (search) {
        const res = await query(
            `SELECT id, name, slug, usage_count, created_at
             FROM media_tags
             WHERE LOWER(name) LIKE LOWER($1)
             ORDER BY usage_count DESC, name ASC
             LIMIT $2`,
            [`%${search}%`, limit],
        );
        return res.rows;
    }
    const res = await query(
        `SELECT id, name, slug, usage_count, created_at
         FROM media_tags
         ORDER BY usage_count DESC, name ASC
         LIMIT $1`,
        [limit],
    );
    return res.rows;
}

async function findTagById(id) {
    const res = await query(
        `SELECT id, name, slug, usage_count, created_at FROM media_tags WHERE id = $1 LIMIT 1`,
        [id],
    );
    return res.rows[0] || null;
}

async function findTagByName(name) {
    const res = await query(
        `SELECT id, name, slug, usage_count, created_at
         FROM media_tags WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [name],
    );
    return res.rows[0] || null;
}

async function upsertTagsByName(names = []) {
    const out = [];
    for (const raw of names) {
        const name = String(raw || "").trim();
        if (!name) continue;
        const slug = slugify(name);
        const res = await query(
            `INSERT INTO media_tags (name, slug)
             VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
             RETURNING id, name, slug, usage_count`,
            [name, slug],
        );
        out.push(res.rows[0]);
    }
    return out;
}

async function deleteTag(id) {
    const res = await query(`DELETE FROM media_tags WHERE id = $1 RETURNING id`, [id]);
    return res.rowCount > 0;
}

module.exports = {
    slugify,
    listCategories,
    findCategoryById,
    findCategoryBySlug,
    createCategory,
    updateCategory,
    deleteCategory,
    listTags,
    findTagById,
    findTagByName,
    upsertTagsByName,
    deleteTag,
};
