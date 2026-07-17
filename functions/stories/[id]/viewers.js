// GET /stories/:id/viewers  -> quién vio la historia (solo el dueño)
import { requireAuth } from "../../middleware/auth.js";
import { is } from "../../utils/validate.js";
import { success } from "../../utils/response.js";
import { BadRequestError } from "../../utils/errors.js";
import * as storyService from "../../services/storyService.js";

export async function onRequestGet(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la historia no es válido.");
    const result = await storyService.getViewers(context.env, id, user.id);
    return success(result, { message: "Espectadores obtenidos." });
}
