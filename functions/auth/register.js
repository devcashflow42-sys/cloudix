// POST /auth/register
import { readJson, assert, is } from "../utils/validate.js";
import { created } from "../utils/response.js";
import * as authService from "../services/authService.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({
        username: [is.username(body.username), "Usuario 3-30 caracteres (letras, números, . _ -)."],
        email: [is.email(body.email), "El correo no es válido."],
        password: [is.strongPassword(body.password), "La contraseña necesita 8+ caracteres, mayúscula, minúscula y número."],
    });

    const result = await authService.register(context.env, {
        username: body.username.trim(),
        email: body.email.trim().toLowerCase(),
        password: body.password,
        displayName: body.displayName,
    });

    return created(result, "Cuenta creada correctamente.");
}
