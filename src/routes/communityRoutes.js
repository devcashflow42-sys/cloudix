"use strict";

const express = require("express");
const communityController = require("../controllers/communityController");
const communityValidators = require("../validators/communityValidators");
const commonValidators = require("../validators/commonValidators");
const validate = require("../middleware/validate");
const { authenticate, authenticateOptional } = require("../middleware/authenticate");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Communities
 *     description: Comunidades que agrupan grupos por temas.
 */

/**
 * @swagger
 * /communities:
 *   get:
 *     tags: [Communities]
 *     summary: Listar/buscar comunidades
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: mine
 *         schema: { type: boolean }
 *     responses:
 *       200: { description: Lista paginada de comunidades }
 *   post:
 *     tags: [Communities]
 *     summary: Crear una comunidad
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               privacy: { type: string, enum: [public, private, invite_only] }
 *               tags: { type: array, items: { type: string } }
 *               categories: { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Comunidad creada }
 */
router.get("/", authenticateOptional, communityController.list);
router.post("/", authenticate, validate(communityValidators.create), communityController.create);

/**
 * @swagger
 * /communities/{id}:
 *   get:
 *     tags: [Communities]
 *     summary: Obtener información de una comunidad
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Comunidad }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Communities]
 *     summary: Editar una comunidad (nombre, descripción, icono, banner, privacidad)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Comunidad actualizada }
 *   delete:
 *     tags: [Communities]
 *     summary: Eliminar una comunidad (solo fundador)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Comunidad eliminada }
 */
router.get("/:id",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    communityController.getById,
);
router.put("/:id",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...communityValidators.update]),
    communityController.update,
);
router.delete("/:id",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    communityController.remove,
);

/**
 * @swagger
 * /communities/{id}/groups:
 *   get:
 *     tags: [Communities]
 *     summary: Listar los grupos de una comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Grupos de la comunidad }
 *   post:
 *     tags: [Communities]
 *     summary: Crear un grupo dentro de la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: Grupo creado }
 */
router.get("/:id/groups",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    communityController.listGroups,
);
router.post("/:id/groups",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...communityValidators.createGroup]),
    communityController.createGroup,
);

/**
 * @swagger
 * /communities/{id}/members:
 *   get:
 *     tags: [Communities]
 *     summary: Listar miembros de la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Miembros de la comunidad }
 */
router.get("/:id/members",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    communityController.listMembers,
);

/**
 * @swagger
 * /communities/{id}/invite:
 *   post:
 *     tags: [Communities]
 *     summary: Invitar usuarios a la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Invitaciones procesadas }
 */
router.post("/:id/invite",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...communityValidators.invite]),
    communityController.invite,
);

/**
 * @swagger
 * /communities/{id}/join:
 *   post:
 *     tags: [Communities]
 *     summary: Unirse a la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Unido a la comunidad }
 */
router.post("/:id/join",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    communityController.join,
);

/**
 * @swagger
 * /communities/{id}/leave:
 *   post:
 *     tags: [Communities]
 *     summary: Salir de la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Salida realizada }
 */
router.post("/:id/leave",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    communityController.leave,
);

/**
 * @swagger
 * /communities/{id}/stats:
 *   get:
 *     tags: [Communities]
 *     summary: Estadísticas de la comunidad (miembros, grupos, publicaciones, crecimiento)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Estadísticas }
 */
router.get("/:id/stats",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    communityController.stats,
);

/**
 * @swagger
 * /communities/{id}/role:
 *   post:
 *     tags: [Communities]
 *     summary: Asignar rol a un miembro (admin/fundador)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Rol actualizado }
 */
router.post("/:id/role",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...communityValidators.setRole]),
    communityController.setRole,
);

/**
 * @swagger
 * /communities/{id}/suspend:
 *   post:
 *     tags: [Communities]
 *     summary: Suspender a un usuario de la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Usuario suspendido }
 */
router.post("/:id/suspend",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...communityValidators.targetUser]),
    communityController.suspend,
);

/**
 * @swagger
 * /communities/{id}/ban:
 *   post:
 *     tags: [Communities]
 *     summary: Banear a un usuario de la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Usuario baneado }
 */
router.post("/:id/ban",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...communityValidators.targetUser]),
    communityController.ban,
);

/**
 * @swagger
 * /communities/{id}/moderation:
 *   get:
 *     tags: [Communities]
 *     summary: Historial de acciones de moderación de la comunidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Historial de moderación }
 */
router.get("/:id/moderation",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    communityController.moderationHistory,
);

module.exports = router;
