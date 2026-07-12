"use strict";

/**
 * Error base de la aplicación. Lo distingue del error del sistema
 * por el flag `isOperational`. Los operacionales son esperables
 * (validación, autenticación, no encontrado) y se muestran al cliente.
 * Los no operacionales se registran como internos.
 */
class AppError extends Error {
    /**
     * @param {string} message
     * @param {number} statusCode
     * @param {string} code
     * @param {object} [details]
     */
    constructor(message, statusCode = 500, code = "INTERNAL_ERROR", details) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message = "Datos inválidos.", details) {
        super(message, 400, "VALIDATION_ERROR", details);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = "No autenticado.") {
        super(message, 401, "UNAUTHORIZED");
    }
}

class ForbiddenError extends AppError {
    constructor(message = "No autorizado.") {
        super(message, 403, "FORBIDDEN");
    }
}

class NotFoundError extends AppError {
    constructor(message = "Recurso no encontrado.") {
        super(message, 404, "NOT_FOUND");
    }
}

class ConflictError extends AppError {
    constructor(message = "Conflicto con el estado actual del recurso.", details) {
        super(message, 409, "CONFLICT", details);
    }
}

class TooManyRequestsError extends AppError {
    constructor(message = "Demasiadas solicitudes.") {
        super(message, 429, "TOO_MANY_REQUESTS");
    }
}

class UnprocessableError extends AppError {
    constructor(message = "Entidad no procesable.", details) {
        super(message, 422, "UNPROCESSABLE_ENTITY", details);
    }
}

class BadRequestError extends AppError {
    constructor(message = "Solicitud inválida.", details) {
        super(message, 400, "BAD_REQUEST", details);
    }
}

class PayloadTooLargeError extends AppError {
    constructor(message = "El archivo excede el tamaño máximo permitido.") {
        super(message, 413, "PAYLOAD_TOO_LARGE");
    }
}

module.exports = {
    AppError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    TooManyRequestsError,
    UnprocessableError,
    BadRequestError,
    PayloadTooLargeError,
};
