/* ==============================================================
   social.js — FAB por pestaña + reglas sociales
   - Un FAB con icono propio para: Chat, Mensajes, Grupos, Comunidad.
   - Chat/Mensajes: escribir a un amigo (persona que SIGUES).
   - Grupos/Comunidad: crear seleccionando amigos.
   Regla: solo puedes mensajear/añadir a personas que sigues.
   ============================================================== */
(function () {
  "use strict";

  // ---- sesión ----
  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function authHeaders(extra) {
    var h = extra || {};
    var t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }
  function requireSession() {
    if (!token()) { window.location.replace("/login"); return false; }
    return true;
  }

  // ---- iconos del FAB por panel ----
  var ICON = {
    // Chat / Mensajes: redactar
    compose: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    // Grupos: personas +
    groupAdd: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.5"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>',
    // Comunidad: globo +
    globeAdd: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8.5"/><line x1="2.5" y1="11" x2="19.5" y2="11"/><path d="M11 2.5a13 13 0 0 1 0 17 13 13 0 0 1 0-17z"/><line x1="19" y1="18" x2="19" y2="24" transform="translate(0 -3)"/></svg>',
  };
  var CONFIG = {
    chat:      { icon: ICON.compose,  label: "Nuevo mensaje", mode: "message" },
    mensajes:  { icon: ICON.compose,  label: "Nuevo mensaje", mode: "message" },
    grupos:    { icon: ICON.groupAdd, label: "Crear grupo",   mode: "group" },
    comunidad: { icon: ICON.globeAdd, label: "Crear comunidad", mode: "community" },
  };

  // ---- utilidades DOM ----
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  // ---- FAB ----
  var fab = el("button", "sc-fab"); fab.type = "button";
  document.body.appendChild(fab);

  function activePanel() {
    var t = document.querySelector('.chat-list .tabs .tab.active');
    return t ? t.dataset.tabpanel : null;
  }
  function chatPageActive() {
    var p = document.querySelector('.page[data-page="chat"]');
    return !!(p && p.classList.contains("active"));
  }
  function updateFab() {
    if (!chatPageActive()) { fab.classList.remove("show"); return; }
    var cfg = CONFIG[activePanel() || "chat"] || CONFIG.chat;
    fab.innerHTML = cfg.icon;
    fab.setAttribute("aria-label", cfg.label);
    fab.dataset.mode = cfg.mode;
    fab.classList.add("show");
  }

  fab.addEventListener("click", function () {
    if (!requireSession()) return;
    var mode = fab.dataset.mode;
    if (mode === "message") openMessagePicker();
    else if (mode === "group") openCreate("group");
    else if (mode === "community") openCreate("community");
  });

  // Reaccionar a cambios de pestaña/página (los listeners de home.js corren antes).
  document.querySelectorAll('.chat-list .tabs .tab, .bn-item, .dw-item').forEach(function (n) {
    n.addEventListener("click", function () { setTimeout(updateFab, 0); });
  });
  window.addEventListener("resize", updateFab);

  // ---- overlay / sheet reutilizable ----
  var overlay = el("div", "sc-overlay");
  var sheet = el("div", "sc-sheet");
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSheet(); });
  function openSheet() { overlay.classList.add("open"); }
  function closeSheet() { overlay.classList.remove("open"); sheet.innerHTML = ""; }

  // ---- toast ----
  var toastEl = el("div", "sc-toast"); document.body.appendChild(toastEl);
  var toastTimer;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  // ---- API ----
  async function api(path, opts) {
    var res;
    try { res = await fetch(path, opts); }
    catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }
  function getFriends(q) {
    return api("/friends" + (q ? "?q=" + encodeURIComponent(q) : ""), { headers: authHeaders() })
      .then(function (d) { return d.friends || []; });
  }

  function friendRow(f, selectable) {
    var row = el("li", "sc-friend");
    row.dataset.id = f.id;
    var name = f.display_name || f.username;
    var av = el("span", "sc-av");
    if (f.avatar_url) { av.style.backgroundImage = "url('" + esc(f.avatar_url) + "')"; av.textContent = ""; }
    else av.textContent = initial(name);
    var info = el("span", "sc-fn", "<b>" + esc(name) + "</b><span>@" + esc(f.username) + "</span>");
    row.appendChild(av); row.appendChild(info);
    if (selectable) row.appendChild(el("span", "sc-check"));
    return row;
  }

  function emptyFriends(extraHtml) {
    return el("div", "sc-empty",
      "<b>Aún no sigues a nadie</b>Sigue a personas para poder escribirles o crear grupos con ellas."
      + (extraHtml || ""));
  }

  // ---- Flujo: NUEVO MENSAJE ----
  async function openMessagePicker() {
    sheet.innerHTML = "";
    sheet.appendChild(el("div", "sc-grip"));
    sheet.appendChild(el("h3", "sc-title", "Nuevo mensaje"));
    var search = el("input", "sc-input"); search.type = "text"; search.placeholder = "Buscar entre tus amigos…";
    sheet.appendChild(search);
    var list = el("ul", "sc-list"); sheet.appendChild(list);
    openSheet();

    async function render(q) {
      list.innerHTML = '<div class="sc-empty">Cargando…</div>';
      try {
        var friends = await getFriends(q);
        list.innerHTML = "";
        if (!friends.length) {
          var empty = q
            ? el("div", "sc-empty", "Sin resultados.")
            : emptyFriends('<div><button class="sc-link" type="button" data-goto="search">Buscar personas</button></div>');
          list.appendChild(empty);
          var goto = empty.querySelector("[data-goto]");
          if (goto) goto.addEventListener("click", function () {
            closeSheet();
            var nav = document.querySelector('.bn-item[data-tab="search"], .dw-item[data-tab="search"]');
            if (nav) nav.click();
          });
          return;
        }
        friends.forEach(function (f) {
          var row = friendRow(f, false);
          row.addEventListener("click", function () {
            // Abre el hilo de chat real (messages.js); si no está, usa el compositor simple.
            if (window.Messages && window.Messages.openThread) {
              closeSheet();
              window.Messages.openThread({ id: f.id, name: f.display_name || f.username, avatar_url: f.avatar_url });
            } else { composeTo(f); }
          });
          list.appendChild(row);
        });
      } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }
    }
    var t; search.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { render(search.value.trim()); }, 250); });
    render("");
  }

  function composeTo(friend) {
    sheet.innerHTML = "";
    sheet.appendChild(el("div", "sc-grip"));
    sheet.appendChild(el("h3", "sc-title", "Mensaje para " + esc(friend.display_name || friend.username)));
    var area = el("textarea", "sc-area"); area.placeholder = "Escribe tu mensaje…"; area.maxLength = 4000;
    sheet.appendChild(area);
    var send = el("button", "sc-primary", "Enviar"); send.type = "button"; send.disabled = true;
    sheet.appendChild(send);
    area.addEventListener("input", function () { send.disabled = !area.value.trim(); });
    area.focus();
    send.addEventListener("click", async function () {
      send.disabled = true; send.textContent = "Enviando…";
      try {
        await api("/messages", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ recipientId: friend.id, content: area.value.trim() }),
        });
        closeSheet();
        toast("Mensaje enviado a " + (friend.display_name || friend.username));
      } catch (e) {
        send.disabled = false; send.textContent = "Enviar";
        toast(e.message);
      }
    });
  }

  // ---- Flujo: CREAR GRUPO / COMUNIDAD ----
  async function openCreate(kind) {
    var isGroup = kind === "group";
    sheet.innerHTML = "";
    sheet.appendChild(el("div", "sc-grip"));
    sheet.appendChild(el("h3", "sc-title", isGroup ? "Crear grupo" : "Crear comunidad"));

    // Fila: icono + nombre
    var iconUrl = null;
    var nameRow = el("div", "sc-namerow");
    var iconBtn = el("button", "sc-iconpick", "＋"); iconBtn.type = "button"; iconBtn.title = "Icono";
    var fileIn = el("input"); fileIn.type = "file"; fileIn.accept = "image/*"; fileIn.style.display = "none";
    var name = el("input", "sc-input"); name.type = "text";
    name.placeholder = isGroup ? "Nombre del grupo" : "Nombre de la comunidad";
    name.maxLength = 150; name.style.margin = "0"; name.style.flex = "1";
    iconBtn.addEventListener("click", function () { fileIn.click(); });
    fileIn.addEventListener("change", function () {
      var file = fileIn.files && fileIn.files[0]; if (!file) return;
      var img = new Image();
      img.onload = function () {
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        var cv = document.createElement("canvas"); cv.width = 256; cv.height = 256;
        var ctx = cv.getContext("2d");
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
        iconUrl = cv.toDataURL("image/jpeg", 0.7);
        iconBtn.textContent = ""; iconBtn.style.backgroundImage = "url('" + iconUrl + "')";
      };
      img.src = URL.createObjectURL(file);
    });
    nameRow.appendChild(iconBtn); nameRow.appendChild(fileIn); nameRow.appendChild(name);
    sheet.appendChild(nameRow);
    sheet.appendChild(el("div", "sc-title", "Añadir amigos"));
    var list = el("ul", "sc-list"); sheet.appendChild(list);
    var create = el("button", "sc-primary", isGroup ? "Crear grupo" : "Crear comunidad");
    create.type = "button"; create.disabled = true;
    sheet.appendChild(create);
    openSheet();

    var selected = {};
    name.addEventListener("input", function () { create.disabled = !name.value.trim(); });

    try {
      var friends = await getFriends("");
      list.innerHTML = "";
      if (!friends.length) {
        list.appendChild(el("div", "sc-empty", "Aún no sigues a nadie. Puedes crearlo y añadir amigos más tarde."));
      } else {
        friends.forEach(function (f) {
          var row = friendRow(f, true);
          row.addEventListener("click", function () {
            if (selected[f.id]) { delete selected[f.id]; row.classList.remove("sel"); }
            else { selected[f.id] = true; row.classList.add("sel"); }
          });
          list.appendChild(row);
        });
      }
    } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }

    create.addEventListener("click", async function () {
      if (!name.value.trim()) return;
      create.disabled = true; create.textContent = "Creando…";
      try {
        await api(isGroup ? "/groups" : "/communities", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: name.value.trim(), iconUrl: iconUrl, memberIds: Object.keys(selected) }),
        });
        closeSheet();
        toast(isGroup ? "Grupo creado." : "Comunidad creada.");
        if (window.Groups && window.Groups.reload) window.Groups.reload();
      } catch (e) {
        create.disabled = false; create.textContent = isGroup ? "Crear grupo" : "Crear comunidad";
        toast(e.message);
      }
    });
  }

  // Expuesto para que groups.js abra el creador desde los enlaces de estado vacío.
  window.Social = { openCreate: openCreate, openMessagePicker: openMessagePicker };

  updateFab();
})();
