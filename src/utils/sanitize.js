"use strict";

const xss = require("xss");

/**
 * Sanitiza cualquier valor recursivamente.
 * - Strings: filtra XSS.
 * - Objetos/arrays: recorre cada campo.
 * - Otros tipos: se devuelven sin cambios.
 */
function deepSanitize(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
        return xss(value, {
            whiteList: {}, // sin tags permitidos
            stripIgnoreTag: true,
            stripIgnoreTagBody: ["script"],
        });
    }
    if (Array.isArray(value)) {
        return value.map(deepSanitize);
    }
    if (typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
        const out = {};
        for (const key of Object.keys(value)) {
            out[key] = deepSanitize(value[key]);
        }
        return out;
    }
    return value;
}

module.exports = { deepSanitize };
