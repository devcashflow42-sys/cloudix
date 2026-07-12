"use strict";

const express = require("express");
const { body } = require("express-validator");
const categoryController = require("../controllers/categoryController");
const commonValidators = require("../validators/commonValidators");
const validate = require("../middleware/validate");
const { authenticate, authenticateOptional } = require("../middleware/authenticate");
const { authorizeMinLevel } = require("../middleware/authorize");
const { ROLES } = require("../config/roles");

const router = express.Router();

const createBody = [
    body("name").exists({ checkFalsy: true }).isString().isLength({ min: 1, max: 100 }),
    body("description").optional().isString().isLength({ max: 1000 }),
    body("parentId").optional({ nullable: true, checkFalsy: true }).isUUID(),
];

const updateBody = [
    body("name").optional().isString().isLength({ min: 1, max: 100 }),
    body("description").optional().isString().isLength({ max: 1000 }),
    body("parentId").optional({ nullable: true, checkFalsy: true }).isUUID(),
    body("isActive").optional().isBoolean().toBoolean(),
];

/**
 * @swagger
 * /categories:
 *   get:
 *     tags: [Categories]
 *     summary: Listar categorías
 *     security: []
 *     responses:
 *       200: { description: Lista de categorías }
 */
router.get("/", authenticateOptional, categoryController.list);

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     tags: [Categories]
 *     summary: Obtener una categoría
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Categoría }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get("/:id",
    authenticateOptional,
    validate([commonValidators.uuidParam("id")]),
    categoryController.getById,
);

/**
 * @swagger
 * /categories:
 *   post:
 *     tags: [Categories, Admin]
 *     summary: Crear una categoría (moderador/admin)
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
 *               parentId: { type: string, format: uuid }
 *     responses:
 *       201: { description: Categoría creada }
 */
router.post("/",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    validate(createBody),
    categoryController.create,
);

/**
 * @swagger
 * /categories/{id}:
 *   put:
 *     tags: [Categories, Admin]
 *     summary: Actualizar una categoría
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Categoría actualizada }
 */
router.put("/:id",
    authenticate,
    authorizeMinLevel(ROLES.MODERATOR),
    validate([commonValidators.uuidParam("id"), ...updateBody]),
    categoryController.update,
);

/**
 * @swagger
 * /categories/{id}:
 *   delete:
 *     tags: [Categories, Admin]
 *     summary: Eliminar una categoría
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Categoría eliminada }
 */
router.delete("/:id",
    authenticate,
    authorizeMinLevel(ROLES.ADMIN),
    validate([commonValidators.uuidParam("id")]),
    categoryController.remove,
);

module.exports = router;
