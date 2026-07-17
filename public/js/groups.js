/* ==============================================================
   groups.js — Grupos y Comunidades con roles (estilo Telegram)
   - Lista "mis grupos" y "mis comunidades" en sus pestañas.
   - Detalle: miembros con su rol, ascender/degradar, expulsar, salir,
     añadir amigos. Grupos: chat.
   ============================================================== */
(function () {
  "use strict";

  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function myId() { try { var u = JSON.parse(localStorage.getItem("nf_user") || "null"); return (u && u.id) || localStorage.getItem("nf_uid"); } catch (e) { return null; } }
  function authHeaders(extra) { var h = extra || {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function elx(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  async function api(path, opts) {
    var res; try { res = await fetch(path, opts); } catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }

  var CFG = {
    group: {
      base: "/groups", listKey: "groups", one: "group", labelOne: "grupo",
      ranks: { member: 1, moderator: 2, admin: 3, owner: 4 }, top: "owner", manageMin: 3,
      labels: { owner: "Propietario", admin: "Administrador", moderator: "Moderador", member: "Miembro" },
      assignable: ["admin", "moderator", "member"], chat: true,
    },
    community: {
      base: "/communities", listKey: "communities", one: "community", labelOne: "comunidad",
      ranks: { member: 1, collaborator: 2, moderator: 3, admin: 4, founder: 5 }, top: "founder", manageMin: 4,
      labels: { founder: "Fundador", admin: "Administrador", moderator: "Moderador", collaborator: "Colaborador", member: "Miembro" },
      assignable: ["admin", "moderator", "collaborator", "member"], chat: false,
    },
  };

  // ---------- toast + sheet ----------
  var toastEl = elx("div", "sc-toast"); document.body.appendChild(toastEl);
  var toastTimer; function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600); }
  var overlay = elx("div", "sc-overlay"); var sheet = elx("div", "sc-sheet");
  overlay.appendChild(sheet); document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSheet(); });
  function openSheet() { overlay.classList.add("open"); } function closeSheet() { overlay.classList.remove("open"); sheet.innerHTML = ""; }

  function avatarEl(cls, name, url) { var a = elx("span", cls); if (url) { a.style.backgroundImage = "url('" + esc(url) + "')"; } else a.textContent = initial(name); return a; }

  // ---------- listas ----------
  var panels = { group: document.querySelector('.tab-panel[data-panel="grupos"]'), community: document.querySelector('.tab-panel[data-panel="comunidad"]') };

  async function loadList(kind) {
    var cfg = CFG[kind], panel = panels[kind]; if (!panel || !token()) return;
    var data; try { data = await api(cfg.base + "?mine=true", { headers: authHeaders() }); } catch (e) { return; }
    var items = data[cfg.listKey] || [];
    var empty = panel.querySelector(".empty");
    var list = panel.querySelector(".gc-list");
    if (!items.length) { if (list) list.remove(); if (empty) empty.style.display = ""; return; }
    if (empty) empty.style.display = "none";
    if (!list) { list = elx("ul", "gc-list mm-convos"); panel.appendChild(list); }
    list.innerHTML = "";
    items.forEach(function (it) {
      var li = elx("li", "mm-conv");
      li.appendChild(avatarEl("mm-av", it.name, it.icon_url));
      li.appendChild(elx("div", "mm-cmeta", "<b>" + esc(it.name) + "</b><span>" + it.members_count + " miembros · " + esc(cfg.labels[it.my_role] || "Miembro") + "</span>"));
      li.addEventListener("click", function () { openDetail(kind, it); });
      list.appendChild(li);
    });
  }

  // ---------- detalle ----------
  function canManage(cfg, role) { return (cfg.ranks[role] || 0) >= cfg.manageMin; }

  async function openDetail(kind, item) {
    var cfg = CFG[kind];
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip"));
    var head = elx("div", "gc-dhead");
    head.appendChild(avatarEl("gc-dav", item.name, item.icon_url));
    head.appendChild(elx("div", null, "<div class='gc-dname'>" + esc(item.name) + "</div><div class='gc-dsub'>" + item.members_count + " miembros</div>"));
    sheet.appendChild(head);

    var actions = elx("div", "gc-actions");
    if (cfg.chat) { var chatBtn = elx("button", "gc-abtn primary", "💬 Abrir chat"); chatBtn.type = "button"; chatBtn.addEventListener("click", function () { closeSheet(); openGroupChat(item); }); actions.appendChild(chatBtn); }
    if (canManage(cfg, item.my_role)) { var addBtn = elx("button", "gc-abtn", "＋ Añadir"); addBtn.type = "button"; addBtn.addEventListener("click", function () { addMembers(kind, item); }); actions.appendChild(addBtn); }
    var isTop = item.my_role === cfg.top;
    var leaveBtn = elx("button", "gc-abtn danger", isTop ? "Eliminar" : "Salir"); leaveBtn.type = "button";
    leaveBtn.addEventListener("click", function () { if (isTop) removeEntity(kind, item); else leave(kind, item); });
    actions.appendChild(leaveBtn);
    sheet.appendChild(actions);

    sheet.appendChild(elx("div", "sc-title", "Miembros"));
    var list = elx("ul", "sc-list"); sheet.appendChild(list);
    openSheet();
    renderMembers(kind, item, list);
  }

  async function renderMembers(kind, item, list) {
    var cfg = CFG[kind];
    list.innerHTML = '<div class="sc-empty">Cargando…</div>';
    try {
      var data = await api(cfg.base + "/" + item.id + "/members", { headers: authHeaders() });
      var members = data.members || []; var myRole = data.my_role || item.my_role;
      list.innerHTML = "";
      members.forEach(function (m) {
        var name = m.display_name || m.username;
        var row = elx("li", "sc-friend");
        row.appendChild(avatarEl("sc-av", name, m.avatar_url));
        row.appendChild(elx("span", "sc-fn", "<b>" + esc(name) + "</b><span>" + esc(cfg.labels[m.role] || "Miembro") + "</span>"));
        // ¿Puedo gestionar a este miembro?
        var canManageTarget = canManage(cfg, myRole) && m.id !== myId() && m.role !== cfg.top && (cfg.ranks[myRole] > cfg.ranks[m.role]);
        if (canManageTarget) {
          var mgr = elx("button", "gc-mng", "⋮"); mgr.type = "button";
          mgr.addEventListener("click", function (e) { e.stopPropagation(); memberActions(kind, item, m, myRole); });
          row.appendChild(mgr);
        }
        list.appendChild(row);
      });
      if (!members.length) list.appendChild(elx("div", "sc-empty", "Sin miembros."));
    } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }
  }

  function memberActions(kind, item, m, myRole) {
    var cfg = CFG[kind];
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip"));
    sheet.appendChild(elx("h3", "sc-title", (m.display_name || m.username)));
    // roles asignables por debajo de mi rango
    cfg.assignable.forEach(function (role) {
      if (cfg.ranks[role] >= cfg.ranks[myRole]) return;      // no por encima/igual a mí
      if (role === m.role) return;                            // ya lo tiene
      var b = elx("button", "gc-abtn", "Hacer " + cfg.labels[role].toLowerCase()); b.type = "button";
      b.addEventListener("click", async function () {
        try { await api(cfg.base + "/" + item.id + "/members/" + m.id, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ role: role }) }); toast("Rol actualizado."); openDetail(kind, item); }
        catch (e) { toast(e.message); }
      });
      sheet.appendChild(b);
    });
    var kick = elx("button", "gc-abtn danger", "Expulsar"); kick.type = "button";
    kick.addEventListener("click", async function () {
      try { await api(cfg.base + "/" + item.id + "/members/" + m.id, { method: "DELETE", headers: authHeaders() }); toast("Miembro expulsado."); openDetail(kind, item); }
      catch (e) { toast(e.message); }
    });
    sheet.appendChild(kick);
    openSheet();
  }

  async function addMembers(kind, item) {
    var cfg = CFG[kind];
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip"));
    sheet.appendChild(elx("h3", "sc-title", "Añadir amigos"));
    var list = elx("ul", "sc-list"); sheet.appendChild(list);
    openSheet();
    list.innerHTML = '<div class="sc-empty">Cargando…</div>';
    try {
      var data = await api("/friends", { headers: authHeaders() });
      var friends = data.friends || [];
      list.innerHTML = "";
      if (!friends.length) { list.appendChild(elx("div", "sc-empty", "Aún no sigues a nadie para añadir.")); return; }
      friends.forEach(function (f) {
        var name = f.display_name || f.username;
        var row = elx("li", "sc-friend");
        row.appendChild(avatarEl("sc-av", name, f.avatar_url));
        row.appendChild(elx("span", "sc-fn", "<b>" + esc(name) + "</b><span>@" + esc(f.username) + "</span>"));
        var add = elx("button", "sc-follow", "Añadir"); add.type = "button";
        add.addEventListener("click", async function () {
          add.disabled = true;
          try { await api(cfg.base + "/" + item.id + "/members", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ userId: f.id }) }); add.textContent = "Añadido"; add.classList.add("following"); }
          catch (e) { add.disabled = false; toast(e.message); }
        });
        row.appendChild(add);
        list.appendChild(row);
      });
    } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }
  }

  async function leave(kind, item) {
    var cfg = CFG[kind];
    try { await api(cfg.base + "/" + item.id + "/members/" + myId(), { method: "DELETE", headers: authHeaders() }); closeSheet(); toast("Has salido."); loadList(kind); }
    catch (e) { toast(e.message); }
  }
  async function removeEntity(kind, item) {
    var cfg = CFG[kind];
    try { await api(cfg.base + "/" + item.id, { method: "DELETE", headers: authHeaders() }); closeSheet(); toast(cfg.labelOne[0].toUpperCase() + cfg.labelOne.slice(1) + " eliminado."); loadList(kind); }
    catch (e) { toast(e.message); }
  }

  // ---------- chat de grupo ----------
  var gchat = null, gcBody, gcTitle, gcAv, gcInput, gcGroup = null, gcTimer = null;
  function buildGroupChat() {
    gchat = elx("div", "mm-chat");
    var head = elx("div", "mm-head");
    var back = elx("button", "mm-back", '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>');
    back.type = "button"; back.addEventListener("click", closeGroupChat);
    gcAv = elx("span", "mm-av"); gcTitle = elx("b");
    head.appendChild(back); head.appendChild(gcAv); head.appendChild(gcTitle);
    gcBody = elx("div", "mm-body");
    var comp = elx("div", "mm-composer");
    gcInput = elx("input", "mm-input"); gcInput.type = "text"; gcInput.placeholder = "Mensaje al grupo…"; gcInput.maxLength = 4000;
    var send = elx("button", "mm-send", '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M21.5 12 3 3.5l3.2 8.5L3 20.5z"/><line x1="6.2" y1="12" x2="21.5" y2="12"/></svg>');
    send.type = "button"; send.addEventListener("click", sendGroup);
    gcInput.addEventListener("keydown", function (e) { if (e.key === "Enter") sendGroup(); });
    comp.appendChild(gcInput); comp.appendChild(send);
    gchat.appendChild(head); gchat.appendChild(gcBody); gchat.appendChild(comp);
    document.body.appendChild(gchat);
  }
  async function loadGroupMsgs() {
    if (!gcGroup) return;
    try {
      var data = await api("/groups/" + gcGroup.id + "/messages", { headers: authHeaders() });
      var rows = (data.messages || []); var mine = myId();
      gcBody.innerHTML = "";
      rows.slice().reverse().forEach(function (m) {
        var isMine = m.sender_id === mine;
        var wrap = elx("div", "mm-msg " + (isMine ? "mine" : "theirs"), (isMine ? "" : "<span class='gc-sender'>" + esc(m.display_name || m.username) + "</span>") + esc(m.content));
        gcBody.appendChild(wrap);
      });
      gcBody.scrollTop = gcBody.scrollHeight;
    } catch (e) { gcBody.innerHTML = '<div class="mm-empty">' + esc(e.message) + "</div>"; }
  }
  function openGroupChat(group) {
    if (!gchat) buildGroupChat();
    gcGroup = group; gcTitle.textContent = group.name;
    if (group.icon_url) { gcAv.style.backgroundImage = "url('" + esc(group.icon_url) + "')"; gcAv.textContent = ""; } else { gcAv.style.backgroundImage = ""; gcAv.textContent = initial(group.name); }
    gcBody.innerHTML = '<div class="mm-empty">Cargando…</div>'; gchat.classList.add("open");
    loadGroupMsgs(); clearInterval(gcTimer); gcTimer = setInterval(loadGroupMsgs, 4000);
  }
  function closeGroupChat() { clearInterval(gcTimer); gcTimer = null; if (gchat) gchat.classList.remove("open"); gcGroup = null; }
  async function sendGroup() {
    var text = gcInput.value.trim(); if (!text || !gcGroup) return; gcInput.value = "";
    gcBody.appendChild(elx("div", "mm-msg mine", esc(text))); gcBody.scrollTop = gcBody.scrollHeight;
    try { await api("/groups/" + gcGroup.id + "/messages", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ content: text }) }); loadGroupMsgs(); }
    catch (e) { gcBody.appendChild(elx("div", "mm-empty", e.message)); }
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && gchat && gchat.classList.contains("open")) closeGroupChat(); });

  // ---------- wiring ----------
  function reload() { loadList("group"); loadList("community"); }
  document.querySelectorAll('.chat-list .tabs .tab, .bn-item[data-tab="chat"], .dw-item[data-tab="chat"]').forEach(function (n) {
    n.addEventListener("click", function () { setTimeout(reload, 0); });
  });
  // enlaces "Crear un grupo" / "Explorar comunidades" -> abrir creación del FAB social
  var grpEmpty = panels.group && panels.group.querySelector(".empty-link");
  if (grpEmpty) grpEmpty.addEventListener("click", function () { if (window.Social && window.Social.openCreate) window.Social.openCreate("group"); });
  var comEmpty = panels.community && panels.community.querySelector(".empty-link");
  if (comEmpty) comEmpty.addEventListener("click", function () { if (window.Social && window.Social.openCreate) window.Social.openCreate("community"); });

  window.Groups = { reload: reload };
  reload();
})();
