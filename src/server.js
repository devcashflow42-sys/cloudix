"use strict";

const env = require("./config/env");
env.validate();

const app = require("./app");
const logger = require("./utils/logger");
const { connectWithRetry, closePool } = require("./database/connection");
const { runMigrations } = require("./database/migrate");
const { runSeed } = require("./database/seed");

let server;

async function bootstrap() {
    logger.info(`[boot] ${env.APP_NAME} arrancando en modo ${env.NODE_ENV}...`);

    // 1) Conexión a la BD con reintentos
    await connectWithRetry({ retries: 10, delayMs: 2000 });

    // 2) Migraciones (aplica schema.sql y migraciones extra si las hay)
    if (process.env.RUN_MIGRATIONS !== "false") {
        await runMigrations();
    }

    // 3) Seed automático solo en dev, o forzando SEED_ON_BOOT=true
    if (env.IS_DEVELOPMENT || process.env.SEED_ON_BOOT === "true") {
        try {
            await runSeed();
        } catch (err) {
            logger.warn(`[boot] Seed falló pero se continúa: ${err.message}`);
        }
    }

    // 4) Levantar HTTP
    server = app.listen(env.PORT, () => {
        logger.info(`[boot] ${env.APP_NAME} escuchando en ${env.APP_URL} (puerto ${env.PORT})`);
        logger.info(`[boot] API disponible bajo ${env.API_PREFIX}`);
        logger.info(`[boot] Docs Swagger: ${env.APP_URL}/docs`);
    });

    server.setTimeout(120000);
}

// -------- Shutdown limpio --------
async function shutdown(signal) {
    logger.info(`[shutdown] Señal recibida: ${signal}. Cerrando...`);
    const timeout = setTimeout(() => {
        logger.warn("[shutdown] Timeout, forzando salida.");
        process.exit(1);
    }, 15000);
    timeout.unref();

    try {
        if (server) await new Promise((r) => server.close(r));
        await closePool();
        logger.info("[shutdown] Recursos liberados. Adiós.");
        process.exit(0);
    } catch (err) {
        logger.error("[shutdown] Error durante el cierre", { err: err.message });
        process.exit(1);
    }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
    logger.error("[fatal] uncaughtException", { err: err.message, stack: err.stack });
    shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
    logger.error("[fatal] unhandledRejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    });
    // No matamos el proceso automáticamente para no tumbar el servicio por un
    // reject aislado. Se registra y se sigue.
});

bootstrap().catch((err) => {
    logger.error("[boot] Falló el arranque", { err: err.message, stack: err.stack });
    process.exit(1);
});
