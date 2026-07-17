// GET  /groups/:id/messages  -> chat del grupo (solo miembros)
// POST /groups/:id/messages  { content }  -> enviar mensaje al grupo
import { requireAuth } from "../../middleware/auth.js";
import { readJson, is } from "../../utils/validate.js";
import { success, created } from "../../utils/response.js";
import { BadRequestError } from "../../utils/errors.js";
import * as groupService from "../../services/groupService.js";

export async function onRequestGet(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id del grupo no es válido.");
    const messages = await groupService.listMessages(context.env, id, user.id);
    return success({ messages }, { message: "Mensajes del grupo." });
}

export async function onRequestPost(context) {
    const user = await requireAuth(context);
    const { id } = context.params;
    if (!is.uuid(id)) throw new BadRequestError("El id del grupo no es válido.");
    const body = await readJson(context.request);
    const message = await groupService.sendMessage(context.env, id, user.id, body.content);
    return created({ message }, "Mensaje enviado.");
}
