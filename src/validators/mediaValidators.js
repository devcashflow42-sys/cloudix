"use strict";

const { body, query } = require("express-validator");

const KINDS = ["image", "video", "audio", "document", "podcast", "other"];
const STATUSES = ["draft", "published", "archived", "flagged"];

const upload = [
    body("title").exists({ checkFalsy: true }).isString().isLength({ min: 1, max: 255 })
        .withMessage("El título es requerido y debe tener entre 1 y 255 caracteres."),
    body("description").optional().isString().isLength({ max: 5000 }),
    body("categoryId").optional({ nullable: true, checkFalsy: true }).isUUID(),
    body("language").optional().isString().isLength({ max: 10 }),
    body("author").optional().isString().isLength({ max: 150 }),
    body("kind").optional().isIn(KINDS).withMessage(`kind debe ser uno de: ${KINDS.join(", ")}`),
    body("status").optional().isIn(STATUSES).withMessage(`status debe ser uno de: ${STATUSES.join(", ")}`),
    body("isPublic").optional().customSanitizer(v => v === "false" || v === false ? false : true),
    body("tags").optional().custom(value => {
        if (Array.isArray(value)) return true;
        if (typeof value === "string") return true;
        throw new Error("tags debe ser un array o un JSON string.");
    }),
];

const update = [
    body("title").optional().isString().isLength({ min: 1, max: 255 }),
    body("description").optional({ nullable: true }).isString().isLength({ max: 5000 }),
    body("categoryId").optional({ nullable: true, checkFalsy: true }).isUUID(),
    body("language").optional().isString().isLength({ max: 10 }),
    body("author").optional({ nullable: true }).isString().isLength({ max: 150 }),
    body("status").optional().isIn(STATUSES),
    body("isPublic").optional().isBoolean().toBoolean(),
    body("coverUrl").optional({ nullable: true }).isString().isLength({ max: 1024 }),
    body("bannerUrl").optional({ nullable: true }).isString().isLength({ max: 1024 }),
    body("thumbnailUrl").optional({ nullable: true }).isString().isLength({ max: 1024 }),
    body("quality").optional({ nullable: true }).isString().isLength({ max: 20 }),
    body("tags").optional().isArray().withMessage("tags debe ser un array."),
    body("metadata").optional().isObject().withMessage("metadata debe ser un objeto JSON."),
];

const listQuery = [
    query("kind").optional().isIn(KINDS),
    query("status").optional().isIn(STATUSES),
    query("categoryId").optional().isUUID(),
    query("ownerId").optional().isUUID(),
    query("tag").optional().isString().isLength({ max: 80 }),
    query("isPublic").optional().isIn(["true", "false"]),
    query("includeDeleted").optional().isIn(["true", "false"]),
];

module.exports = { upload, update, listQuery, KINDS, STATUSES };
