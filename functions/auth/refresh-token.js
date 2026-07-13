// POST /auth/refresh-token
import { readJson, assert, is } from "../utils/validate.js";
import { success } from "../utils/response.js";
import * as authService from "../services/authService.js";

export async function onRequestPost(context) {
    const body = await readJson(context.request);
    assert({ refreshToken: [is.nonEmptyString(body.refreshToken), "Falta el refresh token."] });

    const result = await authService.refresh(context.env, body.refreshToken);
    return success(result, { message: "Token renovado." });
}
