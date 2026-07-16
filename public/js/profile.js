/* ==============================================================
   profile.js — Carga el perfil del usuario autenticado en home.html
   Rellena nombre, @usuario, biografía, avatar y estadísticas desde
   GET /users/me. Oculta los botones "Seguir" y "Mensaje" (es el
   perfil propio). Requiere sesión (token en localStorage: nf_token).
   ============================================================== */
(function () {
  "use strict";

  var SESSION_KEYS = ["nf_token", "nf_refresh_token", "nf_user", "nf_uid"];

  function getToken() {
    try { return localStorage.getItem("nf_token"); } catch (e) { return null; }
  }
  function clearSession() {
    try { SESSION_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  }
  function setText(selector, value) {
    if (value == null) return;
    document.querySelectorAll(selector).forEach(function (el) { el.textContent = value; });
  }
  function initialOf(name) {
    var s = (name || "").trim();
    return s ? s.charAt(0).toUpperCase() : "?";
  }

  function fillProfile(u) {
    var displayName = u.display_name || u.username || "Usuario";

    setText(".pf-name", displayName);
    setText(".pf-user", "@" + (u.username || "usuario"));
    setText(".pf-bio", (u.bio && u.bio.trim()) ? u.bio : "Sin biografía todavía.");

    // Avatar (perfil, barra superior y navegación): imagen o inicial.
    var ini = initialOf(displayName);
    document.querySelectorAll(".pf-avatar, .nav-avatar, .topbar .avatar").forEach(function (el) {
      if (u.avatar_url) {
        el.textContent = "";
        el.style.backgroundImage = "url('" + u.avatar_url + "')";
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
      } else {
        el.textContent = ini;
      }
    });

    // Estadísticas en orden: Publicaciones, Seguidores, Siguiendo.
    var nums = document.querySelectorAll(".pf-stats .pf-num");
    if (nums.length >= 3) {
      nums[0].textContent = u.posts != null ? u.posts : 0;
      nums[1].textContent = u.followers != null ? u.followers : 0;
      nums[2].textContent = u.following != null ? u.following : 0;
    }

    // Perfil propio: ocultar "Seguir" y "Mensaje".
    document.querySelectorAll(".pf-actions").forEach(function (el) { el.hidden = true; });

    document.title = displayName + " · Socialio";
  }

  async function load() {
    var token = getToken();
    if (!token) { window.location.replace("/login"); return; }

    var res;
    try {
      res = await fetch("/users/me", { headers: { "Authorization": "Bearer " + token } });
    } catch (e) {
      console.warn("No se pudo cargar el perfil:", e.message);
      return; // deja los textos por defecto
    }

    if (res.status === 401) {           // token ausente/expirado
      clearSession();
      window.location.replace("/login");
      return;
    }

    var json = null;
    try { json = await res.json(); } catch (e) {}
    if (!res.ok || !json || !json.success || !json.data || !json.data.user) {
      console.warn("Respuesta inesperada al cargar el perfil.");
      return;
    }
    fillProfile(json.data.user);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
