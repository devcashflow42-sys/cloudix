// Runner de migraciones para ejecución LOCAL en Node (no en el edge).
//
// Aplica en orden todos los archivos migrations/*.sql que aún no estén
// registrados en la tabla schema_migrations. Usa `pg` (protocolo simple,
// admite múltiples sentencias y funciones plpgsql), no el driver edge.
//
// Uso:
//   DATABASE_URL=postgres://... node scripts/migrate.mjs
//   (o define DATABASE_URL en un archivo .dev.vars)
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

async function loadDatabaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    // Fallback: leer .dev.vars (formato KEY="valor").
    try {
        const raw = await readFile(path.resolve(__dirname, "../.dev.vars"), "utf8");
        const match = raw.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
        if (match) return match[1].trim();
    } catch { /* sin .dev.vars */ }
    throw new Error("Define DATABASE_URL (variable de entorno o .dev.vars).");
}

async function main() {
    const connectionString = await loadDatabaseUrl();
    const client = new pg.Client({
        connectionString,
        ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();

    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version    VARCHAR(120) PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
    const applied = new Set(
        (await client.query("SELECT version FROM schema_migrations")).rows.map(r => r.version),
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter(f => f.endsWith(".sql")).sort();
    let count = 0;
    for (const file of files) {
        const version = file.replace(/\.sql$/i, "");
        if (applied.has(version)) { console.log(`= ya aplicada: ${version}`); continue; }
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
        try {
            await client.query("BEGIN");
            await client.query(sql);
            await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
            await client.query("COMMIT");
            console.log(`+ aplicada: ${version}`);
            count++;
        } catch (err) {
            await client.query("ROLLBACK");
            throw new Error(`Falló la migración ${version}: ${err.message}`);
        }
    }
    await client.end();
    console.log(count ? `\n✔ ${count} migración(es) aplicadas.` : "\n✔ Base de datos al día.");
}

main().catch((err) => {
    console.error("[migrate] Error:", err.message);
    process.exit(1);
});
