// Errores operacionales de la aplicación + traducción a respuestas HTTP.
import { errorResponse } from "./response.js";

export class AppError extends Error {
    constructor(message, status = 500, code = "INTERNAL_ERROR", details) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.code = code;
        this.details = details;
        this.isOperational = true;
    }
}

export class ValidationError extends AppError {
    constructor(message = "Datos inválidos.", details) { super(message, 400, "VALIDATION_ERROR", details); }
}
export class BadRequestError extends AppError {
    constructor(message = "Solicitud inválida.", details) { super(message, 400, "BAD_REQUEST", details); }
}
export class UnauthorizedError extends AppError {
    constructor(message = "No autenticado.") { super(message, 401, "UNAUTHORIZED"); }
}
export class ForbiddenError extends AppError {
    constructor(message = "No autorizado.") { super(message, 403, "FORBIDDEN"); }
}
export class NotFoundError extends AppError {
    constructor(message = "Recurso no encontrado.") { super(message, 404, "NOT_FOUND"); }
}
export class ConflictError extends AppError {
    constructor(message = "Conflicto con el estado actual.", details) { super(message, 409, "CONFLICT", details); }
}
export class TooManyRequestsError extends AppError {
    constructor(message = "Demasiadas solicitudes.") { super(message, 429, "TOO_MANY_REQUESTS"); }
}

/**
 * Traduce cualquier error a una Response JSON. Los errores de PostgreSQL
 * conocidos se mapean a códigos legibles; el resto se ocultan como 500.
 */
export function toErrorResponse(err) {
    if (err instanceof AppError) {
        return errorResponse(err.message, { code: err.code, status: err.status, details: err.details });
    }
    // Errores de PostgreSQL (Neon expone err.code SQLSTATE).
    switch (err?.code) {
        case "23505":
            return errorResponse("Ya existe un registro con esos datos.", { code: "UNIQUE_VIOLATION", status: 409 });
        case "23503":
            return errorResponse("Referencia inválida a un recurso relacionado.", { code: "FOREIGN_KEY_VIOLATION", status: 409 });
        case "23502":
            return errorResponse("Falta un campo obligatorio.", { code: "NOT_NULL_VIOLATION", status: 400 });
        case "22P02":
            return errorResponse("Formato de dato inválido.", { code: "INVALID_INPUT", status: 400 });
        default:
            return errorResponse("Error interno del servidor.", { code: "INTERNAL_ERROR", status: 500 });
    }
}
