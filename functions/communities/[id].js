// GET    /communities/:id  -> detalle (con mi rol)
// DELETE /communities/:id  -> eliminar (solo fundador)
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import { BadRequestError } from "../utils/errors.js";
import * as communityService from "../services/communityService.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la comunidad no es válido.");
    const community = await communityService.detail(context.env, id, me ? me.id : null);
    return success({ community }, { message: "Comunidad obtenida." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id de la comunidad no es válido.");
    const result = await communityService.softDelete(context.env, id, user.id);
    return success(result, { message: "Comunidad eliminada." });
}
