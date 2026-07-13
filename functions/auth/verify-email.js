// POST /auth/verify-email   (o GET /auth/verify-email?token=...)
import { readJson, assert, is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import * as authService from "../services/authService.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({ token: [is.nonEmptyString(body.token), "Falta el token de verificación."] });
    const result = await authService.verifyEmail(context.env, body.token);
    return success(result, { message: "Correo verificado." });
}

export async function onRequestGet(context) {
    const token = new URL(context.request.url).searchParams.get("token") || "";
    assert({ token: [is.nonEmptyString(token), "Falta el token de verificación."] });
    const result = await authService.verifyEmail(context.env, token);
    return success(result, { message: "Correo verificado." });
}
