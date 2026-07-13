"use strict";

const { body } = require("express-validator");
const { GROUP_ROLES } = require("../config/groupRoles");

const PRIVACY = ["public", "private", "invite_only"];
const POST_TYPES = ["text", "image", "video", "music", "audio", "document", "poll", "event", "link"];
const WHO_POST = ["members", "moderators", "admins"];
const WHO_APPROVE = ["moderators", "admins"];
const ASSIGNABLE_ROLES = [GROUP_ROLES.ADMIN, GROUP_ROLES.MODERATOR, GROUP_ROLES.MEMBER];

const create = [
    body("name").exists({ checkFalsy: true }).withMessage("El nombre es requerido.")
        .isString().isLength({ min: 3, max: 150 }),
    body("description").optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body("privacy").optional().isIn(PRIVACY).withMessage(`privacy debe ser uno de: ${PRIVACY.join(", ")}.`),
    body("communityId").optional({ nullable: true, checkFalsy: true }).isUUID(),
    body("topic").optional({ nullable: true }).isString().isLength({ max: 120 }),
    body("rules").optional({ nullable: true }).isString().isLength({ max: 8000 }),
    body("tags").optional().isArray({ max: 30 }),
    body("tags.*").optional().isString().isLength({ max: 40 }),
];

const update = [
    body("name").optional().isString().isLength({ min: 3, max: 150 }),
    body("description").optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body("privacy").optional().isIn(PRIVACY),
    body("photoUrl").optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body("bannerUrl").optional({ nullable: true }).isString().isLength({ max: 2000 }),
    body("topic").optional({ nullable: true }).isString().isLength({ max: 120 }),
    body("rules").optional({ nullable: true }).isString().isLength({ max: 8000 }),
    body("tags").optional().isArray({ max: 30 }),
    body("tags.*").optional().isString().isLength({ max: 40 }),
    body("whoCanPost").optional().isIn(WHO_POST),
    body("whoCanComment").optional().isIn(WHO_POST),
    body("whoCanInvite").optional().isIn(WHO_POST),
    body("whoCanApprove").optional().isIn(WHO_APPROVE),
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

const request = [
    body("message").optional({ nullable: true }).isString().isLength({ max: 1000 }),
];

const targetUser = [
    body("userId").exists({ checkFalsy: true }).withMessage("userId es requerido.").isUUID(),
];

const setRole = [
    body("userId").exists({ checkFalsy: true }).isUUID(),
    body("role").exists({ checkFalsy: true }).isIn(ASSIGNABLE_ROLES)
        .withMessage(`role debe ser uno de: ${ASSIGNABLE_ROLES.join(", ")}.`),
];

const createPost = [
    body("type").optional().isIn(POST_TYPES).withMessage(`type debe ser uno de: ${POST_TYPES.join(", ")}.`),
    body("body").optional({ nullable: true }).isString().isLength({ max: 20000 }),
    body("linkUrl").optional({ nullable: true }).isString().isURL().withMessage("linkUrl debe ser una URL válida."),
    body("attachments").optional().isArray({ max: 20 }),
    body("attachments.*.url").optional().isString().isLength({ max: 2000 }),
    body("poll").optional({ nullable: true }).isObject(),
    body("poll.question").optional().isString().isLength({ max: 300 }),
    body("poll.options").optional().isArray({ min: 2, max: 20 }),
    body("event").optional({ nullable: true }).isObject(),
    body("event.title").optional().isString().isLength({ max: 300 }),
    body().custom((value) => {
        const hasContent = value.body || value.linkUrl
            || (Array.isArray(value.attachments) && value.attachments.length)
            || value.poll || value.event;
        if (!hasContent) throw new Error("La publicación no puede estar vacía.");
        return true;
    }),
];

module.exports = { create, update, invite, request, targetUser, setRole, createPost };
