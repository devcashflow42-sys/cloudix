"use strict";

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const morgan = require("morgan");
const hpp = require("hpp");
const swaggerUi = require("swagger-ui-express");

const env = require("./config/env");
const swaggerSpec = require("./config/swagger");
const logger = require("./utils/logger");
const sanitizeInputs = require("./middleware/sanitize");
const { globalLimiter } = require("./middleware/rateLimiters");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const routes = require("./routes");

const app = express();

// -------- Seguridad y proxies --------
app.disable("x-powered-by");
app.set("trust proxy", 1);  // necesario para X-Forwarded-For (Neon, proxies, load balancers)

app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },  // permitir servir /files desde otros orígenes
    contentSecurityPolicy: false,                            // desactivado para Swagger UI
}));

// -------- CORS --------
const allowedOrigins = env.CORS_ORIGIN === "*"
    ? "*"
    : env.CORS_ORIGIN.split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: allowedOrigins,
    credentials: env.CORS_CREDENTIALS,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Disposition"],
    maxAge: 86400,
}));

// -------- Parseo --------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// -------- Anti pollution / compresión --------
app.use(hpp());
app.use(compression());

// -------- Logs de acceso --------
if (env.IS_DEVELOPMENT) {
    app.use(morgan("dev"));
} else {
    app.use(morgan("combined", { stream: logger.stream }));
}

// -------- Sanitización XSS global --------
app.use(sanitizeInputs);

// -------- Rate limit global --------
app.use(globalLimiter);

// -------- Archivos estáticos (subidas) --------
const storageAbs = path.isAbsolute(env.STORAGE_ROOT)
    ? env.STORAGE_ROOT
    : path.resolve(process.cwd(), env.STORAGE_ROOT);
app.use("/files", express.static(storageAbs, {
    dotfiles: "ignore",
    etag: true,
    lastModified: true,
    maxAge: env.IS_PRODUCTION ? "7d" : 0,
    fallthrough: true,
}));

// -------- Documentación Swagger --------
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: `${env.APP_NAME} · Docs`,
    swaggerOptions: {
        persistAuthorization: true,
        docExpansion: "none",
        filter: true,
    },
}));
app.get("/docs.json", (req, res) => res.json(swaggerSpec));

// -------- API --------
app.use(env.API_PREFIX, routes);

// -------- Ping raíz --------
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: `${env.APP_NAME} en línea.`,
        data: {
            version: "1.0.0",
            environment: env.NODE_ENV,
            apiBase: env.API_PREFIX,
            docs: "/docs",
        },
    });
});

// -------- 404 --------
app.use(notFoundHandler);

// -------- Error handler global --------
app.use(errorHandler);

module.exports = app;
