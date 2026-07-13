// Respuestas JSON uniformes para toda la API.
//
// Éxito: { success: true, message, data, meta? }
// Error: { success: false, message, error: { code, details? } }

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function json(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...JSON_HEADERS, ...headers },
    });
}

export function success(data = {}, { message = "OK", status = 200, meta } = {}) {
    const body = { success: true, message, data };
    if (meta) body.meta = meta;
    return json(body, status);
}

export function created(data = {}, message = "Recurso creado.") {
    return success(data, { message, status: 201 });
}

export function paginated(data = [], pagination, message = "OK") {
    return json({ success: true, message, data, meta: { pagination } }, 200);
}

export function errorResponse(message = "Error interno.", { code = "INTERNAL_ERROR", status = 500, details } = {}) {
    const body = { success: false, message, error: { code } };
    if (details !== undefined) body.error.details = details;
    return json(body, status);
}

export function noContent() {
    return new Response(null, { status: 204 });
}
