/* ==============================================================
   rail.js — Panel derecho de escritorio: "A quién seguir".
   Consume GET /users/suggestions y POST/DELETE /follows/:id.
   Es aditivo: si no hay sesión o sugerencias, el panel se oculta.
   Solo es visible en pantallas anchas (lo controla el CSS).
   ============================================================== */
(function () {
  "use strict";

  var list = document.getElementById("railSuggest");
  if (!list) return;
  var rail = list.closest(".rail");

  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function authHeaders(extra) { var h = extra || {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function elx(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }

  async function api(path, opts) {
    var res;
    try { res = await fetch(path, opts); } catch (e) { throw new Error("Sin conexión."); }
    if (res.status === 401) { throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }

  function fmtFollowers(n) {
    n = n || 0;
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0) + " mil";
    return String(n);
  }

  function skeleton() {
    var li = elx("li", "rail-user");
    li.innerHTML = '<span class="skeleton sk-av"></span>' +
      '<div class="rail-uinfo"><div class="skeleton sk-l" style="width:60%"></div>' +
      '<div class="skeleton sk-l" style="width:40%;margin-top:7px"></div></div>';
    return li;
  }

  function userRow(u) {
    var name = u.display_name || u.username;
    var li = elx("li", "rail-user");

    var av = elx("span", "rail-uav");
    if (u.avatar_url) av.style.backgroundImage = "url('" + esc(u.avatar_url) + "')";
    else av.textContent = initial(name);

    var info = elx("div", "rail-uinfo",
      "<b>" + esc(name) + "</b><span>@" + esc(u.username) +
      (u.followers ? " · " + fmtFollowers(u.followers) + " seg." : "") + "</span>");

    var btn = elx("button", "rail-follow"); btn.type = "button"; btn.textContent = "Seguir";
    var busy = false;
    btn.addEventListener("click", async function (e) {
      e.stopPropagation();
      if (busy) return;
      if (!token()) { window.location.replace("/login"); return; }
      busy = true; btn.disabled = true; btn.textContent = "Siguiendo";
      try {
        await api("/follows/" + u.id, { method: "POST", headers: authHeaders() });
        li.style.transition = "opacity .18s ease"; li.style.opacity = "0";
        setTimeout(function () { li.remove(); if (!list.children.length) hide(); }, 180);
      } catch (err) {
        btn.disabled = false; btn.textContent = "Seguir"; busy = false;
      }
    });

    li.appendChild(av); li.appendChild(info); li.appendChild(btn);
    return li;
  }

  function hide() { if (rail) rail.style.display = "none"; }
  function show() { if (rail) rail.style.display = ""; }   // vuelve al control del CSS (media query)

  async function load() {
    if (!token()) { hide(); return; }
    show();
    list.innerHTML = "";
    for (var i = 0; i < 4; i++) list.appendChild(skeleton());
    var data;
    try { data = await api("/users/suggestions", { headers: authHeaders() }); }
    catch (e) { hide(); return; }
    var users = (data && data.users) || [];
    if (!users.length) { hide(); return; }
    list.innerHTML = "";
    users.forEach(function (u) { list.appendChild(userRow(u)); });
  }

  // "Ver más" -> lleva a la pestaña Buscar.
  var more = document.querySelector('.rail-more[data-goto]');
  if (more) {
    more.addEventListener("click", function () {
      var nav = document.querySelector('.bn-item[data-tab="' + more.dataset.goto + '"], .dw-item[data-tab="' + more.dataset.goto + '"]');
      if (nav) nav.click();
    });
  }

  // Recargar sugerencias al volver a Inicio.
  document.querySelectorAll('.bn-item[data-tab="home"], .dw-item[data-tab="home"]').forEach(function (n) {
    n.addEventListener("click", function () { setTimeout(load, 0); });
  });

  window.Rail = { reload: load };
  load();
})();
