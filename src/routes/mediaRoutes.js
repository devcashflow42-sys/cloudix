"use strict";

const express = require("express");
const mediaController = require("../controllers/mediaController");
const mediaValidators = require("../validators/mediaValidators");
const commonValidators = require("../validators/commonValidators");
const validate = require("../middleware/validate");
const { authenticate, authenticateOptional } = require("../middleware/authenticate");
const { authorizeMinLevel } = require("../middleware/authorize");
const { uploadSingle } = require("../middleware/upload");
const { uploadLimiter } = require("../middleware/rateLimiters");
const { ROLES } = require("../config/roles");

const router = express.Router();

/**
 * @swagger
 * /media:
 *   get:
 *     tags: [Media]
 *     summary: Listar archivos multimedia con filtros y paginación
 *     security: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: "created_at:desc" }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: kind
 *         schema: { type: string, enum: [image, video, audio, document, podcast, other] }
 *       - in: query
 *         name: categoryId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: tag
 *         schema: { type: string }
 *       - in: query
 *         name: ownerId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived, flagged] }
 *       - in: query
 *         name: isPublic
 *         schema: { type: string, enum: ["true", "false"] }
 *     responses:
 *       200: { description: Lista paginada de multimedia }
 */
router.get("/",
    authenticateOptional,
    validate([...commonValidators.paginationQuery(), ...mediaValidators.listQuery]),
    mediaController.list,
);

/**
 * @swagger
 * /media/stats:
 *   get:
 *     tags: [Media, Admin]
 *     summary: Estadísticas globales de multimedia
 *     responses:
 *       200: { description: Datos agregados }
 */
router.get("/stats",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    mediaController.stats,
);

/**
 * @swagger
 * /media/upload:
 *   post:
 *     tags: [Media]
 *     summary: Subir un nuevo archivo multimedia
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, title]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               title:       { type: string }
 *               description: { type: string }
 *               categoryId:  { type: string, format: uuid }
 *               language:    { type: string }
 *               author:      { type: string }
 *               kind:        { type: string, enum: [image, video, audio, document, podcast, other] }
 *               status:      { type: string, enum: [draft, published, archived, flagged] }
 *               isPublic:    { type: boolean }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       201: { description: Archivo subido }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       413: { description: Archivo demasiado grande }
 */
router.post("/upload",
    authenticate,
    uploadLimiter,
    uploadSingle(),                     // multer procesa el multipart
    validate(mediaValidators.upload),   // ahora req.body ya tiene los campos
    mediaController.upload,
);

/**
 * @swagger
 * /media/{id}:
 *   get:
 *     tags: [Media]
 *     summary: Obtener un archivo multimedia por ID
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Detalles del archivo }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    mediaController.getById,
);

/**
 * @swagger
 * /media/{id}:
 *   put:
 *     tags: [Media]
 *     summary: Actualizar metadatos de un archivo (dueño o moderador)
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
 *               title:       { type: string }
 *               description: { type: string }
 *               categoryId:  { type: string, format: uuid }
 *               language:    { type: string }
 *               author:      { type: string }
 *               status:      { type: string, enum: [draft, published, archived, flagged] }
 *               isPublic:    { type: boolean }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *               metadata: { type: object }
 *     responses:
 *       200: { description: Archivo actualizado }
 */
router.put("/:id",
    authenticate,
    validate([commonValidators.uuidParam("id"), ...mediaValidators.update]),
    mediaController.update,
);

/**
 * @swagger
 * /media/{id}:
 *   delete:
 *     tags: [Media]
 *     summary: Eliminar (soft delete) un archivo multimedia
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Archivo archivado }
 */
router.delete("/:id",
    authenticate,
    validate([commonValidators.uuidParam("id")]),
    mediaController.remove,
);

/**
 * @swagger
 * /media/{id}/restore:
 *   post:
 *     tags: [Media, Admin]
 *     summary: Restaurar un archivo archivado (moderador/admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Archivo restaurado }
 */
router.post("/:id/restore",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    validate([commonValidators.uuidParam("id")]),
    mediaController.restore,
);

/**
 * @swagger
 * /media/{id}/hard-delete:
 *   delete:
 *     tags: [Media, Admin]
 *     summary: Eliminar definitivamente un archivo (admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Archivo eliminado definitivamente }
 */
router.delete("/:id/hard-delete",
    authenticate,
    authorizeMinLevel(ROLES.ADMIN),
    validate([commonValidators.uuidParam("id")]),
    mediaController.hardDelete,
);

/**
 * @swagger
 * /media/{id}/download:
 *   post:
 *     tags: [Media]
 *     summary: Registrar una descarga (incrementa contador)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Descarga registrada }
 */
router.post("/:id/download",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    mediaController.registerDownload,
);

module.exports = router;
