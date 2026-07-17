// GET    /groups/:id  -> detalle del grupo (con mi rol)
// DELETE /groups/:id  -> eliminar (solo propietario)
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import { BadRequestError } from "../utils/errors.js";
import * as groupService from "../services/groupService.js";

export async function onRequestGet(context) {
    const me = await optionalAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id del grupo no es válido.");
    const group = await groupService.detail(context.env, id, me ? me.id : null);
    return success({ group }, { message: "Grupo obtenido." });
}

export async function onRequestDelete(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id del grupo no es válido.");
    const result = await groupService.softDelete(context.env, id, user.id);
    return success(result, { message: "Grupo eliminado." });
}
