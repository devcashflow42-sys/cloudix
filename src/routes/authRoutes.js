"use strict";

const express = require("express");
const authController = require("../controllers/authController");
const authValidators = require("../validators/authValidators");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/authenticate");
const { authLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Registrar un nuevo usuario
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string, minLength: 3, maxLength: 30 }
 *               email:    { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *               firstName: { type: string }
 *               lastName:  { type: string }
 *               language:  { type: string, example: "es" }
 *     responses:
 *       201: { description: Usuario creado, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       409: { description: Email o username duplicado }
 */
router.post("/register", authLimiter, validate(authValidators.register), authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier: { type: string, description: "Email o username" }
 *               password:   { type: string }
 *     responses:
 *       200: { description: Sesión iniciada, content: { application/json: { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/login", authLimiter, validate(authValidators.login), authController.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Renovar el access token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Tokens renovados }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/refresh", authLimiter, validate(authValidators.refresh), authController.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar sesión actual (revoca refresh token)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Sesión cerrada }
 */
router.post("/logout", authController.logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar todas las sesiones del usuario
 *     responses:
 *       200: { description: Todas las sesiones cerradas }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/logout-all", authenticate, authController.logoutAll);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Solicitar restablecimiento de contraseña
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200: { description: Solicitud aceptada (siempre, aunque el email no exista) }
 */
router.post("/forgot-password", authLimiter, validate(authValidators.forgotPassword), authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Restablecer contraseña usando un token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token:       { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Contraseña actualizada }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.post("/reset-password", authLimiter, validate(authValidators.resetPassword), authController.resetPassword);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Cambiar contraseña estando autenticado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Contraseña actualizada }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post("/change-password", authenticate, validate(authValidators.changePassword), authController.changePassword);

/**
 * @swagger
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verificar el correo con el token recibido
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string }
 *     responses:
 *       200: { description: Correo verificado }
 */
router.post("/verify-email", authLimiter, validate(authValidators.verifyEmail), authController.verifyEmail);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Reenviar el correo de verificación
 *     responses:
 *       200: { description: Correo reenviado }
 *       409: { description: Correo ya verificado }
 */
router.post("/resend-verification", authenticate, authLimiter, authController.resendVerification);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Información básica de la sesión activa
 *     responses:
 *       200: { description: Usuario actual }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/me", authenticate, authController.me);

module.exports = router;
