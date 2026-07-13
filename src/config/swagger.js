"use strict";

const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");
const env = require("./env");

const swaggerDefinition = {
    openapi: "3.0.3",
    info: {
        title: env.APP_NAME,
        version: "1.0.0",
        description:
            "API REST profesional para gestión de usuarios, roles y multimedia. " +
            "Construida con Node.js, Express y PostgreSQL, siguiendo arquitectura por capas.",
        contact: { name: "Nubifly", email: "support@nubifly.local" },
        license: { name: "MIT" },
    },
    servers: [
        { url: `${env.APP_URL}${env.API_PREFIX}`, description: "Servidor actual" },
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
                description: "Token de acceso JWT. Envíalo en el header `Authorization: Bearer <token>`.",
            },
        },
        schemas: {
            SuccessResponse: {
                type: "object",
                properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Operación realizada correctamente." },
                    data: { type: "object" },
                },
            },
            ErrorResponse: {
                type: "object",
                properties: {
                    success: { type: "boolean", example: false },
                    message: { type: "string", example: "Descripción del error." },
                    error: {
                        type: "object",
                        properties: {
                            code: { type: "string", example: "VALIDATION_ERROR" },
                            details: { type: "object" },
                        },
                    },
                },
            },
            Pagination: {
                type: "object",
                properties: {
                    page: { type: "integer", example: 1 },
                    limit: { type: "integer", example: 20 },
                    total: { type: "integer", example: 143 },
                    totalPages: { type: "integer", example: 8 },
                    hasNext: { type: "boolean", example: true },
                    hasPrev: { type: "boolean", example: false },
                },
            },
            User: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    username: { type: "string", example: "david" },
                    email: { type: "string", format: "email", example: "david@example.com" },
                    firstName: { type: "string", example: "David" },
                    lastName: { type: "string", example: "Doe" },
                    avatarUrl: { type: "string", nullable: true },
                    emailVerified: { type: "boolean" },
                    isActive: { type: "boolean" },
                    roles: {
                        type: "array",
                        items: { type: "string", enum: ["admin", "moderator", "premium", "user"] },
                    },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                },
            },
            MediaFile: {
                type: "object",
                properties: {
                    id: { type: "string", format: "uuid" },
                    title: { type: "string" },
                    description: { type: "string", nullable: true },
                    categoryId: { type: "string", format: "uuid", nullable: true },
                    tags: { type: "array", items: { type: "string" } },
                    language: { type: "string", example: "es" },
                    author: { type: "string", nullable: true },
                    kind: { type: "string", enum: ["image", "video", "audio", "document", "podcast", "other"] },
                    format: { type: "string", example: "mp4" },
                    mimeType: { type: "string", example: "video/mp4" },
                    sizeBytes: { type: "integer" },
                    durationSeconds: { type: "number", nullable: true },
                    quality: { type: "string", nullable: true },
                    width: { type: "integer", nullable: true },
                    height: { type: "integer", nullable: true },
                    thumbnailUrl: { type: "string", nullable: true },
                    coverUrl: { type: "string", nullable: true },
                    bannerUrl: { type: "string", nullable: true },
                    fileUrl: { type: "string" },
                    status: {
                        type: "string",
                        enum: ["draft", "published", "archived", "flagged"],
                    },
                    ownerId: { type: "string", format: "uuid" },
                    metadata: { type: "object" },
                    createdAt: { type: "string", format: "date-time" },
                    updatedAt: { type: "string", format: "date-time" },
                },
            },
        },
        responses: {
            Unauthorized: {
                description: "Falta autenticación o el token es inválido.",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
            Forbidden: {
                description: "El usuario no tiene permisos para esta operación.",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
            NotFound: {
                description: "El recurso solicitado no existe.",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
            ValidationError: {
                description: "Los datos enviados no son válidos.",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/ErrorResponse" },
                    },
                },
            },
        },
    },
    security: [{ bearerAuth: [] }],
    tags: [
        { name: "Auth", description: "Autenticación, registro y recuperación." },
        { name: "Users", description: "Gestión de perfil y usuarios." },
        { name: "Media", description: "Subida y gestión de archivos multimedia." },
        { name: "Categories", description: "Categorías de contenido multimedia." },
        { name: "Tags", description: "Etiquetas para contenido." },
        { name: "Groups", description: "Grupos: miembros, roles, publicaciones y moderación." },
        { name: "Communities", description: "Comunidades que agrupan grupos por temas." },
        { name: "Notifications", description: "Notificaciones del usuario." },
        { name: "Admin", description: "Endpoints exclusivos de administración." },
        { name: "System", description: "Salud del sistema y estadísticas." },
    ],
};

const options = {
    definition: swaggerDefinition,
    apis: [
        path.resolve(__dirname, "../routes/*.js"),
        path.resolve(__dirname, "../docs/*.js"),
    ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
