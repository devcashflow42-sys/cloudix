// Cliente PostgreSQL para el edge usando el driver serverless de Neon.
//
// A diferencia de `pg` (que abre sockets TCP y no funciona en Workers),
// @neondatabase/serverless habla con Neon por HTTP/WebSocket, ideal para
// Cloudflare Functions.
//
// Uso:
//   const sql = getSql(env);
//   const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
//
// El tagged template parametriza automáticamente los valores ($1, $2...),
// por lo que es seguro frente a inyección SQL.
import { neon } from "@neondatabase/serverless";

export function getSql(env) {
    if (!env.DATABASE_URL) {
        throw new Error("Falta la variable DATABASE_URL.");
    }
    return neon(env.DATABASE_URL);
}

/**
 * Devuelve la primera fila o null.
 */
export async function one(promise) {
    const rows = await promise;
    return rows[0] || null;
}
