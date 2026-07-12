"use strict";

const express = require("express");
const { body } = require("express-validator");
const tagController = require("../controllers/tagController");
const commonValidators = require("../validators/commonValidators");
const validate = require("../middleware/validate");
const { authenticate, authenticateOptional } = require("../middleware/authenticate");
const { authorizeMinLevel } = require("../middleware/authorize");
const { ROLES } = require("../config/roles");

const router = express.Router();

const createBody = [
    body("names").optional().isArray({ min: 1 }),
    body("names.*").optional().isString().isLength({ min: 1, max: 60 }),
    body("name").optional().isString().isLength({ min: 1, max: 60 }),
];

/**
 * @swagger
 * /tags:
 *   get:
 *     tags: [Tags]
 *     summary: Listar etiquetas (por popularidad)
 *     security: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Lista de tags }
 */
router.get("/", authenticateOptional, tagController.list);

/**
 * @swagger
 * /tags:
 *   post:
 *     tags: [Tags, Admin]
 *     summary: Crear una o varias etiquetas (moderador/admin)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               names:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       201: { description: Tags creadas }
 */
router.post("/",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    validate(createBody),
    tagController.create,
);

/**
 * @swagger
 * /tags/{id}:
 *   delete:
 *     tags: [Tags, Admin]
 *     summary: Eliminar una etiqueta
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Etiqueta eliminada }
 */
router.delete("/:id",
    authenticate,
    authorizeMinLevel(ROLES.ADMIN),
    validate([commonValidators.uuidParam("id")]),
    tagController.remove,
);

module.exports = router;
