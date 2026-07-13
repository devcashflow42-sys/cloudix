// Validación ligera y sin dependencias, pensada para el edge.
import { ValidationError } from "./errors.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lee y parsea el body JSON de una request. Lanza ValidationError si no es válido.
 */
export async function readJson(request) {
    try {
        const body = await request.json();
        if (body === null || typeof body !== "object" || Array.isArray(body)) {
            throw new Error("body no es un objeto");
        }
        return body;
    } catch {
        throw new ValidationError("El cuerpo de la solicitud debe ser JSON válido.");
    }
}

export const is = {
    email: (v) => typeof v === "string" && EMAIL_RE.test(v),
    username: (v) => typeof v === "string" && USERNAME_RE.test(v),
    uuid: (v) => typeof v === "string" && UUID_RE.test(v),
    nonEmptyString: (v) => typeof v === "string" && v.trim().length > 0,
    strongPassword: (v) =>
        typeof v === "string" && v.length >= 8 && v.length <= 128 &&
        /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v),
};

/**
 * Comprueba un conjunto de reglas y agrupa los errores.
 *
 *   assert({
 *     email: [is.email(body.email), "El correo no es válido."],
 *     password: [is.strongPassword(body.password), "Contraseña débil."],
 *   });
 */
export function assert(rules) {
    const errors = [];
    for (const [field, [ok, message]] of Object.entries(rules)) {
        if (!ok) errors.push({ field, message });
    }
    if (errors.length) throw new ValidationError("Los datos enviados no son válidos.", { errors });
}

/**
 * Paginación normalizada desde la URL.
 */
export function parsePagination(url) {
    let page = parseInt(url.searchParams.get("page"), 10);
    let limit = parseInt(url.searchParams.get("limit"), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;
    return { page, limit, offset: (page - 1) * limit };
}

export function paginationMeta(page, limit, total) {
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}
