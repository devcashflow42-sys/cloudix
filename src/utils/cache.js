"use strict";

const env = require("../config/env");

/**
 * Caché en memoria simple con TTL.
 *
 * Diseñada para respuestas GET frecuentes (listados, categorías, tags).
 * En un despliegue multi-instancia deberías reemplazarla por Redis; la
 * interfaz `get/set/del/delByPrefix` se mantiene igual.
 */
class MemoryCache {
    constructor({ ttlSeconds = 300, checkPeriodSeconds = 60 } = {}) {
        this.store = new Map();
        this.ttlMs = ttlSeconds * 1000;
        this.checkPeriodMs = checkPeriodSeconds * 1000;
        this.timer = setInterval(() => this.cleanup(), this.checkPeriodMs);
        if (this.timer.unref) this.timer.unref();
    }

    _now() {
        return Date.now();
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= this._now()) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }

    set(key, value, ttlSeconds) {
        const ttl = (typeof ttlSeconds === "number" ? ttlSeconds * 1000 : this.ttlMs);
        this.store.set(key, { value, expiresAt: this._now() + ttl });
    }

    del(key) {
        this.store.delete(key);
    }

    /**
     * Elimina todas las claves que empiezan por `prefix`.
     * Útil para invalidar familias enteras (ej: "media:list:*").
     */
    delByPrefix(prefix) {
        for (const key of this.store.keys()) {
            if (key.startsWith(prefix)) this.store.delete(key);
        }
    }

    clear() {
        this.store.clear();
    }

    cleanup() {
        const now = this._now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt <= now) this.store.delete(key);
        }
    }

    size() {
        return this.store.size;
    }
}

const cache = new MemoryCache({
    ttlSeconds: env.CACHE_TTL_SECONDS,
    checkPeriodSeconds: env.CACHE_CHECK_PERIOD,
});

module.exports = cache;
module.exports.MemoryCache = MemoryCache;
