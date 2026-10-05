// POST /api/record   (registrar — alias de /auth/register)
import { readJson, assert, is } from "../utils/validate.js";
import { created } from "../utils/response.js";
import * as authService from "../services/authService.js";
import { clientIp } from "../utils/rateLimit.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({
        username: [is.username(body.username), "Usuario 3-30 caracteres (letras, números, . _ -)."],
        email: [is.email(body.email) && body.email.length <= 255, "El correo no es válido."],
        password: [is.strongPassword(body.password), "La contraseña necesita 8+ caracteres, mayúscula, minúscula y número."],
    });

    const result = await authService.register(context.env, {
        username: body.username.trim(),
        email: body.email.trim().toLowerCase(),
        password: body.password,
        displayName: typeof body.displayName === "string" ? body.displayName.trim().slice(0, 100) : undefined,
        ip: clientIp(context.request),
    });

    return created(result, "Cuenta creada correctamente.");
}
