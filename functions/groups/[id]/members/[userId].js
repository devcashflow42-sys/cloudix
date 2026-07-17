// PATCH  /groups/:id/members/:userId  { role }  -> ascender/degradar
// DELETE /groups/:id/members/:userId           -> expulsar (admin) o salir (uno mismo)
import { requireAuth } from "../../../middleware/auth.js";
import { readJson, is } from "../../../utils/validate.js";
import { success } from "../../../utils/response.js";
import { BadRequestError } from "../../../utils/errors.js";
import * as groupService from "../../../services/groupService.js";

export async function onRequestPatch(context) {
    const user = await requireAuth(context);
    const { id, userId } = context.params;
    if (!is.uuid(id) || !is.uuid(userId)) throw new BadRequestError("Identificadores inválidos.");
    const body = await readJson(context.request);
    const result = await groupService.setRole(context.env, id, user.id, userId, body.role);
    return success(result, { message: "Rol actualizado." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id, userId } = context.params;
    if (!is.uuid(id) || !is.uuid(userId)) throw new BadRequestError("Identificadores inválidos.");
    const result = await groupService.removeMember(context.env, id, user.id, userId);
    return success(result, { message: result.left ? "Has salido del grupo." : "Miembro expulsado." });
}
