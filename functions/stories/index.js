// GET  /stories  -> historias activas (no expiradas), con tiempo restante
// POST /stories  -> crear historia (expira automáticamente en 24h)
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { readJson, assert, is } from "../utils/validate.js";
import { success, created } from "../utils/response.js";
import * as storyService from "../services/storyService.js";

export async function onRequestGet(context) {
    await optionalAuth(context);
    const stories = await storyService.listActive(context.env, { limit: 100 });
    // serverTime permite al cliente calcular el tiempo restante sin depender
    // del reloj local (evita desfases en la cuenta regresiva).
    return success(
        { stories, serverTime: new Date().toISOString() },
        { message: "Historias activas." },
    );
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const body = await readJson(context.request);
    assert({
        mediaUrl: [is.nonEmptyString(body.mediaUrl), "mediaUrl es requerido."],
        mediaType: [storyService.MEDIA_TYPES.includes(body.mediaType),
            `mediaType debe ser: ${storyService.MEDIA_TYPES.join(", ")}.`],
    });
    const story = await storyService.create(context.env, user.id, {
        mediaUrl: body.mediaUrl,
        mediaType: body.mediaType,
        caption: body.caption,
    });
    return created({ story }, "Historia publicada. Expira en 24 horas.");
}
