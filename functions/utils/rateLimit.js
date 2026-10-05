// Limitación de intentos con contadores de ventana fija en PostgreSQL.
//
// Pensado para el edge: no requiere KV ni Durable Objects. Si la tabla
// `auth_rate_limits` aún no existe (migración 0006 sin aplicar), las
// funciones se degradan sin bloquear para no tumbar el login.
import { TooManyRequestsError } from "./errors.js";

const MISSING_SCHEMA = new Set(["42P01", "42703"]);

function handleSchemaError(err) {
    if (MISSING_SCHEMA.has(err?.code)) {
        console.warn("[rate-limit] Falta la tabla auth_rate_limits. Ejecuta las migraciones (0006).");
        return;
    }
    throw err;
}

/** IP del cliente según Cloudflare. */
export function clientIp(request) {
    return request.headers.get("CF-Connecting-IP")
        || (request.headers.get("X-Forwarded-For") || "").split(",")[0].trim()
        || "unknown";
}

/**
 * Lanza TooManyRequestsError si `key` ya alcanzó `max` dentro de la ventana.
 */
export async function assertNotLimited(sql, key, { max, windowSec, message }) {
    let rows;
    try {
        rows = await sql`
            SELECT count,
                   CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => ${windowSec}) - NOW())))::int AS retry_after
            FROM auth_rate_limits
            WHERE key = ${key} AND window_start + make_interval(secs => ${windowSec}) > NOW()
            LIMIT 1`;
    } catch (err) {
        return handleSchemaError(err);
    }
    const row = rows[0];
    if (row && row.count >= max) {
        throw new TooManyRequestsError(
            message || "Demasiados intentos. Inténtalo de nuevo más tarde.",
            Math.max(1, row.retry_after || windowSec),
        );
    }
}

/** Suma un intento a `key`, reiniciando la ventana si ya expiró. */
export async function hit(sql, key, { windowSec }) {
    try {
        await sql`
            INSERT INTO auth_rate_limits (key, count, window_start)
            VALUES (${key}, 1, NOW())
            ON CONFLICT (key) DO UPDATE SET
                count = CASE
                    WHEN auth_rate_limits.window_start + make_interval(secs => ${windowSec}) <= NOW() THEN 1
                    ELSE auth_rate_limits.count + 1 END,
                window_start = CASE
                    WHEN auth_rate_limits.window_start + make_interval(secs => ${windowSec}) <= NOW() THEN NOW()
                    ELSE auth_rate_limits.window_start END`;
    } catch (err) {
        handleSchemaError(err);
    }
}

/** Comprueba el límite y, si no se superó, registra el intento. */
export async function consume(sql, key, opts) {
    await assertNotLimited(sql, key, opts);
    await hit(sql, key, opts);
}

/** Borra el contador de `key` (p. ej. tras un login correcto). */
export async function reset(sql, key) {
    try {
        await sql`DELETE FROM auth_rate_limits WHERE key = ${key}`;
    } catch (err) {
        handleSchemaError(err);
    }
}
