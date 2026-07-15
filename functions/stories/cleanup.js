// POST /stories/cleanup  -> tarea programada que elimina historias vencidas.
//
// Protegido con un secreto (CRON_SECRET) para que solo lo invoque el
// planificador (GitHub Actions, un Cron Worker de Cloudflare, cron-job.org…).
//
// Cabecera esperada:  X-Cron-Secret: <CRON_SECRET>   (o Authorization: Bearer <CRON_SECRET>)
import { success } from "../utils/response.js";
import { AppError, UnauthorizedError } from "../utils/errors.js";
import * as storyService from "../services/storyService.js";

export async function onRequestPost(context) {
    const { env, request } = context;

    if (!env.CRON_SECRET) {
        throw new AppError(
            "Limpieza no configurada. Define el secreto CRON_SECRET en el proyecto.",
            501, "NOT_CONFIGURED",
        );
    }

    const provided =
        request.headers.get("X-Cron-Secret") ||
        (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

    if (provided !== env.CRON_SECRET) {
        throw new UnauthorizedError("Secreto de limpieza inválido.");
    }

    const result = await storyService.cleanupExpired(env, 1000);
    return success(result, { message: `Historias expiradas eliminadas: ${result.deleted}.` });
}
