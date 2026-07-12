"use strict";

const path = require("path");
const fs = require("fs");
const { AppError, NotFoundError } = require("../utils/AppError");
const apiResponse = require("../utils/apiResponse");
const logger = require("../utils/logger");
const env = require("../config/env");

/**
 * Traduce errores conocidos de PostgreSQL a AppError.
 */
function mapPgError(err) {
    if (!err || !err.code) return null;
    switch (err.code) {
        case "23505": // unique_violation
            return new AppError(
                "Ya existe un registro con esos datos.",
                409, "UNIQUE_VIOLATION",
                { constraint: err.constraint, detail: err.detail },
            );
        case "23503": // foreign_key_violation
            return new AppError(
                "Referencia inválida a un recurso relacionado.",
                409, "FOREIGN_KEY_VIOLATION",
                { constraint: err.constraint, detail: err.detail },
            );
        case "23502": // not_null_violation
            return new AppError(
                "Falta un campo obligatorio.",
                400, "NOT_NULL_VIOLATION",
                { column: err.column },
            );
        case "22P02": // invalid_text_representation (UUID mal formado, por ejemplo)
            return new AppError("Formato de dato inválido.", 400, "INVALID_INPUT");
        case "42P01": // undefined_table
            return new AppError("Estructura de base de datos incompleta.", 500, "SCHEMA_MISSING");
        default:
            return null;
    }
}

/**
 * Al fallar, si Multer ya guardó el archivo hay que borrarlo para no dejar basura.
 */
function cleanupUploadedFile(req) {
    if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => { /* silencioso */ });
    }
    if (Array.isArray(req.files)) {
        for (const f of req.files) {
            if (f?.path) fs.unlink(f.path, () => { /* silencioso */ });
        }
    }
}

function notFoundHandler(req, res, next) {
    next(new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    cleanupUploadedFile(req);

    let appErr = err instanceof AppError ? err : null;
    if (!appErr) {
        const mapped = mapPgError(err);
        if (mapped) appErr = mapped;
    }
    if (!appErr && err.name === "PayloadTooLargeError") {
        appErr = new AppError("Payload demasiado grande.", 413, "PAYLOAD_TOO_LARGE");
    }
    if (!appErr && err.type === "entity.parse.failed") {
        appErr = new AppError("JSON inválido en el body.", 400, "INVALID_JSON");
    }
    if (!appErr) {
        // Desconocido -> internal
        appErr = new AppError(
            env.IS_PRODUCTION ? "Error interno del servidor." : (err.message || "Error interno."),
            500,
            "INTERNAL_ERROR",
        );
    }

    const isOperational = appErr.isOperational && appErr.statusCode < 500;
    const logPayload = {
        method: req.method,
        path: req.originalUrl,
        statusCode: appErr.statusCode,
        code: appErr.code,
        userId: req.user?.id,
        ip: req.ip,
    };
    if (isOperational) {
        logger.warn(`[${appErr.code}] ${appErr.message}`, logPayload);
    } else {
        logger.error(`[${appErr.code}] ${err.message}`, {
            ...logPayload,
            stack: err.stack,
        });
    }

    return apiResponse.error(res, {
        status: appErr.statusCode,
        message: appErr.message,
        code: appErr.code,
        details: appErr.details,
    });
}

module.exports = { errorHandler, notFoundHandler };
