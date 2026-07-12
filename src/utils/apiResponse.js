"use strict";

/**
 * Formato uniforme de respuestas de la API.
 *
 * Éxito:
 *   { success: true, message: "...", data: {...}, meta?: {...} }
 *
 * Error:
 *   { success: false, message: "...", error: { code, details? } }
 */

function success(res, { message = "Operación realizada correctamente.", data = {}, meta, status = 200 } = {}) {
    const body = { success: true, message, data };
    if (meta) body.meta = meta;
    return res.status(status).json(body);
}

function created(res, opts = {}) {
    return success(res, { status: 201, message: "Recurso creado correctamente.", ...opts });
}

function noContent(res) {
    return res.status(204).end();
}

function paginated(res, { message = "Consulta realizada correctamente.", data = [], pagination, status = 200 } = {}) {
    return res.status(status).json({
        success: true,
        message,
        data,
        meta: { pagination },
    });
}

function error(res, { message = "Ha ocurrido un error.", code = "INTERNAL_ERROR", details, status = 500 } = {}) {
    const body = {
        success: false,
        message,
        error: { code },
    };
    if (details !== undefined) body.error.details = details;
    return res.status(status).json(body);
}

module.exports = {
    success,
    created,
    noContent,
    paginated,
    error,
};
