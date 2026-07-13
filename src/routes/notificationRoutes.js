"use strict";

const express = require("express");
const { body } = require("express-validator");
const notificationController = require("../controllers/notificationController");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/authenticate");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Notifications
 *     description: Notificaciones del usuario (grupos, comunidades, solicitudes, eventos).
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Listar notificaciones del usuario autenticado
 *     parameters:
 *       - in: query
 *         name: unread
 *         schema: { type: boolean }
 *         description: Si es true, solo devuelve las no leídas.
 *     responses:
 *       200: { description: Lista paginada de notificaciones }
 */
router.get("/", authenticate, notificationController.list);

/**
 * @swagger
 * /notifications/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Marcar notificaciones como leídas
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string, format: uuid }
 *                 description: Si se omite, marca todas como leídas.
 *     responses:
 *       200: { description: Notificaciones marcadas como leídas }
 */
router.post("/read",
    authenticate,
    validate([
        body("ids").optional().isArray({ max: 500 }),
        body("ids.*").optional().isUUID(),
    ]),
    notificationController.markRead,
);

module.exports = router;
