"use strict";

const { param, query } = require("express-validator");

const uuidParam = (name = "id") =>
    param(name).isUUID().withMessage(`El parámetro ${name} debe ser un UUID válido.`);

const paginationQuery = () => [
    query("page").optional().isInt({ min: 1 }).withMessage("page debe ser un entero >= 1.").toInt(),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit debe estar entre 1 y 100.").toInt(),
    query("sort").optional().isString().isLength({ max: 60 }),
    query("search").optional().isString().isLength({ max: 120 }),
    query("q").optional().isString().isLength({ max: 120 }),
];

module.exports = { uuidParam, paginationQuery };
