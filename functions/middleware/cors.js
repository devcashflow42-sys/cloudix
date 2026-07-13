// Utilidades CORS reutilizables.

export function corsHeaders(env, request) {
    const allowed = env.CORS_ORIGIN || "*";
    const origin = request.headers.get("Origin");
    // Si se configuran orígenes concretos (separados por coma), refleja solo los permitidos.
    let allowOrigin = "*";
    if (allowed !== "*") {
        const list = allowed.split(",").map(s => s.trim());
        allowOrigin = origin && list.includes(origin) ? origin : list[0] || "*";
    }
    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
}

export function withCors(response, env, request) {
    const headers = corsHeaders(env, request);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
}
