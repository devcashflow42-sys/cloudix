"use strict";

const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { PayloadTooLargeError, BadRequestError } = require("../utils/AppError");
const { classifyKind, generateStoredName } = require("../utils/fileMeta");
const env = require("../config/env");

/**
 * Devuelve el subdirectorio de almacenamiento según kind.
 */
function subdirForKind(kind) {
    return ({
        image:    "images",
        video:    "videos",
        audio:    "audio",
        document: "documents",
        podcast:  "podcasts",
        other:    "others",
    })[kind] || "others";
}

function maxSizeForKind(kind) {
    return ({
        image:    env.MAX_FILE_SIZE_IMAGE,
        video:    env.MAX_FILE_SIZE_VIDEO,
        audio:    env.MAX_FILE_SIZE_AUDIO,
        document: env.MAX_FILE_SIZE_DOCUMENT,
        podcast:  env.MAX_FILE_SIZE_PODCAST,
        other:    env.MAX_FILE_SIZE_OTHER,
    })[kind] || env.MAX_FILE_SIZE_OTHER;
}

/**
 * MIME types permitidos por categoría. Puedes ampliar según necesidad.
 */
const ALLOWED_MIME = {
    image: [
        "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/bmp", "image/tiff",
    ],
    video: [
        "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska",
    ],
    audio: [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/aac", "audio/flac", "audio/mp4",
    ],
    document: [
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain", "text/csv", "text/markdown", "application/rtf", "application/zip",
    ],
    podcast: [
        "audio/mpeg", "audio/mp3", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/webm", "audio/flac",
    ],
    other: null, // se acepta todo salvo los peligrosos
};

const BLOCKED_EXTENSIONS = new Set([
    ".exe", ".msi", ".bat", ".cmd", ".sh", ".ps1", ".php", ".jsp", ".asp", ".aspx", ".vbs", ".scr", ".dll",
]);

function buildStorage(kind) {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.resolve(process.cwd(), env.STORAGE_ROOT, subdirForKind(kind));
            fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
        },
        filename: (req, file, cb) => {
            const stored = generateStoredName(file.originalname, file.mimetype);
            cb(null, stored);
        },
    });
}

/**
 * Factory que construye un middleware Multer para un `kind`.
 * El kind puede venir del `hint` de la URL (ej: /media/upload/image)
 * o forzarse en el llamador.
 */
function uploadSingle(kindHint) {
    return function (req, res, next) {
        // Permite override por header o body cuando la ruta es genérica
        const kind = kindHint || req.body?.kind || "other";
        const upload = multer({
            storage: buildStorage(kind),
            limits: {
                fileSize: maxSizeForKind(kind),
                files: 1,
                fieldSize: 1024 * 1024,
            },
            fileFilter: (req2, file, cb) => {
                const ext = path.extname(file.originalname || "").toLowerCase();
                if (BLOCKED_EXTENSIONS.has(ext)) {
                    return cb(new BadRequestError(`Extensión de archivo no permitida: ${ext}`));
                }
                const detectedKind = classifyKind(file.mimetype, kind);
                const allowedList = ALLOWED_MIME[detectedKind];
                if (allowedList && !allowedList.includes(file.mimetype)) {
                    return cb(new BadRequestError(
                        `Tipo MIME no permitido para ${detectedKind}: ${file.mimetype}`,
                    ));
                }
                cb(null, true);
            },
        }).single("file");

        upload(req, res, function (err) {
            if (!err) return next();
            if (err.code === "LIMIT_FILE_SIZE") {
                return next(new PayloadTooLargeError(
                    `El archivo excede el tamaño máximo permitido para ${kind}.`,
                ));
            }
            if (err instanceof multer.MulterError) {
                return next(new BadRequestError(`Error subiendo archivo: ${err.message}`));
            }
            next(err);
        });
    };
}

module.exports = {
    uploadSingle,
    subdirForKind,
    maxSizeForKind,
    ALLOWED_MIME,
    BLOCKED_EXTENSIONS,
};
