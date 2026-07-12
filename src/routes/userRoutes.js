"use strict";

const express = require("express");
const userController = require("../controllers/userController");
const userValidators = require("../validators/userValidators");
const commonValidators = require("../validators/commonValidators");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/authenticate");
const { authorizeMinLevel } = require("../middleware/authorize");
const { ROLES } = require("../config/roles");

const router = express.Router();

/**
 * @swagger
 * /users/profile:
 *   get:
 *     tags: [Users]
 *     summary: Obtener el perfil del usuario autenticado
 *     responses:
 *       200: { description: Perfil obtenido }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get("/profile", authenticate, userController.getProfile);

/**
 * @swagger
 * /users/profile:
 *   put:
 *     tags: [Users]
 *     summary: Actualizar el perfil del usuario autenticado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName:  { type: string }
 *               bio:       { type: string }
 *               phone:     { type: string }
 *               language:  { type: string }
 *               avatarUrl: { type: string, format: uri }
 *     responses:
 *       200: { description: Perfil actualizado }
 *       400: { $ref: '#/components/responses/ValidationError' }
 */
router.put("/profile", authenticate, validate(userValidators.updateProfile), userController.updateProfile);

/**
 * @swagger
 * /users/account:
 *   delete:
 *     tags: [Users]
 *     summary: Eliminar (soft delete) la cuenta del usuario autenticado
 *     responses:
 *       200: { description: Cuenta eliminada }
 */
router.delete("/account", authenticate, userController.deleteAccount);

// --------- Administración ---------

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users, Admin]
 *     summary: Listar usuarios (moderador/admin)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, moderator, premium, user] }
 *       - in: query
 *         name: isActive
 *         schema: { type: string, enum: ["true","false"] }
 *       - in: query
 *         name: includeDeleted
 *         schema: { type: string, enum: ["true","false"] }
 *     responses:
 *       200: { description: Lista de usuarios }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    validate(commonValidators.paginationQuery()),
    userController.listUsers,
);

/**
 * @swagger
 * /users/stats:
 *   get:
 *     tags: [Users, Admin]
 *     summary: Estadísticas de usuarios
 *     responses:
 *       200: { description: Datos agregados }
 */
router.get("/stats",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    userController.stats,
);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users, Admin]
 *     summary: Obtener un usuario por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Usuario }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    validate([commonValidators.uuidParam("id")]),
    userController.getUserById,
);

/**
 * @swagger
 * /users/{id}/roles:
 *   patch:
 *     tags: [Users, Admin]
 *     summary: Actualizar los roles de un usuario (admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roles]
 *             properties:
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [admin, moderator, premium, user]
 *     responses:
 *       200: { description: Roles actualizados }
 */
router.patch("/:id/roles",
    authenticate,
    authorizeMinLevel(ROLES.ADMIN),
    validate([commonValidators.uuidParam("id"), ...userValidators.setRoles]),
    userController.setRoles,
);

/**
 * @swagger
 * /users/{id}/status:
 *   patch:
 *     tags: [Users, Admin]
 *     summary: Activar o desactivar un usuario
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Estado actualizado }
 */
router.patch("/:id/status",
    authenticate,
    authorizeMinLevel(ROLES.ADMIN),
    validate([commonValidators.uuidParam("id"), ...userValidators.setStatus]),
    userController.setStatus,
);

module.exports = router;
