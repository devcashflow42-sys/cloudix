// POST   /stories/:id/react  { reaction: 'like' | 'love' }  -> reaccionar
// DELETE /stories/:id/react                                  -> quitar reacción
import { requireAuth } from "../../middleware/auth.js";
import { readJson, is } from "../../utils/validate.js";
import { success } from "../../utils/response.js";
import { BadRequestError } from "../../utils/errors.js";
import * as storyService from "../../services/storyService.js";

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la historia no es válido.");
    const body = await readJson(context.request);
    const result = await storyService.setReaction(context.env, id, user.id, body.reaction);
    return success(result, { message: "Reacción registrada." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la historia no es válido.");
    const result = await storyService.removeReaction(context.env, id, user.id);
    return success(result, { message: "Reacción eliminada." });
}
