/* ==============================================================
   stories.js — Cliente de Historias/Estados
   Consume /stories y muestra el tiempo restante de forma dinámica.
   Reutiliza el token de sesión de NubiflyAPI (api.js).
   ============================================================== */
(function (global) {
  "use strict";

  function authHeaders(extra) {
    var h = extra || {};
    var t = global.NubiflyAPI && typeof global.NubiflyAPI.getToken === "function"
      ? global.NubiflyAPI.getToken() : null;
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }

  async function jsonOrThrow(res) {
    var json = null;
    try { json = await res.json(); } catch (e) {}
    if (!res.ok || !json || json.success === false) {
      throw new Error((json && json.message) || ("Error (" + res.status + ")."));
    }
    return json.data || {};
  }

  // Devuelve { stories: [...], serverTime }. Cada historia trae seconds_remaining.
  async function getActive() {
    return jsonOrThrow(await fetch("/stories"));
  }

  async function create(input) {
    var data = await jsonOrThrow(await fetch("/stories", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(input || {}),
    }));
    return data.story;
  }

  async function remove(id) {
    return jsonOrThrow(await fetch("/stories/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: authHeaders(),
    }));
  }

  // Segundos -> "23h 59m" / "12m 03s" / "45s" / "Expirada"
  function formatRemaining(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    if (seconds <= 0) return "Expirada";
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    if (h > 0) return h + "h " + pad(m) + "m";
    if (m > 0) return m + "m " + pad(s) + "s";
    return s + "s";
  }

  /**
   * Cuenta regresiva dinámica: actualiza `el.textContent` cada segundo.
   * @param {HTMLElement} el         Elemento donde mostrar el tiempo.
   * @param {string|number} expiresAt  Fecha ISO de expiración (o timestamp ms).
   * @param {Function} [onExpire]    Callback al llegar a 0.
   * @returns {Function} stop        Detiene la cuenta regresiva.
   */
  function startCountdown(el, expiresAt, onExpire) {
    var end = typeof expiresAt === "number" ? expiresAt : new Date(expiresAt).getTime();
    var timer = null;
    function tick() {
      var remaining = Math.round((end - Date.now()) / 1000);
      if (el) el.textContent = formatRemaining(remaining);
      if (remaining <= 0) {
        if (timer) clearInterval(timer);
        if (typeof onExpire === "function") onExpire();
      }
    }
    tick();
    timer = setInterval(tick, 1000);
    return function stop() { if (timer) clearInterval(timer); };
  }

  global.StoriesAPI = {
    getActive: getActive,
    create: create,
    remove: remove,
    formatRemaining: formatRemaining,
    startCountdown: startCountdown,
  };
})(window);
