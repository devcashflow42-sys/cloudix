/* ==============================================================
   messages.js — Bandeja de conversaciones + hilo de chat
   - Pestaña Chat: lista de conversaciones con último mensaje y no leídos.
   - Al tocar una: hilo a pantalla completa con burbujas y composer.
   - Expone window.Messages.openThread(peer) para el FAB "Nuevo mensaje".
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
    var res;
    try { res = await fetch(path, opts); } catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }

  var chatPanel = document.querySelector('.tab-panel[data-panel="chat"]');
  var chatEmpty = chatPanel ? chatPanel.querySelector(".empty") : null;

  // ---------- bandeja ----------
  function timeShort(iso) {
    if (!iso) return "";
    var d = new Date(iso), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var days = Math.floor((now - d) / 86400000);
    if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  }
  function skeletonConv() {
    var li = elx("li", "mm-sk");
    li.innerHTML = '<span class="skeleton sk-av"></span><div class="sk-c"><div class="skeleton sk-l" style="width:45%"></div><div class="skeleton sk-l" style="width:70%;margin-top:8px"></div></div>';
    return li;
  }

  async function loadConversations() {
    if (!chatPanel || !token()) return;
    var list = chatPanel.querySelector(".mm-convos");

    // Skeletons de carga (solo en la primera carga, para no parpadear al refrescar).
    var firstLoad = !list;
    if (firstLoad) {
      if (chatEmpty) chatEmpty.style.display = "none";
      list = elx("ul", "mm-convos"); chatPanel.appendChild(list);
      for (var s = 0; s < 5; s++) list.appendChild(skeletonConv());
    }

    var data;
    try { data = await api("/messages", { headers: authHeaders() }); }
    catch (e) { if (firstLoad) list.remove(); return; }
    var convos = (data && data.conversations) || [];

    if (!convos.length) {
      if (list) list.remove();
      if (chatEmpty) chatEmpty.style.display = "";
      return;
    }
    if (chatEmpty) chatEmpty.style.display = "none";
    list.innerHTML = "";
    convos.forEach(function (c) {
      var name = c.display_name || c.username;
      var li = elx("li", "mm-conv" + (c.unread > 0 ? " unread" : ""));
      var av = elx("span", "mm-av"); if (c.avatar_url) av.style.backgroundImage = "url('" + esc(c.avatar_url) + "')"; else av.textContent = initial(name);
      var preview = (c.last_mine ? "Tú: " : "") + (c.last_message || "");
      var meta = elx("div", "mm-cmeta", "<b>" + esc(name) + "</b><span>" + esc(preview) + "</span>");
      var right = elx("div", "mm-cright");
      right.appendChild(elx("span", "mm-time", timeShort(c.last_at)));
      if (c.unread > 0) right.appendChild(elx("span", "mm-badge", String(c.unread)));
      li.appendChild(av); li.appendChild(meta); li.appendChild(right);
      li.addEventListener("click", function () { openThread({ id: c.id, name: name, avatar_url: c.avatar_url }); });
      list.appendChild(li);
    });
  }

  // ---------- hilo de chat ----------
  var chat = null, chatBody, chatTitleAv, chatTitle, chatInput, peer = null, pollTimer = null;

  function buildChat() {
    chat = elx("div", "mm-chat");
    var head = elx("div", "mm-head");
    var back = elx("button", "mm-back", '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 5 8 12 15 19"/></svg>');
    back.type = "button"; back.addEventListener("click", closeThread);
    chatTitleAv = elx("span", "mm-av");
    chatTitle = elx("b");
    head.appendChild(back); head.appendChild(chatTitleAv); head.appendChild(chatTitle);
    chatBody = elx("div", "mm-body");
    var comp = elx("div", "mm-composer");
    chatInput = elx("input", "mm-input"); chatInput.type = "text"; chatInput.placeholder = "Escribe un mensaje…"; chatInput.maxLength = 4000;
    var send = elx("button", "mm-send", '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M21.5 12 3 3.5l3.2 8.5L3 20.5z"/><line x1="6.2" y1="12" x2="21.5" y2="12"/></svg>');
    send.type = "button"; send.addEventListener("click", sendCurrent);
    chatInput.addEventListener("keydown", function (e) { if (e.key === "Enter") sendCurrent(); });
    comp.appendChild(chatInput); comp.appendChild(send);
    chat.appendChild(head); chat.appendChild(chatBody); chat.appendChild(comp);
    document.body.appendChild(chat);
  }

  function renderMessages(rows) {
    var mine = myId();
    chatBody.innerHTML = "";
    // vienen del backend en orden descendente -> mostrar ascendente
    rows.slice().reverse().forEach(function (m) {
      chatBody.appendChild(elx("div", "mm-msg " + (m.sender_id === mine ? "mine" : "theirs"), esc(m.content)));
    });
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function loadThread(scroll) {
    if (!peer) return;
    try {
      var rows = await api("/messages?withUserId=" + encodeURIComponent(peer.id), { headers: authHeaders() });
      if (!Array.isArray(rows)) rows = [];
      renderMessages(rows);
    } catch (e) { chatBody.innerHTML = '<div class="mm-empty">' + esc(e.message) + "</div>"; }
  }

  function openThread(p) {
    if (!token()) { window.location.replace("/login"); return; }
    if (!chat) buildChat();
    peer = p;
    chatTitle.textContent = p.name;
    if (p.avatar_url) { chatTitleAv.style.backgroundImage = "url('" + esc(p.avatar_url) + "')"; chatTitleAv.textContent = ""; }
    else { chatTitleAv.style.backgroundImage = ""; chatTitleAv.textContent = initial(p.name); }
    chatBody.innerHTML = '<div class="mm-empty">Cargando…</div>';
    chat.classList.add("open");
    loadThread(true);
    clearInterval(pollTimer);
    pollTimer = setInterval(loadThread, 4000); // recibe respuestas mientras está abierto
  }

  function closeThread() {
    clearInterval(pollTimer); pollTimer = null;
    if (chat) chat.classList.remove("open");
    peer = null;
    loadConversations();
  }

  async function sendCurrent() {
    var text = chatInput.value.trim(); if (!text || !peer) return;
    chatInput.value = "";
    // burbuja optimista
    chatBody.appendChild(elx("div", "mm-msg mine", esc(text)));
    chatBody.scrollTop = chatBody.scrollHeight;
    try {
      await api("/messages", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ recipientId: peer.id, content: text }) });
      loadThread();
    } catch (e) {
      chatBody.appendChild(elx("div", "mm-empty", e.message));
    }
  }

  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && chat && chat.classList.contains("open")) closeThread(); });

  // recargar bandeja al entrar a la pestaña chat
  document.querySelectorAll('.bn-item[data-tab="chat"], .dw-item[data-tab="chat"]').forEach(function (n) {
    n.addEventListener("click", function () { setTimeout(loadConversations, 0); });
  });

  window.Messages = { openThread: openThread, reload: loadConversations };
  loadConversations();
})();
