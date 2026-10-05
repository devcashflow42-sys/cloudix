// Middleware GLOBAL de Cloudflare Pages Functions.
//
// Un archivo `_middleware.js` en la raíz de `functions/` se ejecuta para
// TODAS las rutas. Aquí centralizamos:
//   - Respuesta a preflight CORS (OPTIONS).
//   - Manejo global de errores (cualquier throw -> JSON uniforme).
//   - Cabeceras CORS en todas las respuestas.
//   - Cabeceras de seguridad (anti-clickjacking, nosniff, HSTS...).
import { corsHeaders, withCors } from "./middleware/cors.js";
import { toErrorResponse } from "./utils/errors.js";

const SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// Respuestas con tokens o datos de sesión: nunca deben quedar en caché.
const NO_STORE_PREFIXES = ["/auth/", "/api/login", "/api/record", "/api/recover"];

function withSecurityHeaders(response, request) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    const { pathname } = new URL(request.url);
    if (NO_STORE_PREFIXES.some(p => pathname.startsWith(p))) {
        response.headers.set("Cache-Control", "no-store");
    }
    return response;
}

export async function onRequest(context) {
    const { request, env, next } = context;

    // Preflight CORS.
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    try {
        const response = await next();
        return withSecurityHeaders(withCors(response, env, request), request);
    } catch (err) {
        // Log visible en `wrangler pages deployment tail`.
        console.error("[error]", request.method, new URL(request.url).pathname, err?.stack || err);
        return withSecurityHeaders(withCors(toErrorResponse(err), env, request), request);
    }
}
