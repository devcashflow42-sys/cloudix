// POST /api/login   (alias de /auth/login)
import { readJson, assert, is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import * as authService from "../services/authService.js";
import { clientIp } from "../utils/rateLimit.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({
        identifier: [is.nonEmptyString(body.identifier) && body.identifier.length <= 255, "Indica tu correo o nombre de usuario."],
        password: [is.nonEmptyString(body.password) && body.password.length <= 1024, "La contraseña es requerida."],
    });

    const result = await authService.login(context.env, {
        identifier: body.identifier.trim(),
        password: body.password,
        ip: clientIp(context.request),
    });

    return success(result, { message: "Sesión iniciada." });
}
