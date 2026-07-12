"use strict";

const authService = require("../services/authService");
const auditService = require("../services/auditService");
const asyncHandler = require("../utils/asyncHandler");
const apiResponse = require("../utils/apiResponse");
const User = require("../models/User");
const env = require("../config/env");

const register = asyncHandler(async (req, res) => {
    const result = await authService.register(req.body);
    await auditService.record(req, {
        action: "user.register",
        resourceType: "user",
        resourceId: result.user.id,
        statusCode: 201,
    });
    const data = {
        user: User.toPublicDTO(result.user, { roles: result.roles }),
    };
    // En dev exponemos el token de verificación para poder probar sin envío de emails.
    if (env.IS_DEVELOPMENT) data.verificationToken = result.verificationToken;
    return apiResponse.created(res, {
        message: "Usuario registrado. Verifica tu correo para activar todas las funciones.",
        data,
    });
});

const login = asyncHandler(async (req, res) => {
    const result = await authService.login({
        identifier: req.body.identifier,
        password: req.body.password,
        userAgent: req.get("user-agent"),
        ip: req.ip,
    });
    await auditService.record(req, {
        action: "user.login",
        resourceType: "user",
        resourceId: result.user.id,
        statusCode: 200,
    });
    return apiResponse.success(res, {
        message: "Sesión iniciada correctamente.",
        data: {
            user: User.toPublicDTO(result.user, { roles: result.roles }),
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
        },
    });
});

const refresh = asyncHandler(async (req, res) => {
    const result = await authService.refresh({
        refreshToken: req.body.refreshToken,
        userAgent: req.get("user-agent"),
        ip: req.ip,
    });
    return apiResponse.success(res, {
        message: "Token renovado.",
        data: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
        },
    });
});

const logout = asyncHandler(async (req, res) => {
    await authService.logout({ refreshToken: req.body.refreshToken });
    await auditService.record(req, {
        action: "user.logout",
        resourceType: "user",
        resourceId: req.user?.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Sesión cerrada." });
});

const logoutAll = asyncHandler(async (req, res) => {
    await authService.logoutAll(req.user.id);
    await auditService.record(req, {
        action: "user.logout_all",
        resourceType: "user",
        resourceId: req.user.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Se han cerrado todas las sesiones activas." });
});

const forgotPassword = asyncHandler(async (req, res) => {
    const result = await authService.forgotPassword({ email: req.body.email });
    const data = { emailSent: result.emailSent };
    if (env.IS_DEVELOPMENT && result.token) data.resetToken = result.token;
    return apiResponse.success(res, {
        message: "Si el correo existe, recibirás instrucciones para restablecer tu contraseña.",
        data,
    });
});

const resetPassword = asyncHandler(async (req, res) => {
    await authService.resetPassword({
        token: req.body.token,
        newPassword: req.body.newPassword,
    });
    await auditService.record(req, {
        action: "user.password_reset",
        resourceType: "user",
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Contraseña restablecida correctamente." });
});

const changePassword = asyncHandler(async (req, res) => {
    await authService.changePassword({
        userId: req.user.id,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
    });
    await auditService.record(req, {
        action: "user.password_change",
        resourceType: "user",
        resourceId: req.user.id,
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Contraseña actualizada correctamente." });
});

const resendVerification = asyncHandler(async (req, res) => {
    const result = await authService.sendVerification({ userId: req.user.id });
    const data = {};
    if (env.IS_DEVELOPMENT) data.verificationToken = result.verificationToken;
    return apiResponse.success(res, {
        message: "Correo de verificación reenviado.",
        data,
    });
});

const verifyEmail = asyncHandler(async (req, res) => {
    await authService.verifyEmail({ token: req.body.token });
    await auditService.record(req, {
        action: "user.email_verified",
        resourceType: "user",
        statusCode: 200,
    });
    return apiResponse.success(res, { message: "Correo verificado correctamente." });
});

const me = asyncHandler(async (req, res) => {
    return apiResponse.success(res, {
        message: "Sesión activa.",
        data: { user: req.user },
    });
});

module.exports = {
    register,
    login,
    refresh,
    logout,
    logoutAll,
    forgotPassword,
    resetPassword,
    changePassword,
    resendVerification,
    verifyEmail,
    me,
};
