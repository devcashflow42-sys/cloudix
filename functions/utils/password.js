// Hashing de contraseñas con Web Crypto (PBKDF2-SHA256).
//
// En el runtime edge de Cloudflare NO existe bcrypt (módulo nativo de Node),
// por eso usamos SubtleCrypto, disponible globalmente como `crypto.subtle`.
//
// Formato almacenado:  pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>

const ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;
const enc = new TextEncoder();

function toB64(bytes) {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

function fromB64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function derive(password, salt, iterations) {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
        key,
        KEY_LEN_BITS,
    );
    return new Uint8Array(bits);
}

export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derive(password, salt, ITERATIONS);
    return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

/** Comparación en tiempo constante para evitar timing attacks. */
function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

export async function verifyPassword(password, stored) {
    if (typeof stored !== "string") return false;
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = parseInt(iterStr, 10);
    const salt = fromB64(saltB64);
    const expected = fromB64(hashB64);
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
}

/** Token opaco aleatoriamente seguro (para refresh/reset/verify). */
export function randomToken(bytes = 32) {
    const buf = crypto.getRandomValues(new Uint8Array(bytes));
    return toB64(buf).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 en hex, para almacenar hashes de tokens (nunca el token en claro). */
export async function sha256Hex(input) {
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
