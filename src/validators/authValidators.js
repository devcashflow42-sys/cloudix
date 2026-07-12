"use strict";

const { body } = require("express-validator");

const strongPassword = (field = "password") =>
    body(field)
        .isString().withMessage("La contraseña es requerida.")
        .isLength({ min: 8, max: 128 }).withMessage("La contraseña debe tener entre 8 y 128 caracteres.")
        .matches(/[a-z]/).withMessage("La contraseña debe incluir al menos una minúscula.")
        .matches(/[A-Z]/).withMessage("La contraseña debe incluir al menos una mayúscula.")
        .matches(/\d/).withMessage("La contraseña debe incluir al menos un dígito.");

const register = [
    body("username")
        .exists({ checkFalsy: true }).withMessage("El nombre de usuario es requerido.")
        .isString().isLength({ min: 3, max: 30 })
        .matches(/^[A-Za-z0-9_.-]+$/)
        .withMessage("Nombre de usuario 3-30 caracteres, sólo letras, números, guiones, punto o _."),
    body("email")
        .exists({ checkFalsy: true }).withMessage("El correo es requerido.")
        .isEmail().withMessage("El correo no es válido.")
        .isLength({ max: 255 })
        .normalizeEmail({ gmail_remove_dots: false }),
    strongPassword("password"),
    body("firstName").optional().isString().isLength({ max: 100 }),
    body("lastName").optional().isString().isLength({ max: 100 }),
    body("language").optional().isString().isLength({ max: 10 }),
];

const login = [
    body("identifier")
        .exists({ checkFalsy: true }).withMessage("El identificador (email o usuario) es requerido.")
        .isString().isLength({ max: 255 }),
    body("password")
        .exists({ checkFalsy: true }).withMessage("La contraseña es requerida.")
        .isString().isLength({ min: 1, max: 128 }),
];

const refresh = [
    body("refreshToken")
        .exists({ checkFalsy: true }).withMessage("Falta el refresh token.")
        .isString().isLength({ min: 10, max: 4096 }),
];

const forgotPassword = [
    body("email").exists({ checkFalsy: true }).withMessage("El correo es requerido.").isEmail(),
];

const resetPassword = [
    body("token").exists({ checkFalsy: true }).isString().isLength({ min: 20, max: 512 }),
    strongPassword("newPassword"),
];

const changePassword = [
    body("currentPassword").exists({ checkFalsy: true }).isString().isLength({ min: 1, max: 128 }),
    strongPassword("newPassword"),
];

const verifyEmail = [
    body("token").exists({ checkFalsy: true }).isString().isLength({ min: 20, max: 512 }),
];

module.exports = {
    register,
    login,
    refresh,
    forgotPassword,
    resetPassword,
    changePassword,
    verifyEmail,
};
