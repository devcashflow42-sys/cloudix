"use strict";

const express = require("express");
const systemController = require("../controllers/systemController");
const commonValidators = require("../validators/commonValidators");
const validate = require("../middleware/validate");
const { authenticate } = require("../middleware/authenticate");
const { authorizeMinLevel } = require("../middleware/authorize");
const { ROLES } = require("../config/roles");

const router = express.Router();

/**
 * @swagger
 * /system/health:
 *   get:
 *     tags: [System]
 *     summary: Estado de salud del servicio y de la BD
 *     security: []
 *     responses:
 *       200: { description: Servicio operativo }
 *       503: { description: Servicio degradado }
 */
router.get("/health", systemController.health);

/**
 * @swagger
 * /system/stats:
 *   get:
 *     tags: [System, Admin]
 *     summary: Estadísticas globales (usuarios + multimedia)
 *     responses:
 *       200: { description: Estadísticas }
 */
router.get("/stats",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    systemController.stats,
);

/**
 * @swagger
 * /system/audit:
 *   get:
 *     tags: [System, Admin]
 *     summary: Registros de auditoría paginados
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: userId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: resourceType
 *         schema: { type: string }
 *     responses:
 *       200: { description: Registros de auditoría }
 */
router.get("/audit",
    authenticate,
    authorizeMinLevel(ROLES.ADMIN),
    validate(commonValidators.paginationQuery()),
    systemController.audit,
);

module.exports = router;
