"use strict";

/**
 * Runner de migraciones.
 *
 * Estrategia:
 *  1) Ejecuta schema.sql (idempotente, DDL con CREATE IF NOT EXISTS).
 *  2) Registra la versión "initial" en schema_migrations si no está.
 *  3) Aplica cualquier archivo .sql adicional en /migrations
 *     ordenado por nombre que no esté aún en schema_migrations.
 *
 * Uso directo:
 *   node src/database/migrate.js
 *
 * Uso programático:
 *   const { runMigrations } = require("./migrate");
 *   await runMigrations();
 */

const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const { query, withTransaction, closePool } = require("./connection");
const logger = require("../utils/logger");
const env = require("../config/env");

const SCHEMA_FILE = path.resolve(__dirname, "schema.sql");
const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");
const INITIAL_VERSION = "20260101_000000_initial_schema";

async function ensureMigrationsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id         SERIAL PRIMARY KEY,
            version    VARCHAR(100) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

async function getAppliedVersions() {
    const res = await query("SELECT version FROM schema_migrations ORDER BY version ASC");
    return new Set(res.rows.map(r => r.version));
}

async function applySchemaFile() {
    const sql = await fsp.readFile(SCHEMA_FILE, "utf8");
    await withTransaction(async (client) => {
        await client.query(sql);
        await client.query(
            `INSERT INTO schema_migrations (version)
             VALUES ($1)
             ON CONFLICT (version) DO NOTHING`,
            [INITIAL_VERSION],
        );
    });
    logger.info(`[migrate] Esquema base aplicado (${INITIAL_VERSION})`);
}

async function applyExtraMigrations(applied) {
    let files = [];
    try {
        files = await fsp.readdir(MIGRATIONS_DIR);
    } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
    }
    const sqlFiles = files
        .filter(f => f.endsWith(".sql"))
        .sort();

    for (const file of sqlFiles) {
        const version = file.replace(/\.sql$/i, "");
        if (applied.has(version)) continue;
        const sql = await fsp.readFile(path.join(MIGRATIONS_DIR, file), "utf8");
        await withTransaction(async (client) => {
            await client.query(sql);
            await client.query(
                `INSERT INTO schema_migrations (version) VALUES ($1)
                 ON CONFLICT (version) DO NOTHING`,
                [version],
            );
        });
        logger.info(`[migrate] Migración aplicada: ${version}`);
    }
}

async function runMigrations() {
    logger.info("[migrate] Iniciando migraciones...");
    await ensureMigrationsTable();
    const applied = await getAppliedVersions();
    if (!applied.has(INITIAL_VERSION)) {
        await applySchemaFile();
    } else {
        // Aun así aseguramos que estructuras nuevas del schema.sql se apliquen (idempotente).
        const sql = await fsp.readFile(SCHEMA_FILE, "utf8");
        await query(sql);
    }
    await applyExtraMigrations(applied);
    logger.info("[migrate] Migraciones completadas");
}

// Ejecución directa
if (require.main === module) {
    env.validate();
    runMigrations()
        .then(() => closePool())
        .then(() => process.exit(0))
        .catch((err) => {
            logger.error("[migrate] Falló", { err: err.message, stack: err.stack });
            closePool().finally(() => process.exit(1));
        });
}

module.exports = { runMigrations };
