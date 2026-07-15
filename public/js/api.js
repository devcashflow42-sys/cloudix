/* ==============================================================
   api.js — Cliente de Cloudix
   Conecta el frontend con las Cloudflare Pages Functions del edge.
   Expone window.NubiflyAPI, que usa auth.js.
   ============================================================== */
(function (global) {
  "use strict";

  var BASE = ""; // mismo origen que la página

  var KEYS = {
    token:   "nf_token",           // access token (JWT)
    refresh: "nf_refresh_token",   // refresh token
    user:    "nf_user",            // objeto usuario (JSON)
    uid:     "nf_uid",             // id del usuario
  };

  function getToken() {
    try { return localStorage.getItem(KEYS.token); } catch (e) { return null; }
  }
  function getRefreshToken() {
    try { return localStorage.getItem(KEYS.refresh); } catch (e) { return null; }
  }

  // Guarda la sesión devuelta por /api/login y /api/record.
  // data = { user, tokens: { accessToken, refreshToken, ... } }
  function saveSession(data) {
    if (!data) return;
    var tokens = data.tokens || {};
    try {
      if (tokens.accessToken)  localStorage.setItem(KEYS.token, tokens.accessToken);
      if (tokens.refreshToken) localStorage.setItem(KEYS.refresh, tokens.refreshToken);
      if (data.user) {
        localStorage.setItem(KEYS.user, JSON.stringify(data.user));
        if (data.user.id) localStorage.setItem(KEYS.uid, data.user.id);
      }
    } catch (e) { /* localStorage no disponible */ }
  }

  function clearSession() {
    try {
      [KEYS.token, KEYS.refresh, KEYS.user, KEYS.uid].forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (e) { /* noop */ }
  }

  // POST JSON a una ruta de la API y devuelve data (o lanza Error con el mensaje).
  async function post(path, body) {
    var res;
    try {
      res = await fetch(BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
    } catch (e) {
      throw new Error("No se pudo conectar con el servidor. Revisa tu conexión.");
    }

    var json = null;
    try { json = await res.json(); } catch (e) { /* respuesta no JSON */ }

    if (!res.ok || !json || json.success === false) {
      var msg = (json && json.message) || ("Ocurrió un error (" + res.status + ").");
      var err = new Error(msg);
      err.status = res.status;
      err.details = json && json.error && json.error.details;
      throw err;
    }
    return json.data || {};
  }

  // --- Métodos públicos usados por auth.js ---

  async function registerUser(input) {
    var data = await post("/api/record", {
      username: (input.username || input.name || "").trim(),
      email: (input.email || "").trim().toLowerCase(),
      password: input.password,
      displayName: input.name || input.username,
    });
    saveSession(data);
    return data;
  }

  async function loginUser(input) {
    var data = await post("/api/login", {
      identifier: (input.email || input.identifier || input.username || "").trim(),
      password: input.password,
    });
    saveSession(data);
    return data;
  }

  async function recoverPassword(email) {
    return post("/api/recover/password", { email: (email || "").trim().toLowerCase() });
  }

  global.NubiflyAPI = {
    KEYS: KEYS,
    getToken: getToken,
    getRefreshToken: getRefreshToken,
    saveSession: saveSession,
    clearSession: clearSession,
    registerUser: registerUser,
    loginUser: loginUser,
    recoverPassword: recoverPassword,
  };
})(window);
