"use strict";

const { body } = require("express-validator");
const { ALL_ROLES } = require("../config/roles");

const updateProfile = [
    body("firstName").optional().isString().isLength({ max: 100 }),
    body("lastName").optional().isString().isLength({ max: 100 }),
    body("bio").optional().isString().isLength({ max: 1000 }),
    body("phone").optional().isString().isLength({ max: 30 }),
    body("language").optional().isString().isLength({ max: 10 }),
    body("avatarUrl").optional().isString().isLength({ max: 1024 }).isURL().withMessage("avatarUrl debe ser una URL válida."),
];

const setRoles = [
    body("roles")
        .exists({ checkFalsy: true }).withMessage("Debes indicar la lista de roles.")
        .isArray({ min: 1 }).withMessage("roles debe ser un array con al menos un elemento."),
    body("roles.*")
        .isIn(ALL_ROLES).withMessage(`Cada rol debe ser uno de: ${ALL_ROLES.join(", ")}.`),
];

const setStatus = [
    body("isActive").exists().isBoolean().withMessage("isActive debe ser boolean.").toBoolean(),
];

module.exports = { updateProfile, setRoles, setStatus };
