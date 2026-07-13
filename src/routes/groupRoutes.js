"use strict";

const express = require("express");
const groupController = require("../controllers/groupController");
const groupValidators = require("../validators/groupValidators");
const commonValidators = require("../validators/commonValidators");
const validate = require("../middleware/validate");
const { authenticate, authenticateOptional } = require("../middleware/authenticate");
const { uploadLimiter } = require("../middleware/rateLimiters");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Groups
 *     description: Gestión de grupos, miembros y publicaciones.
 */

/**
 * @swagger
 * /groups:
 *   get:
 *     tags: [Groups]
 *     summary: Listar/buscar grupos
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: privacy
 *         schema: { type: string, enum: [public, private, invite_only] }
 *       - in: query
 *         name: communityId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: mine
 *         schema: { type: boolean }
 *         description: Si es true, devuelve solo los grupos del usuario autenticado.
 *     responses:
 *       200: { description: Lista paginada de grupos }
 *   post:
 *     tags: [Groups]
 *     summary: Crear un grupo
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
 *               communityId: { type: string, format: uuid }
 *               topic: { type: string }
 *               tags: { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Grupo creado }
 */
router.get("/", authenticateOptional, groupController.list);
router.post("/", authenticate, validate(groupValidators.create), groupController.create);

/**
 * @swagger
 * /groups/{id}:
 *   get:
 *     tags: [Groups]
 *     summary: Obtener información de un grupo
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Grupo }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Groups]
 *     summary: Editar un grupo (nombre, descripción, foto, banner, privacidad, configuración)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Grupo actualizado }
 *   delete:
 *     tags: [Groups]
 *     summary: Eliminar un grupo (solo propietario)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Grupo eliminado }
 */
router.get("/:id",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    groupController.getById,
);
router.put("/:id",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...groupValidators.update]),
    groupController.update,
);
router.delete("/:id",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    groupController.remove,
);

// -------------------- Miembros --------------------

/**
 * @swagger
 * /groups/{id}/members:
 *   get:
 *     tags: [Groups]
 *     summary: Listar miembros del grupo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Miembros del grupo }
 */
router.get("/:id/members",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    groupController.listMembers,
);

/**
 * @swagger
 * /groups/{id}/join:
 *   post:
 *     tags: [Groups]
 *     summary: Unirse al grupo (o crear solicitud si es privado)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Unido o solicitud creada }
 */
router.post("/:id/join",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    groupController.join,
);

/**
 * @swagger
 * /groups/{id}/leave:
 *   post:
 *     tags: [Groups]
 *     summary: Salir del grupo
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
    groupController.leave,
);

/**
 * @swagger
 * /groups/{id}/invite:
 *   post:
 *     tags: [Groups]
 *     summary: Invitar usuarios al grupo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string, format: uuid }
 *               userIds: { type: array, items: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Invitaciones procesadas }
 */
router.post("/:id/invite",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...groupValidators.invite]),
    groupController.invite,
);

/**
 * @swagger
 * /groups/{id}/request:
 *   post:
 *     tags: [Groups]
 *     summary: Solicitar unirse a un grupo privado
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Solicitud creada }
 *   get:
 *     tags: [Groups]
 *     summary: Listar solicitudes pendientes (admin/moderador)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Solicitudes pendientes }
 */
router.post("/:id/request",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...groupValidators.request]),
    groupController.request,
);
router.get("/:id/requests",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    groupController.listRequests,
);

/**
 * @swagger
 * /groups/{id}/approve:
 *   post:
 *     tags: [Groups]
 *     summary: Aprobar la solicitud de un usuario
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
 *             required: [userId]
 *             properties: { userId: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Solicitud aprobada }
 */
router.post("/:id/approve",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...groupValidators.targetUser]),
    groupController.approve,
);

/**
 * @swagger
 * /groups/{id}/reject:
 *   post:
 *     tags: [Groups]
 *     summary: Rechazar la solicitud de un usuario
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Solicitud rechazada }
 */
router.post("/:id/reject",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...groupValidators.targetUser]),
    groupController.reject,
);

/**
 * @swagger
 * /groups/{id}/ban:
 *   post:
 *     tags: [Groups]
 *     summary: Banear a un usuario del grupo
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
    validate([commonValidators.uuidParam("id"), ...groupValidators.targetUser]),
    groupController.ban,
);

/**
 * @swagger
 * /groups/{id}/unban:
 *   post:
 *     tags: [Groups]
 *     summary: Desbanear a un usuario del grupo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Usuario desbaneado }
 */
router.post("/:id/unban",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...groupValidators.targetUser]),
    groupController.unban,
);

/**
 * @swagger
 * /groups/{id}/kick:
 *   post:
 *     tags: [Groups]
 *     summary: Expulsar a un usuario del grupo (sin banear)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Usuario expulsado }
 */
router.post("/:id/kick",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...groupValidators.targetUser]),
    groupController.kick,
);

/**
 * @swagger
 * /groups/{id}/role:
 *   post:
 *     tags: [Groups]
 *     summary: Asignar rol a un miembro (solo propietario)
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
    validate([commonValidators.uuidParam("id"), ...groupValidators.setRole]),
    groupController.setRole,
);

// -------------------- Publicaciones --------------------

/**
 * @swagger
 * /groups/{id}/posts:
 *   get:
 *     tags: [Groups]
 *     summary: Listar publicaciones del grupo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Publicaciones }
 *   post:
 *     tags: [Groups]
 *     summary: Publicar en el grupo (texto, imagen, video, música, documento, encuesta, evento, enlace)
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
 *             properties:
 *               type: { type: string, enum: [text, image, video, music, audio, document, poll, event, link] }
 *               body: { type: string }
 *               attachments: { type: array, items: { type: object } }
 *               linkUrl: { type: string }
 *               poll: { type: object }
 *               event: { type: object }
 *     responses:
 *       201: { description: Publicación creada }
 */
router.get("/:id/posts",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    groupController.listPosts,
);
router.post("/:id/posts",
    authenticate,
    uploadLimiter,
    validate([commonValidators.uuidParam("id"), ...groupValidators.createPost]),
    groupController.createPost,
);

/**
 * @swagger
 * /groups/{id}/moderation:
 *   get:
 *     tags: [Groups]
 *     summary: Historial de acciones de moderación del grupo
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
    groupController.moderationHistory,
);

module.exports = router;
