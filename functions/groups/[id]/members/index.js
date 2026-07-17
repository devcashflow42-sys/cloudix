// GET  /groups/:id/members  -> lista de miembros con su rol
// POST /groups/:id/members  { userId }  -> añadir amigo (admin/owner)
import { requireAuth, optionalAuth } from "../../../middleware/auth.js";
import { readJson, is } from "../../../utils/validate.js";
import { success, created } from "../../../utils/response.js";
import { BadRequestError } from "../../../utils/errors.js";
import * as groupService from "../../../services/groupService.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id del grupo no es válido.");
    const data = await groupService.listMembers(context.env, id, me ? me.id : null);
    return success(data, { message: "Miembros obtenidos." });
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id del grupo no es válido.");
    const body = await readJson(context.request);
    if (!is.uuid(body.userId)) throw new BadRequestError("userId debe ser un UUID.");
    const result = await groupService.addMember(context.env, id, user.id, body.userId);
    return created(result, "Miembro añadido.");
}
