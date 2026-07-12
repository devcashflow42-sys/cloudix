"use strict";

/**
 * Envuelve un handler async de Express para propagar los rejects
 * al middleware de errores. Evita repetir try/catch en cada controlador.
 *
 * Uso:
 *   router.get("/", asyncHandler(async (req, res) => { ... }))
 */
module.exports = function asyncHandler(fn) {
    return function wrapped(req, res, next) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
