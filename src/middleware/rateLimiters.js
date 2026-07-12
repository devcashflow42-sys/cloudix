"use strict";

const rateLimit = require("express-rate-limit");
const env = require("../config/env");

function buildLimiter({ windowMs, max, message, prefix = "" }) {
    return rateLimit({
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        // Distingue por IP + usuario autenticado (evita compartir contador entre usuarios detrás de un mismo NAT).
        keyGenerator: (req) => `${prefix}${req.user?.id || req.ip}`,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message,
                error: { code: "TOO_MANY_REQUESTS" },
            });
        },
    });
}

const globalLimiter = buildLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    prefix: "global:",
    message: "Has superado el límite de solicitudes. Intenta de nuevo más tarde.",
});

const authLimiter = buildLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_AUTH_MAX,
    prefix: "auth:",
    message: "Demasiados intentos de autenticación. Intenta de nuevo más tarde.",
});

const uploadLimiter = buildLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_UPLOAD_MAX,
    prefix: "upload:",
    message: "Demasiadas subidas en poco tiempo. Intenta más tarde.",
});

module.exports = {
    globalLimiter,
    authLimiter,
    uploadLimiter,
};
