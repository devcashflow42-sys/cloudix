"use strict";

const path = require("path");
const fs = require("fs");
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const env = require("../config/env");

const logDir = path.isAbsolute(env.LOG_DIR)
    ? env.LOG_DIR
    : path.resolve(process.cwd(), env.LOG_DIR);

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors, splat, json } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${ts} [${level}]: ${stack || message}${metaStr}`;
});

const transports = [];

if (env.IS_DEVELOPMENT) {
    transports.push(
        new winston.transports.Console({
            format: combine(
                colorize({ all: true }),
                timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
                errors({ stack: true }),
                splat(),
                devFormat,
            ),
        }),
    );
} else {
    transports.push(
        new winston.transports.Console({
            format: combine(timestamp(), errors({ stack: true }), splat(), json()),
        }),
    );
}

transports.push(
    new DailyRotateFile({
        dirname: logDir,
        filename: "app-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        maxSize: env.LOG_MAX_SIZE,
        maxFiles: env.LOG_MAX_FILES,
        zippedArchive: true,
        format: combine(timestamp(), errors({ stack: true }), splat(), json()),
    }),
);

transports.push(
    new DailyRotateFile({
        dirname: logDir,
        filename: "error-%DATE%.log",
        datePattern: "YYYY-MM-DD",
        level: "error",
        maxSize: env.LOG_MAX_SIZE,
        maxFiles: env.LOG_MAX_FILES,
        zippedArchive: true,
        format: combine(timestamp(), errors({ stack: true }), splat(), json()),
    }),
);

const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    levels: winston.config.npm.levels,
    defaultMeta: { service: env.APP_NAME },
    transports,
    exitOnError: false,
});

// Stream para morgan
logger.stream = {
    write: (message) => logger.http(message.trim()),
};

module.exports = logger;
