/* ==============================================================
   search.js — Buscar personas + Explorar
   · Estado por defecto: cuadrícula "Explorar" con publicaciones
     públicas recientes (GET /posts), reutilizando la estética de
     las celdas del perfil (.pf-cell) y el lightbox compartido.
   · Al escribir (≥2 car.): resultados de personas (GET /search)
     con esqueletos de carga y seguir/dejar de seguir (/follows/:id).
   ============================================================== */
(function () {
  "use strict";

  var input = document.getElementById("scSearchInput");
  var results = document.getElementById("scSearchResults");
  var emptyBox = document.getElementById("scSearchEmpty");
  var explore = document.getElementById("scExplore");
  var exploreGrid = document.getElementById("scExploreGrid");
  if (!input || !results) return;

  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function authHeaders(extra) { var h = extra || {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function elx(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }

  async function apiJson(path, opts) {
    var res;
    try { res = await fetch(path, opts); }
    catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }

  // ---------- alternar Explorar / Resultados ----------
  function setMode(mode) {
    var searching = mode === "search";
    if (emptyBox) emptyBox.style.display = "none";
    if (explore) explore.style.display = searching ? "none" : "";
    results.style.display = searching ? "" : "none";
  }

  // ---------- resultados de personas ----------
  function skeletonRow() {
    var li = elx("li", "sc-friend sc-sk");
    li.innerHTML = '<span class="skeleton sk-av"></span>' +
      '<div class="sc-fn"><span class="skeleton sk-l" style="width:45%"></span>' +
      '<span class="skeleton sk-l" style="width:30%;margin-top:7px"></span></div>' +
      '<span class="skeleton sk-l" style="width:74px;height:32px;border-radius:8px"></span>';
    return li;
  }

  function row(u) {
    var li = document.createElement("li");
    li.className = "sc-friend";
    var name = u.display_name || u.username;

    var av = document.createElement("span");
    av.className = "sc-av";
    if (u.avatar_url) { av.style.backgroundImage = "url('" + esc(u.avatar_url) + "')"; }
    else { av.textContent = initial(name); }

    var info = document.createElement("span");
    info.className = "sc-fn";
    info.innerHTML = "<b>" + esc(name) + "</b><span>@" + esc(u.username) + "</span>";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sc-follow" + (u.is_following ? " following" : "");
    btn.textContent = u.is_following ? "Siguiendo" : "Seguir";

    var busy = false;
    btn.addEventListener("click", async function (e) {
      e.stopPropagation();
      if (busy) return;
      if (!token()) { window.location.replace("/login"); return; }
      busy = true;
      var following = btn.classList.contains("following");
      try {
        await apiJson("/follows/" + u.id, { method: following ? "DELETE" : "POST", headers: authHeaders() });
        following = !following;
        btn.classList.toggle("following", following);
        btn.textContent = following ? "Siguiendo" : "Seguir";
      } catch (err) {
        // revertir visualmente no hace falta; se deja como estaba
      } finally { busy = false; }
    });

    li.appendChild(av); li.appendChild(info); li.appendChild(btn);
    return li;
  }

  async function search(q) {
    if (q.length < 2) { results.innerHTML = ""; setMode("explore"); return; }
    setMode("search");
    results.innerHTML = "";
    for (var s = 0; s < 6; s++) results.appendChild(skeletonRow());
    try {
      var data = await apiJson("/search?type=users&q=" + encodeURIComponent(q), { headers: authHeaders() });
      var users = data.users || [];
      results.innerHTML = "";
      if (!users.length) { results.innerHTML = '<div class="sc-empty">Sin resultados para “' + esc(q) + '”.</div>'; return; }
      users.forEach(function (u) { results.appendChild(row(u)); });
    } catch (e) {
      results.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>";
    }
  }

  // ---------- Explorar (publicaciones públicas) ----------
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
  function goHome() { var h = document.querySelector('[data-tab="home"]'); if (h) h.click(); }

  var LIKE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 21s-7.6-4.8-10.1-9.3C.4 8.9 1.6 5.7 4.6 5c2.1-.5 4.1.7 7.4 3.9C15.3 5.7 17.3 4.5 19.4 5c3 .7 4.2 3.9 2.7 6.7C19.6 16.2 12 21 12 21z"/></svg>';
  var CMT_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3v4l5-4h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg>';

  function exploreCell(p) {
    var vis = firstVisual(parseMedia(p));
    var cell;
    if (vis && vis.type === "video") {
      cell = elx("div", "pf-cell");
      var v = document.createElement("video");
      v.src = vis.url; v.muted = true; v.playsInline = true; v.preload = "metadata";
      cell.appendChild(v);
      cell.addEventListener("click", goHome);
    } else if (vis) {
      cell = elx("div", "pf-cell");
      var img = document.createElement("img");
      img.src = vis.url; img.loading = "lazy"; img.decoding = "async"; img.alt = "";
      cell.appendChild(img);
      cell.addEventListener("click", function () {
        if (window.Lightbox && window.Lightbox.open) window.Lightbox.open(vis.url); else goHome();
      });
    } else {
      cell = elx("div", "pf-cell text");
      cell.appendChild(elx("span", null, esc((p.content || "").trim() || "Publicación")));
      cell.addEventListener("click", goHome);
    }
    cell.appendChild(elx("div", "pf-cell-stats",
      "<span>" + LIKE_SVG + (p.likes_count || 0) + "</span>" +
      "<span>" + CMT_SVG + (p.comments_count || 0) + "</span>"));
    return cell;
  }

  function exploreSkeletons(n) {
    if (!exploreGrid) return;
    exploreGrid.innerHTML = "";
    for (var i = 0; i < (n || 12); i++) {
      var c = elx("div", "pf-cell");
      var sk = elx("span", "skeleton");
      sk.style.cssText = "width:100%;height:100%;display:block";
      c.appendChild(sk);
      exploreGrid.appendChild(c);
    }
  }

  var exploreLoaded = false;
  async function loadExplore(force) {
    if (!exploreGrid || (exploreLoaded && !force)) return;
    exploreLoaded = true;
    exploreSkeletons(12);
    var rows;
    try { rows = await apiJson("/posts", { headers: authHeaders() }); }
    catch (e) { exploreGrid.innerHTML = '<div class="sc-empty">No se pudo cargar Explorar.</div>'; return; }
    if (!Array.isArray(rows)) rows = [];
    exploreGrid.innerHTML = "";
    if (!rows.length) {
      exploreGrid.innerHTML = '<div class="ex-empty">Aún no hay publicaciones que explorar.</div>';
      return;
    }
    rows.forEach(function (p) { exploreGrid.appendChild(exploreCell(p)); });
  }

  // ---------- eventos ----------
  var t;
  input.addEventListener("input", function () {
    clearTimeout(t);
    var q = input.value.trim();
    t = setTimeout(function () { search(q); }, 280);
  });

  // Al entrar a la pestaña Buscar, refresca Explorar si el buscador está vacío.
  document.querySelectorAll('.bn-item[data-tab="search"], .dw-item[data-tab="search"]').forEach(function (n) {
    n.addEventListener("click", function () {
      setTimeout(function () { if (input.value.trim().length < 2) { setMode("explore"); loadExplore(true); } }, 0);
    });
  });

  // estado inicial
  setMode("explore");
  loadExplore();
})();
