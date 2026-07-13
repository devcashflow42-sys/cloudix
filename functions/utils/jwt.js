// Firma y verificación de JWT con `jose` (HS256), compatible con el edge.
import { SignJWT, jwtVerify } from "jose";

function secretKey(env) {
    if (!env.JWT_SECRET) throw new Error("Falta la variable JWT_SECRET.");
    return new TextEncoder().encode(env.JWT_SECRET);
}

/**
 * Emite un access token de corta duración.
 * @param {object} env  - bindings/vars del entorno
 * @param {object} payload - { sub, role, ... }
 */
export async function signAccessToken(env, payload) {
    const ttl = parseInt(env.ACCESS_TOKEN_TTL || "900", 10);
    return new SignJWT({ ...payload, typ: "access" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer(env.JWT_ISSUER || "cloudix")
        .setAudience(env.JWT_AUDIENCE || "cloudix-clients")
        .setExpirationTime(`${ttl}s`)
        .sign(secretKey(env));
}

export async function verifyAccessToken(env, token) {
    const { payload } = await jwtVerify(token, secretKey(env), {
        issuer: env.JWT_ISSUER || "cloudix",
        audience: env.JWT_AUDIENCE || "cloudix-clients",
    });
    return payload;
}
