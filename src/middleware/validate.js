"use strict";

const { validationResult } = require("express-validator");
const { ValidationError } = require("../utils/AppError");

/**
 * Ejecuta las validaciones en orden y, si alguna falla, lanza ValidationError
 * con la lista de errores en `details`.
 *
 * Uso:
 *   router.post("/x", validate([...validators]), handler);
 */
function validate(validators = []) {
    return async function (req, res, next) {
        try {
            for (const v of validators) {
                await v.run(req);
            }
            const result = validationResult(req);
            if (!result.isEmpty()) {
                const errors = result.array().map(e => ({
                    field: e.path,
                    message: e.msg,
                    location: e.location,
                    value: e.value,
                }));
                throw new ValidationError("Los datos enviados no son válidos.", { errors });
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = validate;
