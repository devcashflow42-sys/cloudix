/* ==============================================================
   profile.js — Perfil del usuario autenticado en home.html
   Cabecera: nombre, @usuario, biografía, avatar y estadísticas
   desde GET /users/me. Grids de las tres pestañas:
     · Publicaciones (todos)  -> GET /posts?mine=true
     · Multimedia   (fotos)   -> mis publicaciones con imagen/video
     · Guardados    (imagen)  -> GET /posts?saved=true
   Oculta "Seguir" y "Mensaje" (es el perfil propio).
   Requiere sesión (token en localStorage: nf_token).
   ============================================================== */
(function () {
  "use strict";

  var SESSION_KEYS = ["nf_token", "nf_refresh_token", "nf_user", "nf_uid"];

  function getToken() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function clearSession() { try { SESSION_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} }
  function authHeaders() { var h = {}; var t = getToken(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function elx(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function setText(selector, value) {
    if (value == null) return;
    document.querySelectorAll(selector).forEach(function (el) { el.textContent = value; });
  }
  function initialOf(name) { var s = (name || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }

  // ---------- cabecera del perfil ----------
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

  // ---------- utilidades de multimedia ----------
  function parseMedia(p) {
    var m = p.media;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch (e) { m = []; } }
    return Array.isArray(m) ? m : [];
  }
  function firstVisual(items) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it && it.url && ["image", "gif", "video"].indexOf(it.type || "image") >= 0) return it;
    }
    return null;
  }

  var LIKE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 21s-7.6-4.8-10.1-9.3C.4 8.9 1.6 5.7 4.6 5c2.1-.5 4.1.7 7.4 3.9C15.3 5.7 17.3 4.5 19.4 5c3 .7 4.2 3.9 2.7 6.7C19.6 16.2 12 21 12 21z"/></svg>';
  var CMT_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3v4l5-4h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg>';

  function statsOverlay(p) {
    return elx("div", "pf-cell-stats",
      "<span>" + LIKE_SVG + (p.likes_count || 0) + "</span>" +
      "<span>" + CMT_SVG + (p.comments_count || 0) + "</span>");
  }

  function makeCell(p) {
    var media = parseMedia(p);
    var vis = firstVisual(media);
    var cell;
    if (vis && vis.type === "video") {
      cell = elx("div", "pf-cell");
      var v = document.createElement("video");
      v.src = vis.url; v.muted = true; v.playsInline = true; v.preload = "metadata";
      cell.appendChild(v);
      cell.addEventListener("click", goToFeed);   // el reproductor completo vive en el feed
    } else if (vis) {
      cell = elx("div", "pf-cell");
      var img = document.createElement("img");
      img.src = vis.url; img.loading = "lazy"; img.decoding = "async"; img.alt = "";
      cell.appendChild(img);
      cell.addEventListener("click", function () { openLightbox(vis.url); });
    } else {
      cell = elx("div", "pf-cell text");
      var body = (p.content || "").trim();
      cell.appendChild(elx("span", null, esc(body || "Publicación")));
      cell.addEventListener("click", goToFeed);
    }
    cell.appendChild(statsOverlay(p));
    return cell;
  }

  function panelOf(key) { return document.querySelector('.tab-panel[data-panel="' + key + '"]'); }

  function skeletonGrid(key, n) {
    var panel = panelOf(key); if (!panel) return;
    var old = panel.querySelector(".pf-grid"); if (old) old.remove();
    var empty = panel.querySelector(".empty"); if (empty) empty.style.display = "none";
    var grid = elx("div", "pf-grid");
    for (var i = 0; i < (n || 6); i++) {
      var c = elx("div", "pf-cell");
      var sk = elx("span", "skeleton");
      sk.style.cssText = "width:100%;height:100%;display:block";
      c.appendChild(sk);
      grid.appendChild(c);
    }
    panel.appendChild(grid);
  }

  function renderGrid(key, posts) {
    var panel = panelOf(key); if (!panel) return;
    var old = panel.querySelector(".pf-grid"); if (old) old.remove();
    var empty = panel.querySelector(".empty");
    if (!posts || !posts.length) { if (empty) empty.style.display = ""; return; }
    if (empty) empty.style.display = "none";
    var grid = elx("div", "pf-grid");
    posts.forEach(function (p) { grid.appendChild(makeCell(p)); });
    panel.appendChild(grid);
  }

  // ---------- lightbox de imagen ----------
  var lb = null, lbImg = null;
  function openLightbox(url) {
    if (!lb) {
      lb = elx("div", "pf-lightbox");
      lbImg = document.createElement("img"); lbImg.alt = "";
      lb.appendChild(lbImg);
      lb.addEventListener("click", closeLightbox);
      document.body.appendChild(lb);
    }
    lbImg.src = url;
    lb.classList.add("open");
  }
  function closeLightbox() { if (lb) lb.classList.remove("open"); }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lb && lb.classList.contains("open")) closeLightbox();
  });

  function goToFeed() {
    var home = document.querySelector('[data-tab="home"]');
    if (home) home.click();
  }

  // ---------- carga de datos ----------
  async function apiList(path) {
    var res;
    try { res = await fetch(path, { headers: authHeaders() }); }
    catch (e) { return null; }
    if (res.status === 401) { clearSession(); window.location.replace("/login"); return null; }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) return null;
    return Array.isArray(j.data) ? j.data : [];
  }

  async function loadGrids() {
    skeletonGrid("todos", 9); skeletonGrid("fotos", 9); skeletonGrid("imagen", 6);

    // "Publicaciones" y "Multimedia" comparten la misma consulta.
    var mine = await apiList("/posts?mine=true");
    if (mine != null) {
      renderGrid("todos", mine);
      renderGrid("fotos", mine.filter(function (p) { return !!firstVisual(parseMedia(p)); }));
    } else {
      renderGrid("todos", []); renderGrid("fotos", []);
    }

    var saved = await apiList("/posts?saved=true");
    renderGrid("imagen", saved || []);
  }

  function wireCreate() {
    var link = document.querySelector('.tab-panel[data-panel="todos"] .empty-link');
    if (link && !link.dataset.wired) {
      link.dataset.wired = "1";
      link.addEventListener("click", function () {
        if (window.Posts && window.Posts.compose) window.Posts.compose();
      });
    }
  }

  async function load() {
    var token = getToken();
    if (!token) { window.location.replace("/login"); return; }

    wireCreate();

    var res;
    try {
      res = await fetch("/users/me", { headers: { "Authorization": "Bearer " + token } });
    } catch (e) {
      console.warn("No se pudo cargar el perfil:", e.message);
      loadGrids();               // aún intentamos poblar los grids
      return;
    }

    if (res.status === 401) {    // token ausente/expirado
      clearSession();
      window.location.replace("/login");
      return;
    }

    var json = null;
    try { json = await res.json(); } catch (e) {}
    if (res.ok && json && json.success && json.data && json.data.user) {
      fillProfile(json.data.user);
    } else {
      console.warn("Respuesta inesperada al cargar el perfil.");
    }

    loadGrids();
  }

  // Recargar el perfil al entrar a la pestaña "Perfil".
  document.querySelectorAll('.bn-item[data-tab="profile"], .dw-item[data-tab="profile"]').forEach(function (n) {
    n.addEventListener("click", function () { setTimeout(loadGrids, 0); });
  });

  window.Profile = { reload: loadGrids };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
