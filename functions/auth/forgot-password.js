// POST /auth/forgot-password
import { readJson, assert, is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import * as authService from "../services/authService.js";
import { clientIp } from "../utils/rateLimit.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({ email: [is.email(body.email) && body.email.length <= 255, "El correo no es válido."] });

    const result = await authService.forgotPassword(context.env, body.email.trim().toLowerCase(), {
        ip: clientIp(context.request),
    });
    // Respuesta uniforme para no revelar si el correo existe.
    return success(result, { message: "Si el correo existe, enviaremos instrucciones para restablecer la contraseña." });
}
