/* ==============================================================
   posts.js — Publicaciones: crear (texto + imagen editable), feed,
   me gusta y comentarios.
   - Editor de imagen: recorte cuadrado + filtros básicos (canvas).
   - Sube a R2 si está configurado; si no, incrusta la imagen comprimida.
   ============================================================== */
(function () {
  "use strict";

  var feed = document.getElementById("feed");
  var homeEmpty = document.getElementById("homeEmpty");

  // ---------- sesión / API ----------
  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function me() { try { return JSON.parse(localStorage.getItem("nf_user") || "null"); } catch (e) { return null; } }
  function authHeaders(extra) { var h = extra || {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }

  async function api(path, opts) {
    var res;
    try { res = await fetch(path, opts); }
    catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }

  function timeAgo(iso) {
    var s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return "hace " + s + "s";
    var m = Math.floor(s / 60); if (m < 60) return "hace " + m + "m";
    var h = Math.floor(m / 60); if (h < 24) return "hace " + h + "h";
    var d = Math.floor(h / 24); if (d < 7) return "hace " + d + "d";
    return new Date(iso).toLocaleDateString();
  }

  // ---------- overlay / sheet / toast ----------
  function elx(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  var overlay = elx("div", "sc-overlay");
  var sheet = elx("div", "sc-sheet");
  overlay.appendChild(sheet); document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSheet(); });
  function openSheet() { overlay.classList.add("open"); }
  function closeSheet() { overlay.classList.remove("open"); sheet.innerHTML = ""; }

  var toastEl = elx("div", "sc-toast"); document.body.appendChild(toastEl);
  var toastTimer;
  function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600); }

  var fileInput = elx("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  // ---------- editor de imagen ----------
  var FILTERS = [
    { name: "Normal", css: "none" },
    { name: "Realce", css: "contrast(1.15) saturate(1.28)" },
    { name: "B/N", css: "grayscale(1) contrast(1.05)" },
    { name: "Cálido", css: "sepia(.32) saturate(1.35) hue-rotate(-8deg)" },
    { name: "Frío", css: "saturate(1.1) hue-rotate(16deg) brightness(1.04)" },
    { name: "Nítido", css: "contrast(1.25) brightness(1.05)" },
  ];

  function drawCover(ctx, img, size) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var side = Math.min(iw, ih);
    var sx = (iw - side) / 2, sy = (ih - side) / 2;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  }

  // Devuelve una Promise con { dataUrl, blob } de la imagen editada, o null si se cancela.
  function editImage(img) {
    return new Promise(function (resolve) {
      sheet.innerHTML = "";
      sheet.appendChild(elx("div", "sc-grip"));
      sheet.appendChild(elx("h3", "sc-title", "Editar foto"));

      var canvas = document.createElement("canvas");
      canvas.className = "pc-edit-canvas"; canvas.width = 1080; canvas.height = 1080;
      var ctx = canvas.getContext("2d");
      drawCover(ctx, img, 1080);
      sheet.appendChild(canvas);

      var filters = elx("div", "pc-filters");
      var selected = "none";
      FILTERS.forEach(function (f, i) {
        var b = elx("button", "pc-filter" + (i === 0 ? " on" : ""), f.name); b.type = "button";
        b.addEventListener("click", function () {
          selected = f.css;
          filters.querySelectorAll(".pc-filter").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
          canvas.style.filter = f.css === "none" ? "" : f.css;
        });
        filters.appendChild(b);
      });
      sheet.appendChild(filters);

      var done = elx("button", "sc-primary", "Usar foto"); done.type = "button";
      sheet.appendChild(done);
      done.addEventListener("click", function () {
        var out = document.createElement("canvas"); out.width = 1080; out.height = 1080;
        var octx = out.getContext("2d");
        if (selected !== "none") octx.filter = selected;
        drawCover(octx, img, 1080);
        var dataUrl = out.toDataURL("image/jpeg", 0.72);
        out.toBlob(function (blob) { resolve({ dataUrl: dataUrl, blob: blob }); }, "image/jpeg", 0.72);
      });
      openSheet();
    });
  }

  function pickAndEdit() {
    return new Promise(function (resolve) {
      fileInput.value = "";
      fileInput.onchange = function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) { resolve(null); return; }
        var img = new Image();
        img.onload = function () { editImage(img).then(resolve); };
        img.onerror = function () { toast("No se pudo cargar la imagen."); resolve(null); };
        img.src = URL.createObjectURL(file);
      };
      fileInput.click();
    });
  }

  async function tryUpload(blob) {
    try {
      var fd = new FormData();
      fd.append("file", blob, "post.jpg");
      var res = await fetch("/upload", { method: "POST", headers: authHeaders(), body: fd });
      if (!res.ok) return null;
      var j = await res.json().catch(function () { return null; });
      return (j && j.success && j.data && j.data.url) ? j.data.url : null;
    } catch (e) { return null; }
  }

  // ---------- composer ----------
  function openComposer() {
    if (!token()) { window.location.replace("/login"); return; }
    var pending = null; // { dataUrl, blob }

    function render() {
      sheet.innerHTML = "";
      sheet.appendChild(elx("div", "sc-grip"));
      sheet.appendChild(elx("h3", "sc-title", "Crear publicación"));

      var area = elx("textarea", "sc-area"); area.placeholder = "¿Qué estás pensando?"; area.maxLength = 5000;
      sheet.appendChild(area);

      if (pending) {
        var thumb = elx("div", "pc-thumb");
        var im = document.createElement("img"); im.src = pending.dataUrl; thumb.appendChild(im);
        var x = elx("button", "pc-x", "&times;"); x.type = "button";
        x.addEventListener("click", function () { pending = null; render(); });
        thumb.appendChild(x); sheet.appendChild(thumb);
      } else {
        var tools = elx("div", "pc-tools");
        var addImg = elx("button", "pc-tool",
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3.5"/><circle cx="8.8" cy="9.2" r="1.9"/><path d="m4 17.5 4.6-4.2a2 2 0 0 1 2.7 0L20 20.5"/></svg> Foto');
        addImg.type = "button";
        addImg.addEventListener("click", function () {
          var text = area.value;
          pickAndEdit().then(function (r) { pending = r; render(); if (r) { setTimeout(function () { var a = sheet.querySelector(".sc-area"); if (a) a.value = text; }, 0); } });
        });
        tools.appendChild(addImg);
        sheet.appendChild(tools);
      }

      var publish = elx("button", "sc-primary", "Publicar"); publish.type = "button";
      sheet.appendChild(publish);

      publish.addEventListener("click", async function () {
        var content = area.value.trim();
        if (!content && !pending) { toast("Escribe algo o añade una foto."); return; }
        publish.disabled = true; publish.textContent = "Publicando…";
        try {
          var media = [];
          if (pending) {
            var url = pending.blob ? await tryUpload(pending.blob) : null;
            media.push({ type: "image", url: url || pending.dataUrl });
          }
          await api("/posts", {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ content: content, media: media }),
          });
          closeSheet();
          toast("Publicado.");
          loadFeed();
          window.scrollTo(0, 0);
        } catch (e) {
          publish.disabled = false; publish.textContent = "Publicar";
          toast(e.message);
        }
      });
    }
    render();
    openSheet();
  }

  // ---------- feed ----------
  function mediaImage(p) {
    var m = p.media;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch (e) { m = []; } }
    if (!Array.isArray(m)) return null;
    for (var i = 0; i < m.length; i++) { if (m[i] && m[i].url && (!m[i].type || m[i].type === "image")) return m[i].url; }
    return null;
  }

  var HEART = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z"/></svg>';
  var CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1 4-11.4 8.4 8.4 0 0 1 12 7.6z"/></svg>';

  function postCard(p) {
    var li = elx("li", "post");
    var name = p.display_name || p.username || "Usuario";
    var av = elx("span", "post-av");
    if (p.avatar_url) av.style.backgroundImage = "url('" + esc(p.avatar_url) + "')"; else av.textContent = initial(name);

    var head = elx("div", "post-head");
    var idbox = elx("div", "post-id", "<b>" + esc(name) + "</b><span>@" + esc(p.username) + " · " + timeAgo(p.created_at) + "</span>");
    head.appendChild(av); head.appendChild(idbox);
    li.appendChild(head);

    if (p.content) li.appendChild(elx("div", "post-text", esc(p.content)));
    var img = mediaImage(p);
    if (img) { var image = document.createElement("img"); image.className = "post-img"; image.loading = "lazy"; image.src = img; li.appendChild(image); }

    var actions = elx("div", "post-actions");
    var likeBtn = elx("button", "post-btn" + (p.liked ? " liked" : ""), HEART + '<span class="post-n">' + (p.likes_count || 0) + "</span>");
    likeBtn.type = "button";
    var likeN = likeBtn.querySelector(".post-n");
    likeBtn.addEventListener("click", async function () {
      if (!token()) { window.location.replace("/login"); return; }
      var liked = likeBtn.classList.contains("liked");
      try {
        await api("/reactions", { method: liked ? "DELETE" : "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ targetType: "post", targetId: p.id, type: "like" }) });
        liked = !liked; likeBtn.classList.toggle("liked", liked);
        var n = parseInt(likeN.textContent, 10) || 0; likeN.textContent = liked ? n + 1 : Math.max(0, n - 1);
      } catch (e) { toast(e.message); }
    });

    var cmtBtn = elx("button", "post-btn", CHAT + '<span class="post-n">' + (p.comments_count || 0) + "</span>");
    cmtBtn.type = "button";
    cmtBtn.addEventListener("click", function () { openComments(p, cmtBtn.querySelector(".post-n")); });

    actions.appendChild(likeBtn); actions.appendChild(cmtBtn);
    li.appendChild(actions);
    return li;
  }

  async function loadFeed() {
    if (!feed) return;
    try {
      var data = await api("/posts", { headers: authHeaders() });
      var posts = data || [];
      // paginated() devuelve el array en data
      if (!Array.isArray(posts)) posts = [];
      feed.innerHTML = "";
      if (!posts.length) { if (homeEmpty) homeEmpty.style.display = ""; return; }
      if (homeEmpty) homeEmpty.style.display = "none";
      posts.forEach(function (p) { feed.appendChild(postCard(p)); });
    } catch (e) {
      // Silencioso: deja el estado vacío por defecto.
    }
  }

  // ---------- comentarios ----------
  async function openComments(post, countEl) {
    sheet.innerHTML = "";
    sheet.appendChild(elx("div", "sc-grip"));
    sheet.appendChild(elx("h3", "sc-title", "Comentarios"));
    var list = elx("ul", "sc-list"); sheet.appendChild(list);
    var input = elx("input", "sc-input"); input.type = "text"; input.placeholder = "Escribe un comentario…"; input.maxLength = 2000;
    sheet.appendChild(input);
    var send = elx("button", "sc-primary", "Comentar"); send.type = "button";
    sheet.appendChild(send);
    openSheet();

    async function render() {
      list.innerHTML = '<div class="sc-empty">Cargando…</div>';
      try {
        var data = await api("/comments?postId=" + encodeURIComponent(post.id), { headers: authHeaders() });
        var rows = Array.isArray(data) ? data : [];
        list.innerHTML = "";
        if (!rows.length) { list.appendChild(elx("div", "sc-empty", "Sé el primero en comentar.")); return; }
        rows.forEach(function (c) {
          var name = c.display_name || c.author_username || c.username || "Usuario";
          var row = elx("li", "sc-friend");
          var av = elx("span", "sc-av"); if (c.author_avatar || c.avatar_url) av.style.backgroundImage = "url('" + esc(c.author_avatar || c.avatar_url) + "')"; else av.textContent = initial(name);
          row.appendChild(av);
          row.appendChild(elx("span", "sc-fn", "<b>" + esc(name) + "</b><span>" + esc(c.content) + "</span>"));
          list.appendChild(row);
        });
      } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }
    }
    send.addEventListener("click", async function () {
      var text = input.value.trim(); if (!text) return;
      if (!token()) { window.location.replace("/login"); return; }
      send.disabled = true;
      try {
        await api("/comments", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ postId: post.id, content: text }) });
        input.value = "";
        if (countEl) countEl.textContent = (parseInt(countEl.textContent, 10) || 0) + 1;
        await render();
      } catch (e) { toast(e.message); } finally { send.disabled = false; }
    });
    render();
  }

  // ---------- wiring ----------
  document.querySelectorAll('[data-tab="create"]').forEach(function (btn) {
    btn.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openComposer(); });
  });
  document.querySelectorAll('.bn-item[data-tab="home"], .dw-item[data-tab="home"]').forEach(function (n) {
    n.addEventListener("click", function () { setTimeout(loadFeed, 0); });
  });

  loadFeed();
})();
