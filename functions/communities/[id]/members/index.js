// GET  /communities/:id/members  -> lista de miembros con su rol
// POST /communities/:id/members  { userId }  -> añadir amigo (admin/fundador)
import { requireAuth, optionalAuth } from "../../../middleware/auth.js";
import { readJson, is } from "../../../utils/validate.js";
import { success, created } from "../../../utils/response.js";
import { BadRequestError } from "../../../utils/errors.js";
import * as communityService from "../../../services/communityService.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la comunidad no es válido.");
    const data = await communityService.listMembers(context.env, id, me ? me.id : null);
    return success(data, { message: "Miembros obtenidos." });
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la comunidad no es válido.");
    const body = await readJson(context.request);
    if (!is.uuid(body.userId)) throw new BadRequestError("userId debe ser un UUID.");
    const result = await communityService.addMember(context.env, id, user.id, body.userId);
    return created(result, "Miembro añadido.");
}
