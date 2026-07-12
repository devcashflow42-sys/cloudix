"use strict";

/**
 * Carga y validación centralizada de variables de entorno.
 *
 * Este módulo es la ÚNICA fuente de verdad para la configuración.
 * El resto del código NO debe leer process.env directamente.
 */

const path = require("path");
const fs = require("fs");

// Carga .env explícitamente desde la raíz del proyecto
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const toInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value, fallback = false) => {
    if (value === undefined || value === null) return fallback;
    return String(value).toLowerCase() === "true" || value === "1";
};

const env = {
    // Aplicación
    NODE_ENV: process.env.NODE_ENV || "development",
    IS_PRODUCTION: process.env.NODE_ENV === "production",
    IS_DEVELOPMENT: process.env.NODE_ENV !== "production",
    PORT: toInt(process.env.PORT, 3000),
    API_PREFIX: process.env.API_PREFIX || "/api/v1",
    APP_NAME: process.env.APP_NAME || "Nubifly API",
    APP_URL: process.env.APP_URL || "http://localhost:3000",

    // Base de datos
    DATABASE_URL: process.env.DATABASE_URL || null,
    DB_HOST: process.env.DB_HOST || "localhost",
    DB_PORT: toInt(process.env.DB_PORT, 5432),
    DB_NAME: process.env.DB_NAME || "postgres",
    DB_USER: process.env.DB_USER || "postgres",
    DB_PASSWORD: process.env.DB_PASSWORD || "",
    DB_SSL: toBool(process.env.DB_SSL, false),

    // Pool de conexiones
    DB_POOL_MAX: toInt(process.env.DB_POOL_MAX, 20),
    DB_POOL_MIN: toInt(process.env.DB_POOL_MIN, 2),
    DB_POOL_IDLE_TIMEOUT: toInt(process.env.DB_POOL_IDLE_TIMEOUT, 30000),
    DB_POOL_CONNECTION_TIMEOUT: toInt(process.env.DB_POOL_CONNECTION_TIMEOUT, 5000),

    // JWT
    JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || "insecure-access-secret-change-me",
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "insecure-refresh-secret-change-me",
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    JWT_ISSUER: process.env.JWT_ISSUER || "nubifly-api",
    JWT_AUDIENCE: process.env.JWT_AUDIENCE || "nubifly-clients",

    // Bcrypt
    BCRYPT_SALT_ROUNDS: toInt(process.env.BCRYPT_SALT_ROUNDS, 12),

    // CORS
    CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
    CORS_CREDENTIALS: toBool(process.env.CORS_CREDENTIALS, true),

    // Rate limit
    RATE_LIMIT_WINDOW_MS: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    RATE_LIMIT_MAX: toInt(process.env.RATE_LIMIT_MAX, 100),
    RATE_LIMIT_AUTH_MAX: toInt(process.env.RATE_LIMIT_AUTH_MAX, 10),
    RATE_LIMIT_UPLOAD_MAX: toInt(process.env.RATE_LIMIT_UPLOAD_MAX, 30),

    // Archivos
    STORAGE_ROOT: process.env.STORAGE_ROOT || "src/storage",
    MAX_FILE_SIZE_IMAGE: toInt(process.env.MAX_FILE_SIZE_IMAGE, 10 * 1024 * 1024),
    MAX_FILE_SIZE_VIDEO: toInt(process.env.MAX_FILE_SIZE_VIDEO, 500 * 1024 * 1024),
    MAX_FILE_SIZE_AUDIO: toInt(process.env.MAX_FILE_SIZE_AUDIO, 100 * 1024 * 1024),
    MAX_FILE_SIZE_DOCUMENT: toInt(process.env.MAX_FILE_SIZE_DOCUMENT, 50 * 1024 * 1024),
    MAX_FILE_SIZE_PODCAST: toInt(process.env.MAX_FILE_SIZE_PODCAST, 200 * 1024 * 1024),
    MAX_FILE_SIZE_OTHER: toInt(process.env.MAX_FILE_SIZE_OTHER, 100 * 1024 * 1024),

    // Logs
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    LOG_DIR: process.env.LOG_DIR || "src/logs",
    LOG_MAX_FILES: process.env.LOG_MAX_FILES || "14d",
    LOG_MAX_SIZE: process.env.LOG_MAX_SIZE || "20m",

    // Caché
    CACHE_TTL_SECONDS: toInt(process.env.CACHE_TTL_SECONDS, 300),
    CACHE_CHECK_PERIOD: toInt(process.env.CACHE_CHECK_PERIOD, 60),

    // Seed inicial
    SEED_ADMIN_EMAIL: process.env.SEED_ADMIN_EMAIL || "admin@nubifly.local",
    SEED_ADMIN_PASSWORD: process.env.SEED_ADMIN_PASSWORD || "Admin1234!",
    SEED_ADMIN_USERNAME: process.env.SEED_ADMIN_USERNAME || "admin",
};

/**
 * Valida las variables críticas en producción.
 * En dev es solo un warning; en producción tira el proceso.
 */
function validate() {
    const problems = [];

    const hasConnection = env.DATABASE_URL || (env.DB_HOST && env.DB_NAME && env.DB_USER);
    if (!hasConnection) {
        problems.push("Faltan credenciales de base de datos (DATABASE_URL o DB_HOST/DB_NAME/DB_USER).");
    }

    if (env.IS_PRODUCTION) {
        if (env.JWT_ACCESS_SECRET.includes("insecure") || env.JWT_ACCESS_SECRET.length < 32) {
            problems.push("JWT_ACCESS_SECRET debe ser una clave segura de al menos 32 caracteres.");
        }
        if (env.JWT_REFRESH_SECRET.includes("insecure") || env.JWT_REFRESH_SECRET.length < 32) {
            problems.push("JWT_REFRESH_SECRET debe ser una clave segura de al menos 32 caracteres.");
        }
        if (env.CORS_ORIGIN === "*") {
            problems.push("CORS_ORIGIN=* no es seguro en producción. Define orígenes concretos.");
        }
    }

    if (problems.length > 0) {
        const msg = problems.map(p => `  - ${p}`).join("\n");
        if (env.IS_PRODUCTION) {
            console.error(`\n[FATAL] Configuración inválida:\n${msg}\n`);
            process.exit(1);
        } else {
            console.warn(`\n[WARN] Configuración con avisos:\n${msg}\n`);
        }
    }

    // Asegura directorios necesarios
    const dirs = [
        env.LOG_DIR,
        env.STORAGE_ROOT,
        path.join(env.STORAGE_ROOT, "images"),
        path.join(env.STORAGE_ROOT, "videos"),
        path.join(env.STORAGE_ROOT, "audio"),
        path.join(env.STORAGE_ROOT, "documents"),
        path.join(env.STORAGE_ROOT, "podcasts"),
        path.join(env.STORAGE_ROOT, "thumbnails"),
        path.join(env.STORAGE_ROOT, "others"),
    ];
    for (const d of dirs) {
        const abs = path.isAbsolute(d) ? d : path.resolve(process.cwd(), d);
        if (!fs.existsSync(abs)) {
            fs.mkdirSync(abs, { recursive: true });
        }
    }
}

env.validate = validate;

module.exports = env;
