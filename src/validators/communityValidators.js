"use strict";

const { body } = require("express-validator");
const { COMMUNITY_ROLES } = require("../config/groupRoles");

const PRIVACY = ["public", "private", "invite_only"];
const ASSIGNABLE_ROLES = [
    COMMUNITY_ROLES.ADMIN,
    COMMUNITY_ROLES.MODERATOR,
    COMMUNITY_ROLES.COLLABORATOR,
    COMMUNITY_ROLES.MEMBER,
];

const create = [
    body("name").exists({ checkFalsy: true }).withMessage("El nombre es requerido.")
        .isString().isLength({ min: 3, max: 150 }),
    body("description").optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body("privacy").optional().isIn(PRIVACY),
    body("rules").optional({ nullable: true }).isString().isLength({ max: 8000 }),
    body("tags").optional().isArray({ max: 30 }),
    body("tags.*").optional().isString().isLength({ max: 40 }),
    body("categories").optional().isArray({ max: 30 }),
    body("categories.*").optional().isString().isLength({ max: 60 }),
];

const update = [
    body("name").optional().isString().isLength({ min: 3, max: 150 }),
    body("description").optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body("privacy").optional().isIn(PRIVACY),
    body("iconUrl").optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body("bannerUrl").optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body("rules").optional({ nullable: true }).isString().isLength({ max: 8000 }),
    body("tags").optional().isArray({ max: 30 }),
    body("tags.*").optional().isString().isLength({ max: 40 }),
    body("categories").optional().isArray({ max: 30 }),
    body("categories.*").optional().isString().isLength({ max: 60 }),
];

const createGroup = [
    body("name").exists({ checkFalsy: true }).isString().isLength({ min: 3, max: 150 }),
    body("description").optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body("privacy").optional().isIn(PRIVACY),
    body("topic").optional({ nullable: true }).isString().isLength({ max: 120 }),
    body("tags").optional().isArray({ max: 30 }),
];

const invite = [
    body("userId").optional().isUUID(),
    body("userIds").optional().isArray({ min: 1, max: 100 }),
    body("userIds.*").optional().isUUID(),
    body().custom((value) => {
        if (!value.userId && !(Array.isArray(value.userIds) && value.userIds.length)) {
            throw new Error("Debes indicar userId o userIds.");
        }
        return true;
    }),
];

const targetUser = [
    body("userId").exists({ checkFalsy: true }).withMessage("userId es requerido.").isUUID(),
];

const setRole = [
    body("userId").exists({ checkFalsy: true }).isUUID(),
    body("role").exists({ checkFalsy: true }).isIn(ASSIGNABLE_ROLES)
        .withMessage(`role debe ser uno de: ${ASSIGNABLE_ROLES.join(", ")}.`),
];

module.exports = { create, update, createGroup, invite, targetUser, setRole };
