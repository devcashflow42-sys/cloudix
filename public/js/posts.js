/* ==============================================================
   posts.js — Feed rediseñado
   Tarjetas modernas: carrusel de imágenes, video, encuesta, ubicación,
   adjuntos; acciones Me gusta / Comentar / Compartir / Guardar; menú de
   opciones (editar/eliminar/reportar/copiar). Composer con varias fotos,
   encuesta y ubicación. Optimizado (lazy media, sin renders duplicados).
   ============================================================== */
(function () {
  "use strict";

  var feed = document.getElementById("feed");
  var homeEmpty = document.getElementById("homeEmpty");

  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function me() { try { return JSON.parse(localStorage.getItem("nf_user") || "null"); } catch (e) { return null; } }
  function myId() { var u = me(); return u ? u.id : localStorage.getItem("nf_uid"); }
  function authHeaders(x) { var h = x || {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function elx(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function timeAgo(iso) {
    var s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return "hace " + s + "s"; var m = Math.floor(s / 60); if (m < 60) return "hace " + m + "m";
    var h = Math.floor(m / 60); if (h < 24) return "hace " + h + "h"; var d = Math.floor(h / 24); if (d < 7) return "hace " + d + "d";
    return new Date(iso).toLocaleDateString();
  }
  async function api(path, opts) {
    var res; try { res = await fetch(path, opts); } catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }

  // ---------- sheet / toast ----------
  var overlay = elx("div", "sc-overlay"); var sheet = elx("div", "sc-sheet");
  overlay.appendChild(sheet); document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSheet(); });
  function openSheet() { overlay.classList.add("open"); } function closeSheet() { overlay.classList.remove("open"); sheet.innerHTML = ""; }
  var toastEl = elx("div", "sc-toast"); document.body.appendChild(toastEl);
  var toastTimer; function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600); }
  var fileInput = elx("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.multiple = true; fileInput.style.display = "none"; document.body.appendChild(fileInput);

  function compress(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        var dataUrl = cv.toDataURL("image/jpeg", 0.72);
        cv.toBlob(function (blob) { resolve({ dataUrl: dataUrl, blob: blob }); }, "image/jpeg", 0.72);
      };
      img.onerror = function () { resolve(null); };
      img.src = URL.createObjectURL(file);
    });
  }
  async function tryUpload(blob) {
    try {
      var fd = new FormData(); fd.append("file", blob, "post.jpg");
      var res = await fetch("/upload", { method: "POST", headers: authHeaders(), body: fd });
      if (!res.ok) return null; var j = await res.json().catch(function () { return null; });
      return (j && j.success && j.data && j.data.url) ? j.data.url : null;
    } catch (e) { return null; }
  }

  // ================= COMPOSER =================
  function openComposer() {
    if (!token()) { window.location.replace("/login"); return; }
    var photos = [];      // { dataUrl, blob }
    var location = null;  // { lat, lng }
    var pollOn = false;

    function render() {
      sheet.innerHTML = "";
      sheet.appendChild(elx("div", "sc-grip"));
      sheet.appendChild(elx("h3", "sc-title", "Crear publicación"));
      var area = elx("textarea", "sc-area"); area.placeholder = "¿Qué estás pensando?"; area.maxLength = 5000; area.value = draft.text || "";
      area.addEventListener("input", function () { draft.text = area.value; });
      sheet.appendChild(area);

      if (photos.length) {
        var strip = elx("div", "pc-photos");
        photos.forEach(function (p, i) {
          var box = elx("div", "pc-photo"); var im = document.createElement("img"); im.src = p.dataUrl; box.appendChild(im);
          var x = elx("button", "pc-x", "&times;"); x.type = "button"; x.addEventListener("click", function () { photos.splice(i, 1); render(); });
          box.appendChild(x); strip.appendChild(box);
        });
        sheet.appendChild(strip);
      }
      if (pollOn) {
        var pb = elx("div", "pc-poll");
        var q = elx("input", "sc-input"); q.type = "text"; q.placeholder = "Pregunta de la encuesta"; q.value = draft.pollQ || "";
        q.addEventListener("input", function () { draft.pollQ = q.value; });
        pb.appendChild(q);
        draft.pollOpts = draft.pollOpts || ["", ""];
        draft.pollOpts.forEach(function (val, i) {
          var o = elx("input", "sc-input"); o.type = "text"; o.placeholder = "Opción " + (i + 1); o.value = val;
          o.addEventListener("input", function () { draft.pollOpts[i] = o.value; });
          pb.appendChild(o);
        });
        if (draft.pollOpts.length < 6) { var addOpt = elx("button", "sc-link", "+ Añadir opción"); addOpt.type = "button"; addOpt.addEventListener("click", function () { draft.pollOpts.push(""); render(); }); pb.appendChild(addOpt); }
        sheet.appendChild(pb);
      }
      if (location) sheet.appendChild(elx("div", "post-chip", locSvg() + "<b>Ubicación adjunta</b>"));

      var opts = elx("div", "pc-opts");
      opts.appendChild(toolBtn(photoSvg() + " Fotos", function () { fileInput.click(); }));
      opts.appendChild(toolBtn(pollSvg() + " Encuesta", function () { pollOn = !pollOn; render(); }));
      opts.appendChild(toolBtn(locSvg() + " Ubicación", function () {
        if (!navigator.geolocation) { toast("Geolocalización no disponible."); return; }
        navigator.geolocation.getCurrentPosition(function (pos) { location = { lat: pos.coords.latitude, lng: pos.coords.longitude }; toast("Ubicación añadida."); render(); }, function () { toast("No se pudo obtener la ubicación."); });
      }));
      sheet.appendChild(opts);

      var publish = elx("button", "sc-primary", "Publicar"); publish.type = "button";
      publish.addEventListener("click", function () { doPublish(area.value.trim()); });
      sheet.appendChild(publish);
    }

    function toolBtn(html, fn) { var b = elx("button", "pc-tool", html); b.type = "button"; b.addEventListener("click", fn); return b; }
    var draft = { text: "", pollQ: "", pollOpts: null };

    fileInput.onchange = async function () {
      var files = Array.prototype.slice.call(fileInput.files || []); fileInput.value = "";
      for (var i = 0; i < files.length && photos.length < 10; i++) { var r = await compress(files[i]); if (r) photos.push(r); }
      render();
    };

    async function doPublish(text) {
      var poll = null;
      if (pollOn) {
        var options = (draft.pollOpts || []).map(function (s) { return (s || "").trim(); }).filter(Boolean);
        if (options.length < 2) { toast("La encuesta necesita al menos 2 opciones."); return; }
        poll = { question: draft.pollQ || "", options: options };
      }
      if (!text && !photos.length && !poll && !location) { toast("Añade texto, foto, encuesta o ubicación."); return; }
      var pub = sheet.querySelector(".sc-primary"); if (pub) { pub.disabled = true; pub.textContent = "Publicando…"; }
      try {
        var media = [];
        for (var i = 0; i < photos.length; i++) { var url = photos[i].blob ? await tryUpload(photos[i].blob) : null; media.push({ type: "image", url: url || photos[i].dataUrl }); }
        if (location) media.push({ type: "location", lat: location.lat, lng: location.lng });
        await api("/posts", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ content: text, media: media, poll: poll }) });
        closeSheet(); toast("Publicado."); loadFeed(); window.scrollTo(0, 0);
      } catch (e) { if (pub) { pub.disabled = false; pub.textContent = "Publicar"; } toast(e.message); }
    }
    render(); openSheet();
  }

  // ================= FEED =================
  function parseMedia(p) { var m = p.media; if (typeof m === "string") { try { m = JSON.parse(m); } catch (e) { m = []; } } return Array.isArray(m) ? m : []; }

  var videoObserver = ("IntersectionObserver" in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { var v = en.target; if (!en.isIntersecting && !v.paused) v.pause(); });
  }, { threshold: 0.15 }) : null;

  function renderMedia(container, items) {
    var visual = items.filter(function (i) { return i && i.url && ["image", "gif", "video"].indexOf(i.type || "image") >= 0; });
    var extras = items.filter(function (i) { return i && ["audio", "file", "location"].indexOf(i.type) >= 0; });

    if (visual.length) {
      var media = elx("div", "post-media");
      var track = elx("div", "post-track");
      visual.forEach(function (it) {
        var slide = elx("div", "post-slide");
        if (it.type === "video") { var v = document.createElement("video"); v.src = it.url; v.controls = true; v.playsInline = true; v.preload = "metadata"; slide.appendChild(v); if (videoObserver) videoObserver.observe(v); }
        else { var im = document.createElement("img"); im.src = it.url; im.loading = "lazy"; im.decoding = "async"; slide.appendChild(im); }
        track.appendChild(slide);
      });
      media.appendChild(track);
      if (visual.length > 1) {
        media.appendChild(elx("div", "post-count", "1/" + visual.length));
        var dots = elx("div", "post-dots");
        visual.forEach(function (_, i) { dots.appendChild(elx("span", "post-dot" + (i === 0 ? " on" : ""))); });
        media.appendChild(dots);
        var count = media.querySelector(".post-count");
        track.addEventListener("scroll", function () {
          var idx = Math.round(track.scrollLeft / track.clientWidth);
          dots.querySelectorAll(".post-dot").forEach(function (d, i) { d.classList.toggle("on", i === idx); });
          count.textContent = (idx + 1) + "/" + visual.length;
        }, { passive: true });
      }
      container.appendChild(media);
    }
    extras.forEach(function (it) {
      if (it.type === "location") {
        var a = elx("a", "post-chip", locSvg() + "<div><b>Ubicación</b><br><small>Ver en el mapa</small></div>");
        a.href = "https://www.google.com/maps?q=" + it.lat + "," + it.lng; a.target = "_blank"; a.rel = "noopener";
        container.appendChild(a);
      } else if (it.type === "audio") {
        var au = document.createElement("audio"); au.src = it.url; au.controls = true; au.style.width = "100%"; au.style.margin = "6px 0"; container.appendChild(au);
      } else if (it.type === "file") {
        var f = elx("a", "post-chip", fileSvg() + "<div><b>" + esc(it.name || "Archivo") + "</b></div>"); f.href = it.url; f.target = "_blank"; f.rel = "noopener"; container.appendChild(f);
      }
    });
  }

  function renderPoll(container, p) {
    var poll = p.poll; if (typeof poll === "string") { try { poll = JSON.parse(poll); } catch (e) { poll = null; } }
    if (!poll || !Array.isArray(poll.options)) return;
    var counts = p.poll_counts || {}; if (typeof counts === "string") { try { counts = JSON.parse(counts); } catch (e) { counts = {}; } }
    var total = Object.keys(counts).reduce(function (a, k) { return a + (counts[k] || 0); }, 0);
    var myVote = p.my_vote;
    var box = elx("div", "poll");
    if (poll.question) box.appendChild(elx("div", "poll-q", esc(poll.question)));
    poll.options.forEach(function (o) {
      var votes = counts[o.id] || 0;
      var pct = total ? Math.round(votes / total * 100) : 0;
      var opt = elx("div", "poll-opt" + (myVote === o.id ? " mine" : ""));
      var showResults = !!myVote;
      opt.innerHTML = '<span class="poll-fill" style="width:' + (showResults ? pct : 0) + '%"></span>' +
        '<span class="poll-row"><span>' + esc(o.text) + '</span>' + (showResults ? '<b>' + pct + '%</b>' : '') + '</span>';
      opt.addEventListener("click", async function () {
        if (!token()) { window.location.replace("/login"); return; }
        try {
          var d = await api("/posts/" + p.id + "/vote", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ optionId: o.id }) });
          p.my_vote = o.id; p.poll_counts = d.counts || counts;
          var fresh = elx("div"); renderPoll(fresh, p); box.replaceWith(fresh.firstChild);
        } catch (e) { toast(e.message); }
      });
      box.appendChild(opt);
    });
    box.appendChild(elx("div", "poll-total", total + (total === 1 ? " voto" : " votos")));
    container.appendChild(box);
  }

  function card(p) {
    var li = elx("li", "post anim-fade");
    var name = p.display_name || p.username || "Usuario";
    var head = elx("div", "post-head");
    var av = elx("span", "post-av"); if (p.avatar_url) av.style.backgroundImage = "url('" + esc(p.avatar_url) + "')"; else av.textContent = initial(name);
    head.appendChild(av);
    head.appendChild(elx("div", "post-id", "<b>" + esc(name) + "</b><span>@" + esc(p.username) + " · " + timeAgo(p.created_at) + "</span>"));
    var menu = elx("button", "post-menu", '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>');
    menu.type = "button"; menu.addEventListener("click", function () { openOptions(p, li); });
    head.appendChild(menu);
    li.appendChild(head);

    if (p.content) li.appendChild(elx("div", "post-text", esc(p.content)));
    renderMedia(li, parseMedia(p));
    renderPoll(li, p);

    // Barra de acciones
    var actions = elx("div", "post-actions");
    var like = actionBtn(heartSvg(), p.likes_count || 0, p.liked ? "liked" : "");
    like.addEventListener("click", function () { toggleLike(p, like); });
    var cmt = actionBtn(chatSvg(), p.comments_count || 0, "");
    cmt.addEventListener("click", function () { openComments(p, cmt.querySelector(".post-n")); });
    var share = actionBtn(shareSvg(), null, "");
    share.addEventListener("click", function () { openShare(p); });
    var spacer = elx("div", "post-spacer");
    var save = actionBtn(bookmarkSvg(), null, p.saved ? "saved" : "");
    save.addEventListener("click", function () { toggleSave(p, save); });
    actions.appendChild(like); actions.appendChild(cmt); actions.appendChild(share); actions.appendChild(spacer); actions.appendChild(save);
    li.appendChild(actions);
    return li;
  }
  function actionBtn(icon, n, cls) { var b = elx("button", "post-btn " + (cls || ""), icon + (n != null ? '<span class="post-n">' + n + "</span>" : "")); b.type = "button"; return b; }

  async function toggleLike(p, btn) {
    if (!token()) { window.location.replace("/login"); return; }
    var liked = btn.classList.contains("liked"); var nEl = btn.querySelector(".post-n");
    try {
      await api("/reactions", { method: liked ? "DELETE" : "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ targetType: "post", targetId: p.id, type: "like" }) });
      liked = !liked; btn.classList.toggle("liked", liked); var n = parseInt(nEl.textContent, 10) || 0; nEl.textContent = liked ? n + 1 : Math.max(0, n - 1);
    } catch (e) { toast(e.message); }
  }
  async function toggleSave(p, btn) {
    if (!token()) { window.location.replace("/login"); return; }
    var saved = btn.classList.contains("saved");
    try { await api("/posts/" + p.id + "/save", { method: saved ? "DELETE" : "POST", headers: authHeaders() }); btn.classList.toggle("saved", !saved); btn.classList.add("anim-pop"); toast(saved ? "Quitado de guardados" : "Guardado"); }
    catch (e) { toast(e.message); }
  }

  // ---------- opciones (⋮) ----------
  function openOptions(p, li) {
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip"));
    var mine = myId() && p.author_id === myId();
    if (mine) {
      sheet.appendChild(optBtn("Editar", function () { editPost(p, li); }));
      sheet.appendChild(optBtn("Eliminar", function () { deletePost(p, li); }, true));
    }
    sheet.appendChild(optBtn("Compartir", function () { openShare(p); }));
    sheet.appendChild(optBtn("Copiar enlace", function () { copyLink(p); }));
    if (!mine) sheet.appendChild(optBtn("Reportar", function () { reportPost(p); }, true));
    openSheet();
  }
  function optBtn(label, fn, danger) { var b = elx("button", "gc-abtn" + (danger ? " danger" : ""), label); b.type = "button"; b.style.width = "100%"; b.style.marginBottom = "8px"; b.addEventListener("click", fn); return b; }

  function editPost(p, li) {
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip")); sheet.appendChild(elx("h3", "sc-title", "Editar publicación"));
    var area = elx("textarea", "sc-area"); area.value = p.content || ""; area.maxLength = 5000; sheet.appendChild(area);
    var save = elx("button", "sc-primary", "Guardar"); save.type = "button";
    save.addEventListener("click", async function () {
      save.disabled = true;
      try { await api("/posts/" + p.id, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ content: area.value.trim() }) }); p.content = area.value.trim(); var t = li.querySelector(".post-text"); if (t) t.textContent = p.content; else li.querySelector(".post-head").insertAdjacentElement("afterend", elx("div", "post-text", esc(p.content))); closeSheet(); toast("Actualizado."); }
      catch (e) { save.disabled = false; toast(e.message); }
    });
    sheet.appendChild(save); openSheet();
  }
  async function deletePost(p, li) {
    try { await api("/posts/" + p.id, { method: "DELETE", headers: authHeaders() }); closeSheet(); li.style.transition = "opacity .2s"; li.style.opacity = "0"; setTimeout(function () { li.remove(); }, 200); toast("Publicación eliminada."); }
    catch (e) { toast(e.message); }
  }
  async function reportPost(p) {
    try { await api("/posts/" + p.id + "/report", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ reason: "" }) }); closeSheet(); toast("Gracias por tu reporte."); }
    catch (e) { toast(e.message); }
  }
  function copyLink(p) {
    var link = window.location.origin + "/#post-" + p.id;
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast("Enlace copiado."); }, function () { toast(link); });
    else toast(link);
    closeSheet();
  }

  // ---------- compartir ----------
  function openShare(p) {
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip")); sheet.appendChild(elx("h3", "sc-title", "Compartir"));
    if (navigator.share) sheet.appendChild(optBtn("Compartir con…", function () { navigator.share({ title: "Cloudix", text: (p.content || "Mira esta publicación"), url: window.location.origin + "/#post-" + p.id }).catch(function () {}); }));
    sheet.appendChild(optBtn("Enviar a un amigo", function () { shareToFriend(p); }));
    sheet.appendChild(optBtn("Copiar enlace", function () { copyLink(p); }));
    openSheet();
  }
  async function shareToFriend(p) {
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip")); sheet.appendChild(elx("h3", "sc-title", "Enviar a…"));
    var list = elx("ul", "sc-list"); sheet.appendChild(list); list.innerHTML = '<div class="sc-empty">Cargando…</div>';
    try {
      var d = await api("/friends", { headers: authHeaders() }); var friends = d.friends || [];
      list.innerHTML = ""; if (!friends.length) { list.appendChild(elx("div", "sc-empty", "Aún no sigues a nadie.")); return; }
      friends.forEach(function (f) {
        var name = f.display_name || f.username; var row = elx("li", "sc-friend");
        var av = elx("span", "sc-av"); if (f.avatar_url) av.style.backgroundImage = "url('" + esc(f.avatar_url) + "')"; else av.textContent = initial(name);
        row.appendChild(av); row.appendChild(elx("span", "sc-fn", "<b>" + esc(name) + "</b><span>@" + esc(f.username) + "</span>"));
        row.addEventListener("click", async function () {
          try { await api("/messages", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ recipientId: f.id, content: "Mira esta publicación: " + window.location.origin + "/#post-" + p.id }) }); closeSheet(); toast("Enviado a " + name); }
          catch (e) { toast(e.message); }
        });
        list.appendChild(row);
      });
    } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }
  }

  // ---------- comentarios ----------
  async function openComments(post, countEl) {
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip")); sheet.appendChild(elx("h3", "sc-title", "Comentarios"));
    var list = elx("ul", "sc-list"); sheet.appendChild(list);
    var input = elx("input", "sc-input"); input.type = "text"; input.placeholder = "Escribe un comentario…"; input.maxLength = 2000; sheet.appendChild(input);
    var send = elx("button", "sc-primary", "Comentar"); send.type = "button"; sheet.appendChild(send); openSheet();
    async function draw() {
      list.innerHTML = '<div class="sc-empty">Cargando…</div>';
      try {
        var data = await api("/comments?postId=" + encodeURIComponent(post.id), { headers: authHeaders() });
        var rows = Array.isArray(data) ? data : []; list.innerHTML = "";
        if (!rows.length) { list.appendChild(elx("div", "sc-empty", "Sé el primero en comentar.")); return; }
        rows.forEach(function (c) {
          var name = c.display_name || c.author_username || "Usuario"; var row = elx("li", "sc-friend");
          var av = elx("span", "sc-av"); if (c.author_avatar) av.style.backgroundImage = "url('" + esc(c.author_avatar) + "')"; else av.textContent = initial(name);
          row.appendChild(av); row.appendChild(elx("span", "sc-fn", "<b>" + esc(name) + "</b><span>" + esc(c.content) + "</span>")); list.appendChild(row);
        });
      } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }
    }
    send.addEventListener("click", async function () {
      var text = input.value.trim(); if (!text) return; if (!token()) { window.location.replace("/login"); return; }
      send.disabled = true;
      try { await api("/comments", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ postId: post.id, content: text }) }); input.value = ""; if (countEl) countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1; await draw(); }
      catch (e) { toast(e.message); } finally { send.disabled = false; }
    });
    draw();
  }

  // ---------- carga del feed ----------
  async function loadFeed() {
    if (!feed) return;
    try {
      var data = await api("/posts", { headers: authHeaders() });
      var posts = Array.isArray(data) ? data : [];
      feed.innerHTML = "";
      if (!posts.length) { if (homeEmpty) homeEmpty.style.display = ""; return; }
      if (homeEmpty) homeEmpty.style.display = "none";
      var frag = document.createDocumentFragment();
      posts.forEach(function (p) { frag.appendChild(card(p)); });
      feed.appendChild(frag);
    } catch (e) { /* deja el estado vacío */ }
  }

  // ---------- iconos ----------
  function heartSvg() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z"/></svg>'; }
  function chatSvg() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1 4-11.4 8.4 8.4 0 0 1 12 7.6z"/></svg>'; }
  function shareSvg() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>'; }
  function bookmarkSvg() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'; }
  function photoSvg() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3.5"/><circle cx="8.8" cy="9.2" r="1.9"/><path d="m4 17.5 4.6-4.2a2 2 0 0 1 2.7 0L20 20.5"/></svg>'; }
  function pollSvg() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><line x1="6" y1="20" x2="6" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/></svg>'; }
  function locSvg() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'; }
  function fileSvg() { return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'; }

  // ---------- wiring ----------
  document.querySelectorAll('[data-tab="create"]').forEach(function (btn) { btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openComposer(); }); });
  document.querySelectorAll('.bn-item[data-tab="home"], .dw-item[data-tab="home"]').forEach(function (n) { n.addEventListener("click", function () { setTimeout(loadFeed, 0); }); });

  window.Posts = { reload: loadFeed, compose: openComposer };
  loadFeed();
})();
