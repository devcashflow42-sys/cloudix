// POST /auth/reset-password
import { readJson, assert, is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import * as authService from "../services/authService.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({
        token: [is.nonEmptyString(body.token), "Falta el token de restablecimiento."],
        newPassword: [is.strongPassword(body.newPassword), "La contraseña necesita 8+ caracteres, mayúscula, minúscula y número."],
    });

    const result = await authService.resetPassword(context.env, {
        token: body.token,
        newPassword: body.newPassword,
    });
    return success(result, { message: "Contraseña restablecida. Vuelve a iniciar sesión." });
}
