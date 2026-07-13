// Middleware GLOBAL de Cloudflare Pages Functions.
//
// Un archivo `_middleware.js` en la raíz de `functions/` se ejecuta para
// TODAS las rutas. Aquí centralizamos:
//   - Respuesta a preflight CORS (OPTIONS).
//   - Manejo global de errores (cualquier throw -> JSON uniforme).
//   - Cabeceras CORS en todas las respuestas.
import { corsHeaders, withCors } from "./middleware/cors.js";
import { toErrorResponse } from "./utils/errors.js";

export async function onRequest(context) {
    const { request, env, next } = context;

    // Preflight CORS.
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    try {
        const response = await next();
        return withCors(response, env, request);
    } catch (err) {
        // Log visible en `wrangler pages deployment tail`.
        console.error("[error]", request.method, new URL(request.url).pathname, err?.stack || err);
        return withCors(toErrorResponse(err), env, request);
    }
}
