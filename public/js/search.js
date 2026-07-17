/* ==============================================================
   search.js — Buscar personas y seguir/dejar de seguir
   Consume GET /search?q=&type=users y POST/DELETE /follows/:id.
   ============================================================== */
(function () {
  "use strict";

  var input = document.getElementById("scSearchInput");
  var results = document.getElementById("scSearchResults");
  var emptyBox = document.getElementById("scSearchEmpty");
  if (!input || !results) return;

  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function authHeaders(extra) { var h = extra || {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function showEmpty(on) { if (emptyBox) emptyBox.style.display = on ? "" : "none"; }

  async function apiJson(path, opts) {
    var res;
    try { res = await fetch(path, opts); }
    catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
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
    if (q.length < 2) { results.innerHTML = ""; showEmpty(true); return; }
    showEmpty(false);
    results.innerHTML = '<div class="sc-empty">Buscando…</div>';
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

  var t;
  input.addEventListener("input", function () {
    clearTimeout(t);
    var q = input.value.trim();
    t = setTimeout(function () { search(q); }, 280);
  });
})();
