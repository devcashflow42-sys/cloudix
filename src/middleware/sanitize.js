"use strict";

const { deepSanitize } = require("../utils/sanitize");

/**
 * Sanitiza recursivamente body y params.
 *
 * Nota: en Express 4 `req.query` es un getter; en Express 5 es propiedad
 * de solo lectura. En ambos, hacemos deep-clean sin reemplazar la referencia
 * de req.query para evitar el error "Cannot set property query of #<...>".
 */
module.exports = function sanitizeInputs(req, res, next) {
    if (req.body && typeof req.body === "object") {
        req.body = deepSanitize(req.body);
    }
    if (req.params && typeof req.params === "object") {
        for (const key of Object.keys(req.params)) {
            req.params[key] = deepSanitize(req.params[key]);
        }
    }
    if (req.query && typeof req.query === "object") {
        for (const key of Object.keys(req.query)) {
            req.query[key] = deepSanitize(req.query[key]);
        }
    }
    next();
};
