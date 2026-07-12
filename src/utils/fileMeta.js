"use strict";

const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const crypto = require("crypto");
const mime = require("mime-types");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const env = require("../config/env");
const logger = require("./logger");

/**
 * Clasifica un archivo por su MIME en una de las categorías internas.
 * Devuelve una de: image | video | audio | document | podcast | other
 * `podcast` no se detecta automáticamente por MIME (es un audio también);
 * se marca cuando el cliente lo elige explícitamente al subir.
 */
function classifyKind(mimetype, hint) {
    if (hint && ["image", "video", "audio", "document", "podcast", "other"].includes(hint)) {
        return hint;
    }
    if (!mimetype) return "other";
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("video/")) return "video";
    if (mimetype.startsWith("audio/")) return "audio";
    const docMimes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/csv",
        "text/markdown",
        "application/rtf",
    ];
    if (docMimes.includes(mimetype)) return "document";
    return "other";
}

function extFromMime(mimetype, fallback = "bin") {
    const ext = mime.extension(mimetype);
    return ext || fallback;
}

/**
 * Genera un nombre único con hash + timestamp preservando la extensión.
 */
function generateStoredName(originalName, mimetype) {
    const rand = crypto.randomBytes(8).toString("hex");
    const ts = Date.now();
    const ext = (path.extname(originalName || "") || `.${extFromMime(mimetype)}`).toLowerCase();
    return `${ts}-${rand}${ext}`;
}

/**
 * Extrae metadatos de una imagen usando sharp.
 */
async function extractImageMeta(absPath) {
    try {
        const meta = await sharp(absPath).metadata();
        return {
            width: meta.width || null,
            height: meta.height || null,
            format: meta.format || null,
            hasAlpha: !!meta.hasAlpha,
            orientation: meta.orientation || null,
            channels: meta.channels || null,
            density: meta.density || null,
        };
    } catch (err) {
        logger.warn("No se pudieron extraer metadatos de imagen", { err: err.message });
        return {};
    }
}

/**
 * Genera una miniatura de imagen (jpeg, ancho máx 512).
 * Devuelve ruta relativa a STORAGE_ROOT.
 */
async function generateImageThumbnail(absPath, storedName) {
    try {
        const thumbDir = path.resolve(process.cwd(), env.STORAGE_ROOT, "thumbnails");
        await fsp.mkdir(thumbDir, { recursive: true });
        const thumbName = `thumb-${storedName.replace(/\.[^.]+$/, "")}.jpg`;
        const thumbPath = path.join(thumbDir, thumbName);
        await sharp(absPath)
            .rotate()
            .resize({ width: 512, withoutEnlargement: true })
            .jpeg({ quality: 82, mozjpeg: true })
            .toFile(thumbPath);
        return path.posix.join("thumbnails", thumbName);
    } catch (err) {
        logger.warn("No se pudo generar miniatura de imagen", { err: err.message });
        return null;
    }
}

/**
 * Extrae metadatos de audio/video usando ffprobe (fluent-ffmpeg).
 * Retorna una promesa. Si ffprobe no está instalado, resuelve {} con warning.
 */
function ffprobe(absPath) {
    return new Promise((resolve) => {
        try {
            ffmpeg.ffprobe(absPath, (err, data) => {
                if (err) {
                    logger.warn("ffprobe no disponible o falló", { err: err.message });
                    return resolve({});
                }
                const streams = data.streams || [];
                const video = streams.find(s => s.codec_type === "video");
                const audio = streams.find(s => s.codec_type === "audio");
                resolve({
                    durationSeconds: data.format?.duration ? Number(data.format.duration) : null,
                    bitRate: data.format?.bit_rate ? Number(data.format.bit_rate) : null,
                    formatName: data.format?.format_name || null,
                    width: video?.width || null,
                    height: video?.height || null,
                    videoCodec: video?.codec_name || null,
                    audioCodec: audio?.codec_name || null,
                    sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : null,
                    channels: audio?.channels || null,
                });
            });
        } catch (err) {
            logger.warn("Error invocando ffprobe", { err: err.message });
            resolve({});
        }
    });
}

/**
 * Genera una miniatura desde un frame del video (segundo 1).
 */
function generateVideoThumbnail(absPath, storedName) {
    return new Promise((resolve) => {
        try {
            const thumbDir = path.resolve(process.cwd(), env.STORAGE_ROOT, "thumbnails");
            fs.mkdirSync(thumbDir, { recursive: true });
            const thumbName = `thumb-${storedName.replace(/\.[^.]+$/, "")}.jpg`;
            ffmpeg(absPath)
                .on("error", (err) => {
                    logger.warn("No se pudo generar miniatura de video", { err: err.message });
                    resolve(null);
                })
                .on("end", () => {
                    resolve(path.posix.join("thumbnails", thumbName));
                })
                .screenshots({
                    timestamps: ["00:00:01.000"],
                    filename: thumbName,
                    folder: thumbDir,
                    size: "640x?",
                });
        } catch (err) {
            logger.warn("Error generando miniatura de video", { err: err.message });
            resolve(null);
        }
    });
}

/**
 * Determina una etiqueta de calidad rudimentaria según resolución/bitrate.
 */
function inferQuality({ width, height, bitRate }) {
    if (height) {
        if (height >= 2160) return "4K";
        if (height >= 1440) return "2K";
        if (height >= 1080) return "1080p";
        if (height >= 720) return "720p";
        if (height >= 480) return "480p";
        return "SD";
    }
    if (bitRate) {
        if (bitRate >= 256000) return "high";
        if (bitRate >= 128000) return "medium";
        return "low";
    }
    return null;
}

module.exports = {
    classifyKind,
    extFromMime,
    generateStoredName,
    extractImageMeta,
    generateImageThumbnail,
    ffprobe,
    generateVideoThumbnail,
    inferQuality,
};
