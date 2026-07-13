// GET /  -> metadatos y health check de la API.
import { success, errorResponse } from "./utils/response.js";
import { getSql } from "./database/client.js";

export async function onRequestGet(context) {
    const { env } = context;
    let db = { ok: false };
    try {
        const sql = getSql(env);
        const rows = await sql`SELECT 1 AS ok, NOW() AS now`;
        db = { ok: true, now: rows[0].now };
    } catch (err) {
        db = { ok: false, error: err.message };
    }

    return success({
        service: env.APP_NAME || "Cloudix",
        version: env.API_VERSION || "1.0.0",
        runtime: "cloudflare-pages-functions",
        database: db,
        endpoints: [
            "/auth", "/users", "/posts", "/comments", "/reactions", "/stories",
            "/follows", "/groups", "/communities", "/messages", "/notifications",
            "/search", "/upload", "/admin",
        ],
    }, { message: db.ok ? "Cloudix API operativa." : "API arriba, base de datos no disponible." });
}
