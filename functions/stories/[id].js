// DELETE /stories/:id  -> eliminar una historia propia
import { requireAuth } from "../middleware/auth.js";
import { is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import { BadRequestError } from "../utils/errors.js";
import * as storyService from "../services/storyService.js";

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la historia no es válido.");
    const result = await storyService.deleteOwn(context.env, user.id, id);
    return success(result, { message: "Historia eliminada." });
}
