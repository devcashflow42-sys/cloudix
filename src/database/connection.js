"use strict";

const { Pool } = require("pg");
const env = require("../config/env");
const logger = require("../utils/logger");

/**
 * Construye la configuración del pool a partir de las variables de entorno.
 * Soporta tanto DATABASE_URL (para servicios cloud como Neon/Supabase)
 * como parámetros individuales (DB_HOST, DB_NAME, etc).
 */
function buildPoolConfig() {
    const base = {
        max: env.DB_POOL_MAX,
        min: env.DB_POOL_MIN,
        idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT,
        connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT,
        allowExitOnIdle: false,
        application_name: env.APP_NAME,
    };

    if (env.DATABASE_URL) {
        return {
            ...base,
            connectionString: env.DATABASE_URL,
            ssl: env.DATABASE_URL.includes("sslmode=require") || env.DB_SSL
                ? { rejectUnauthorized: false }
                : undefined,
        };
    }

    return {
        ...base,
        host: env.DB_HOST,
        port: env.DB_PORT,
        database: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
    };
}

let pool = null;

function createPool() {
    const config = buildPoolConfig();
    const p = new Pool(config);

    p.on("connect", () => {
        logger.debug("PG: nueva conexión establecida en el pool");
    });

    p.on("acquire", () => {
        logger.silly?.("PG: conexión adquirida");
    });

    p.on("error", (err) => {
        // Errores en clientes ociosos: NO tirar el proceso, dejar que el pool
        // los sustituya. Solo registramos y avisamos al operador.
        logger.error("PG: error en cliente ocioso del pool", { err: err.message });
    });

    p.on("remove", () => {
        logger.debug("PG: cliente removido del pool");
    });

    return p;
}

function getPool() {
    if (!pool) pool = createPool();
    return pool;
}

/**
 * Ejecuta una query parametrizada. NUNCA concatenes strings SQL: usa siempre $1, $2...
 */
async function query(text, params = []) {
    const p = getPool();
    const start = Date.now();
    try {
        const res = await p.query(text, params);
        const duration = Date.now() - start;
        if (duration > 500) {
            logger.warn("PG: consulta lenta", {
                durationMs: duration,
                rows: res.rowCount,
                text: text.replace(/\s+/g, " ").slice(0, 200),
            });
        }
        return res;
    } catch (err) {
        logger.error("PG: error ejecutando consulta", {
            error: err.message,
            code: err.code,
            text: text.replace(/\s+/g, " ").slice(0, 200),
        });
        throw err;
    }
}

/**
 * Ejecuta una función dentro de una transacción con rollback automático en error.
 *
 *   await withTransaction(async (client) => {
 *     await client.query("INSERT ...");
 *     await client.query("UPDATE ...");
 *   });
 */
async function withTransaction(fn) {
    const p = getPool();
    const client = await p.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        try { await client.query("ROLLBACK"); } catch (_) { /* noop */ }
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Health check: intenta un SELECT 1 con timeout corto.
 */
async function healthCheck() {
    try {
        const res = await query("SELECT 1 AS ok, NOW() AS now, current_database() AS db");
        return {
            ok: true,
            now: res.rows[0].now,
            database: res.rows[0].db,
            poolTotal: getPool().totalCount,
            poolIdle: getPool().idleCount,
            poolWaiting: getPool().waitingCount,
        };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

/**
 * Cierre limpio del pool (shutdown).
 */
async function closePool() {
    if (!pool) return;
    try {
        await pool.end();
        logger.info("PG: pool cerrado correctamente");
    } catch (err) {
        logger.error("PG: error al cerrar pool", { err: err.message });
    } finally {
        pool = null;
    }
}

/**
 * Verifica conexión inicial reintentando N veces.
 */
async function connectWithRetry({ retries = 10, delayMs = 2000 } = {}) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await query("SELECT 1");
            logger.info(`PG: conectado a la base de datos (intento ${attempt})`);
            return;
        } catch (err) {
            logger.warn(`PG: fallo de conexión (intento ${attempt}/${retries}): ${err.message}`);
            if (attempt === retries) throw err;
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
}

module.exports = {
    getPool,
    query,
    withTransaction,
    healthCheck,
    closePool,
    connectWithRetry,
};
