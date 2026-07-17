// GET /friends       -> personas que el usuario SIGUE (sus "amigos")
// GET /friends?q=... -> filtra por nombre/usuario
//
// Es la base de las reglas sociales: solo puedes mensajear o añadir a un
// grupo/comunidad a personas que ya sigues.
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { success } from "../utils/response.js";

export async function onRequestGet(context) {
    const user = await requireAuth(context);
    const url = new URL(context.request.url);
    const q = (url.searchParams.get("q") || "").trim();
    const sql = getSql(context.env);

    const rows = q
        ? await sql`
            SELECT u.id, u.username, u.display_name, u.avatar_url,
                   (u.last_login_at > NOW() - INTERVAL '10 minutes') AS online
            FROM follows f
            JOIN users u ON u.id = f.following_id
            WHERE f.follower_id = ${user.id}
              AND (u.username ILIKE ${"%" + q + "%"} OR u.display_name ILIKE ${"%" + q + "%"})
            ORDER BY u.display_name NULLS LAST, u.username
            LIMIT 100`
        : await sql`
            SELECT u.id, u.username, u.display_name, u.avatar_url,
                   (u.last_login_at > NOW() - INTERVAL '10 minutes') AS online
            FROM follows f
            JOIN users u ON u.id = f.following_id
            WHERE f.follower_id = ${user.id}
            ORDER BY u.display_name NULLS LAST, u.username
            LIMIT 100`;

    return success({ friends: rows }, { message: "Amigos obtenidos." });
}
