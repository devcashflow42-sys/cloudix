// GET /api  -> metadatos y health check de la API.
//
// (Antes vivía en functions/index.js, es decir en "/", pero eso interceptaba
//  la raíz y mostraba el JSON en lugar de public/index.html. Se movió a /api
//  para dejar "/" a la página web estática.)
import { success } from "../utils/response.js";
import { getSql } from "../database/client.js";

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
            "/api/login", "/api/record", "/api/recover/password",
            "/auth", "/users", "/posts", "/comments", "/reactions", "/stories",
            "/follows", "/groups", "/communities", "/messages", "/notifications",
            "/search", "/upload", "/admin",
        ],
    }, { message: db.ok ? "Cloudix API operativa." : "API arriba, base de datos no disponible." });
}
