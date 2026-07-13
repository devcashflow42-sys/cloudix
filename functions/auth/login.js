// POST /auth/login
import { readJson, assert, is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import * as authService from "../services/authService.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({
        identifier: [is.nonEmptyString(body.identifier), "Indica tu correo o nombre de usuario."],
        password: [is.nonEmptyString(body.password), "La contraseña es requerida."],
    });

    const result = await authService.login(context.env, {
        identifier: body.identifier.trim(),
        password: body.password,
    });

    return success(result, { message: "Sesión iniciada." });
}
