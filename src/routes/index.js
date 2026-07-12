"use strict";

const express = require("express");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const mediaRoutes = require("./mediaRoutes");
const categoryRoutes = require("./categoryRoutes");
const tagRoutes = require("./tagRoutes");
const systemRoutes = require("./systemRoutes");

const router = express.Router();

/**
 * @swagger
 * /:
 *   get:
 *     tags: [System]
 *     summary: Punto de entrada de la API
 *     security: []
 *     responses:
 *       200: { description: Metadatos de la API }
 */
router.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Bienvenido a Nubifly API.",
        data: {
            version: "1.0.0",
            docs: "/docs",
            endpoints: [
                "/auth", "/users", "/media", "/categories", "/tags", "/system",
            ],
        },
    });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/media", mediaRoutes);
router.use("/categories", categoryRoutes);
router.use("/tags", tagRoutes);
router.use("/system", systemRoutes);

module.exports = router;
