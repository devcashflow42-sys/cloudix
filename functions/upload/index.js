// POST /upload  -> sube un archivo a Cloudflare R2 (multipart/form-data, campo "file")
//
// Requiere el binding R2 `MEDIA_BUCKET` (ver wrangler.toml). Devuelve la clave
// del objeto y, si defines MEDIA_PUBLIC_URL, la URL pública.
import { requireAuth } from "../middleware/auth.js";
import { created } from "../utils/response.js";
import { BadRequestError, AppError } from "../utils/errors.js";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = ["image/", "video/", "audio/", "application/pdf"];

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { env, request } = context;

    if (!env.MEDIA_BUCKET) {
        throw new AppError(
            "El almacenamiento no está configurado. Crea el bucket R2 y activa el binding MEDIA_BUCKET en wrangler.toml.",
            501, "STORAGE_NOT_CONFIGURED",
        );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") throw new BadRequestError("Adjunta un archivo en el campo 'file'.");
    if (file.size > MAX_BYTES) throw new BadRequestError("El archivo supera el máximo de 25 MB.");
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED.some(p => contentType.startsWith(p))) {
        throw new BadRequestError("Tipo de archivo no permitido.");
    }

    const ext = (file.name?.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `uploads/${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    await env.MEDIA_BUCKET.put(key, file.stream(), {
        httpMetadata: { contentType },
    });

    const url = env.MEDIA_PUBLIC_URL ? `${env.MEDIA_PUBLIC_URL.replace(/\/$/, "")}/${key}` : null;
    return created({ key, url, size: file.size, contentType }, "Archivo subido.");
}
