"use strict";

/**
 * Seed inicial: crea roles del sistema, un usuario admin (si no existe)
 * y algunas categorías por defecto.
 *
 * Es idempotente: se puede correr múltiples veces.
 */

const { query, withTransaction, closePool } = require("./connection");
const password = require("../utils/password");
const logger = require("../utils/logger");
const env = require("../config/env");
const { ROLES, ROLE_LEVELS, ROLE_DESCRIPTIONS } = require("../config/roles");

const DEFAULT_CATEGORIES = [
    { name: "General",       slug: "general",       description: "Contenido sin clasificar." },
    { name: "Educación",     slug: "educacion",     description: "Material educativo, cursos, tutoriales." },
    { name: "Entretenimiento", slug: "entretenimiento", description: "Música, video, podcasts de ocio." },
    { name: "Tecnología",    slug: "tecnologia",    description: "Contenido técnico y de desarrollo." },
    { name: "Noticias",      slug: "noticias",      description: "Actualidad y periodismo." },
    { name: "Arte",          slug: "arte",          description: "Fotografía, ilustración, diseño." },
];

async function seedRoles() {
    for (const roleName of Object.values(ROLES)) {
        await query(
            `INSERT INTO roles (name, description, level)
             VALUES ($1, $2, $3)
             ON CONFLICT (name) DO UPDATE
               SET description = EXCLUDED.description,
                   level       = EXCLUDED.level`,
            [roleName, ROLE_DESCRIPTIONS[roleName], ROLE_LEVELS[roleName]],
        );
    }
    logger.info("[seed] Roles insertados/actualizados");
}

async function seedAdmin() {
    const email = env.SEED_ADMIN_EMAIL.toLowerCase();
    const existing = await query(
        `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [email],
    );
    if (existing.rowCount > 0) {
        logger.info(`[seed] Usuario admin ya existe (${email})`);
        return existing.rows[0].id;
    }

    const hashed = await password.hash(env.SEED_ADMIN_PASSWORD);

    const userId = await withTransaction(async (client) => {
        const insert = await client.query(
            `INSERT INTO users
             (username, email, password_hash, first_name, last_name, email_verified, is_active)
             VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
             RETURNING id`,
            [env.SEED_ADMIN_USERNAME, email, hashed, "Admin", "Nubifly"],
        );
        const id = insert.rows[0].id;

        const roleRes = await client.query(
            `SELECT id FROM roles WHERE name = $1`,
            [ROLES.ADMIN],
        );
        await client.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [id, roleRes.rows[0].id],
        );
        return id;
    });

    logger.info(`[seed] Usuario admin creado: ${email} (id=${userId})`);
    logger.warn(`[seed] Cambia la contraseña admin lo antes posible (actualmente la de SEED_ADMIN_PASSWORD)`);
    return userId;
}

async function seedCategories() {
    for (const c of DEFAULT_CATEGORIES) {
        await query(
            `INSERT INTO media_categories (name, slug, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (slug) DO NOTHING`,
            [c.name, c.slug, c.description],
        );
    }
    logger.info("[seed] Categorías por defecto insertadas");
}

async function runSeed() {
    logger.info("[seed] Iniciando seed...");
    await seedRoles();
    await seedAdmin();
    await seedCategories();
    logger.info("[seed] Seed completo");
}

if (require.main === module) {
    env.validate();
    runSeed()
        .then(() => closePool())
        .then(() => process.exit(0))
        .catch((err) => {
            logger.error("[seed] Falló", { err: err.message, stack: err.stack });
            closePool().finally(() => process.exit(1));
        });
}

module.exports = { runSeed };
