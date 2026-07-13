// GET  /comments?postId=...  -> comentarios de una publicación
// POST /comments             -> comentar (requiere auth)
import { requireAuth } from "../middleware/auth.js";
import { getSql } from "../database/client.js";
import { readJson, assert, is, parsePagination, paginationMeta } from "../utils/validate.js";
import { created, paginated } from "../utils/response.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";

export async function onRequestGet(context) {
    const url = new URL(context.request.url);
    const postId = url.searchParams.get("postId");
    if (!is.uuid(postId)) throw new BadRequestError("postId es requerido y debe ser un UUID.");
    const { page, limit, offset } = parsePagination(url);
    const sql = getSql(context.env);

    const totalRows = await sql`SELECT COUNT(*)::int AS total FROM comments WHERE post_id = ${postId} AND deleted_at IS NULL`;
    const rows = await sql`
        SELECT c.id, c.parent_id, c.content, c.created_at,
               u.id AS author_id, u.username, u.display_name, u.avatar_url
        FROM comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.post_id = ${postId} AND c.deleted_at IS NULL
        ORDER BY c.created_at ASC
        LIMIT ${limit} OFFSET ${offset}`;
    return paginated(rows, paginationMeta(page, limit, totalRows[0].total), "Comentarios obtenidos.");
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({
        postId: [is.uuid(body.postId), "postId debe ser un UUID válido."],
        content: [is.nonEmptyString(body.content), "El comentario no puede estar vacío."],
    });
    const sql = getSql(context.env);

    const post = await sql`SELECT id FROM posts WHERE id = ${body.postId} AND deleted_at IS NULL LIMIT 1`;
    if (!post.length) throw new NotFoundError("La publicación no existe.");

    const rows = await sql`
        INSERT INTO comments (post_id, author_id, parent_id, content)
        VALUES (${body.postId}, ${user.id}, ${is.uuid(body.parentId) ? body.parentId : null}, ${body.content})
        RETURNING id, post_id, author_id, parent_id, content, created_at`;
    await sql`UPDATE posts SET comments_count = comments_count + 1 WHERE id = ${body.postId}`;
    return created({ comment: rows[0] }, "Comentario publicado.");
}
