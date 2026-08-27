/* ==============================================================
   stories.js — Historias tipo Instagram
   - Barra de historias (aros por autor) + "Tu historia" para subir.
   - Visor a pantalla completa: barras de progreso, auto-avance, tap
     izq/der, reacciones ❤️😍, responder por mensaje (si sigues), y
     si es tu historia: cuántos la vieron y quiénes.
   - Registra vistas al abrir cada historia.
   ============================================================== */
(function () {
  "use strict";

  // ---------- sesión / API ----------
  function token() { try { return localStorage.getItem("nf_token"); } catch (e) { return null; } }
  function me() { try { return JSON.parse(localStorage.getItem("nf_user") || "null"); } catch (e) { return null; } }
  function authHeaders(extra) { var h = extra || {}; var t = token(); if (t) h["Authorization"] = "Bearer " + t; return h; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function initial(s) { s = (s || "").trim(); return s ? s.charAt(0).toUpperCase() : "?"; }
  function elx(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function timeAgo(iso) {
    var s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return "hace " + s + "s"; var m = Math.floor(s / 60); if (m < 60) return "hace " + m + "m";
    var h = Math.floor(m / 60); if (h < 24) return "hace " + h + "h"; return "hace " + Math.floor(h / 24) + "d";
  }
  async function api(path, opts) {
    var res;
    try { res = await fetch(path, opts); } catch (e) { throw new Error("Sin conexión con el servidor."); }
    if (res.status === 401) { window.location.replace("/login"); throw new Error("Sesión expirada."); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok || !j || j.success === false) throw new Error((j && j.message) || ("Error (" + res.status + ")."));
    return j.data || {};
  }

  var storiesBar = document.querySelector(".stories");
  var addBtn = storiesBar ? storiesBar.querySelector(".story") : null;

  // ---------- toast + hoja para subir ----------
  var toastEl = elx("div", "sc-toast"); document.body.appendChild(toastEl);
  var toastTimer; function toast(m) { toastEl.textContent = m; toastEl.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600); }

  var overlay = elx("div", "sc-overlay"); var sheet = elx("div", "sc-sheet");
  overlay.appendChild(sheet); document.body.appendChild(overlay);
  var resumeAfterSheet = false;
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeSheet(); });
  function openSheet() { overlay.classList.add("open"); }
  function closeSheet() { overlay.classList.remove("open"); sheet.innerHTML = ""; if (resumeAfterSheet) { resumeAfterSheet = false; resume(); } }

  var fileInput = elx("input"); fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.style.display = "none"; document.body.appendChild(fileInput);

  var FILTERS = [
    { name: "Normal", css: "none" }, { name: "Realce", css: "contrast(1.15) saturate(1.28)" },
    { name: "B/N", css: "grayscale(1) contrast(1.05)" }, { name: "Cálido", css: "sepia(.32) saturate(1.35) hue-rotate(-8deg)" },
    { name: "Frío", css: "saturate(1.1) hue-rotate(16deg) brightness(1.04)" },
  ];

  // Editor: preserva proporción, máx 1080px, filtro. Resuelve {dataUrl, blob, caption}.
  function editStory(img) {
    return new Promise(function (resolve) {
      sheet.innerHTML = "";
      sheet.appendChild(elx("div", "sc-grip"));
      sheet.appendChild(elx("h3", "sc-title", "Nueva historia"));
      var preview = document.createElement("img");
      preview.src = img.src; preview.style.width = "100%"; preview.style.borderRadius = "14px"; preview.style.maxHeight = "46vh"; preview.style.objectFit = "contain"; preview.style.background = "#000";
      sheet.appendChild(preview);
      var selected = "none";
      var filters = elx("div", "pc-filters");
      FILTERS.forEach(function (f, i) {
        var b = elx("button", "pc-filter" + (i === 0 ? " on" : ""), f.name); b.type = "button";
        b.addEventListener("click", function () { selected = f.css; filters.querySelectorAll(".pc-filter").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); preview.style.filter = f.css === "none" ? "" : f.css; });
        filters.appendChild(b);
      });
      sheet.appendChild(filters);
      var cap = elx("input", "sc-input"); cap.type = "text"; cap.placeholder = "Añade un texto (opcional)…"; cap.maxLength = 300; sheet.appendChild(cap);
      var pub = elx("button", "sc-primary", "Publicar historia"); pub.type = "button"; sheet.appendChild(pub);
      pub.addEventListener("click", function () {
        var scale = Math.min(1, 1080 / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        var ctx = cv.getContext("2d"); if (selected !== "none") ctx.filter = selected; ctx.drawImage(img, 0, 0, w, h);
        var dataUrl = cv.toDataURL("image/jpeg", 0.72);
        cv.toBlob(function (blob) { resolve({ dataUrl: dataUrl, blob: blob, caption: cap.value.trim() }); }, "image/jpeg", 0.72);
      });
      openSheet();
    });
  }

  async function tryUpload(blob) {
    try {
      var fd = new FormData(); fd.append("file", blob, "story.jpg");
      var res = await fetch("/upload", { method: "POST", headers: authHeaders(), body: fd });
      if (!res.ok) return null; var j = await res.json().catch(function () { return null; });
      return (j && j.success && j.data && j.data.url) ? j.data.url : null;
    } catch (e) { return null; }
  }

  function addStory() {
    if (!token()) { window.location.replace("/login"); return; }
    fileInput.value = "";
    fileInput.onchange = function () {
      var file = fileInput.files && fileInput.files[0]; if (!file) return;
      var img = new Image();
      img.onload = function () {
        editStory(img).then(async function (r) {
          if (!r) return;
          try {
            var url = r.blob ? await tryUpload(r.blob) : null;
            await api("/stories", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ mediaUrl: url || r.dataUrl, mediaType: "image", caption: r.caption }) });
            closeSheet(); toast("Historia publicada."); loadBar();
          } catch (e) { toast(e.message); }
        });
      };
      img.onerror = function () { toast("No se pudo cargar la imagen."); };
      img.src = URL.createObjectURL(file);
    };
    fileInput.click();
  }
  // El badge "+" siempre añade una historia (aunque el botón abra mi visor).
  var addPlus = addBtn ? addBtn.querySelector(".story-add") : null;
  if (addPlus) addPlus.addEventListener("click", function (e) { e.stopPropagation(); addStory(); });

  // ---------- barra de historias ----------
  var groups = [];
  function groupByAuthor(list) {
    var out = [], byId = {};
    list.forEach(function (s) {
      if (!byId[s.author_id]) { byId[s.author_id] = { author: { id: s.author_id, username: s.username, display_name: s.display_name, avatar_url: s.avatar_url }, stories: [] }; out.push(byId[s.author_id]); }
      byId[s.author_id].stories.push(s);
    });
    return out;
  }

  function skeletonStory() {
    var d = elx("div", "story-sk");
    d.innerHTML = '<span class="skeleton sk-c"></span><span class="skeleton sk-t"></span>';
    return d;
  }

  async function loadBar() {
    if (!storiesBar) return;

    // Skeletons mientras carga.
    storiesBar.querySelectorAll(".st-ring-item, .story-sk").forEach(function (n) { n.remove(); });
    for (var s = 0; s < 4; s++) storiesBar.appendChild(skeletonStory());

    try {
      var data = await api("/stories", { headers: authHeaders() });
      groups = groupByAuthor(data.stories || []);
    } catch (e) { groups = []; }

    // limpia skeletons y aros previos (deja el botón "Tu historia")
    storiesBar.querySelectorAll(".st-ring-item, .story-sk").forEach(function (n) { n.remove(); });

    var uid = me() && me().id;
    var myIndex = groups.findIndex(function (g) { return g.author.id === uid; });

    // Configura "Tu historia": si tengo historias, abre mi visor; el + siempre añade.
    if (addBtn) {
      var mav = addBtn.querySelector(".story-avatar");
      var mring = addBtn.querySelector(".story-ring");
      var u = me();
      if (mav && u && u.avatar_url) { mav.innerHTML = ""; mav.classList.add("img"); mav.style.backgroundImage = "url('" + esc(u.avatar_url) + "')"; }
      if (myIndex >= 0) {
        var mineSeen = groups[myIndex].stories.every(function (s) { return s.viewed; });
        if (mring) mring.className = "story-ring " + (mineSeen ? "seen" : "has");
        addBtn.onclick = function () { openViewer(myIndex); };
      } else {
        if (mring) mring.className = "story-ring";
        addBtn.onclick = function () { addStory(); };
      }
    }

    // Aros de los DEMÁS autores (nunca el mío -> sin duplicados)
    groups.forEach(function (g, gi) {
      if (g.author.id === uid) return;
      var allSeen = g.stories.every(function (s) { return s.viewed; });
      var btn = elx("button", "story st-ring-item anim-fade"); btn.type = "button";
      var ring = elx("span", "story-ring " + (allSeen ? "seen" : "has"));
      var av = elx("span", "story-avatar" + (g.author.avatar_url ? " img" : ""));
      if (g.author.avatar_url) av.style.backgroundImage = "url('" + esc(g.author.avatar_url) + "')"; else av.textContent = initial(g.author.display_name || g.author.username);
      ring.appendChild(av); btn.appendChild(ring);
      btn.appendChild(elx("span", "story-name", esc(g.author.display_name || g.author.username)));
      btn.addEventListener("click", function () { openViewer(gi); });
      storiesBar.appendChild(btn);
    });
  }

  // ---------- visor ----------
  var viewer = null, vBars, vTop, vStage, vFoot, vCaption;
  var gi = 0, si = 0, DURATION = 5000, timer = null, segStart = 0, segLeft = DURATION, paused = false, curFill = null;

  function buildViewer() {
    viewer = elx("div", "st-viewer");
    vBars = elx("div", "st-bars"); viewer.appendChild(vBars);
    vTop = elx("div", "st-top"); viewer.appendChild(vTop);
    vStage = elx("div", "st-stage"); viewer.appendChild(vStage);
    vFoot = elx("div", "st-foot"); viewer.appendChild(vFoot);
    var navL = elx("div", "st-nav left"), navR = elx("div", "st-nav right");
    navL.addEventListener("click", prev); navR.addEventListener("click", next);
    vStage.appendChild(navL); vStage.appendChild(navR);
    document.body.appendChild(viewer);
  }

  function openViewer(startGi) {
    if (!viewer) buildViewer();
    gi = startGi; si = 0;
    // empieza en la primera historia no vista de ese autor
    var g = groups[gi]; if (g) { var idx = g.stories.findIndex(function (s) { return !s.viewed; }); if (idx > 0) si = idx; }
    viewer.classList.add("open");
    show();
  }
  function closeViewer() { clearTimeout(timer); if (viewer) viewer.classList.remove("open"); loadBar(); }

  function curStory() { return groups[gi] && groups[gi].stories[si]; }
  function isMine() { var g = groups[gi]; return me() && g && g.author.id === me().id; }

  function show() {
    var g = groups[gi], s = curStory(); if (!g || !s) { closeViewer(); return; }
    // barras
    vBars.innerHTML = "";
    g.stories.forEach(function (_, i) {
      var bar = elx("div", "st-bar" + (i < si ? " done" : "")); var fill = elx("i"); bar.appendChild(fill); vBars.appendChild(bar);
    });
    curFill = vBars.children[si].querySelector("i");
    // top
    vTop.innerHTML = "";
    var av = elx("span", "st-av"); if (g.author.avatar_url) av.style.backgroundImage = "url('" + esc(g.author.avatar_url) + "')"; else av.textContent = initial(g.author.display_name || g.author.username);
    vTop.appendChild(av);
    vTop.appendChild(elx("span", "st-meta", "<b>" + esc(isMine() ? "Tu historia" : (g.author.display_name || g.author.username)) + "</b><span>" + timeAgo(s.created_at) + "</span>"));
    var close = elx("button", "st-close", "&times;"); close.type = "button"; close.addEventListener("click", closeViewer); vTop.appendChild(close);
    // media
    vStage.querySelectorAll("img,.st-caption").forEach(function (n) { n.remove(); });
    var img = document.createElement("img"); img.src = s.media_url; vStage.insertBefore(img, vStage.querySelector(".st-nav"));
    if (s.caption) { var cap = elx("div", "st-caption", esc(s.caption)); vStage.appendChild(cap); }
    // footer
    renderFoot(s);
    // registrar vista
    if (!isMine() && !s.viewed) { s.viewed = true; api("/stories/" + s.id + "/view", { method: "POST", headers: authHeaders() }).catch(function () {}); }
    runSegment(DURATION);
  }

  function renderFoot(s) {
    vFoot.innerHTML = "";
    if (isMine()) {
      var views = elx("button", "st-views",
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg> ' + (s.views_count || 0));
      views.type = "button";
      views.addEventListener("click", function () { openViewers(s); });
      vFoot.appendChild(views);
      return;
    }
    // reacciones
    ["like", "love"].forEach(function (r) {
      var emoji = r === "like" ? "❤️" : "😍";
      var b = elx("button", "st-react" + (s.my_reaction === r ? "" : " off"), emoji); b.type = "button";
      b.addEventListener("click", function () {
        var was = s.my_reaction === r;
        if (was) { s.my_reaction = null; api("/stories/" + s.id + "/react", { method: "DELETE", headers: authHeaders() }).catch(function () {}); }
        else { s.my_reaction = r; api("/stories/" + s.id + "/react", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ reaction: r }) }).catch(function () {}); }
        renderFoot(s);
      });
      vFoot.appendChild(b);
    });
    // mensaje (solo si sigues al autor)
    if (s.author_following) {
      var input = elx("input", "st-msg"); input.type = "text"; input.placeholder = "Enviar mensaje…";
      input.addEventListener("focus", pause);
      input.addEventListener("blur", function () { setTimeout(resume, 50); });
      input.addEventListener("keydown", async function (e) {
        if (e.key !== "Enter" || !input.value.trim()) return;
        var text = input.value.trim(); input.value = "";
        try { await api("/messages", { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ recipientId: groups[gi].author.id, content: text }) }); toast("Mensaje enviado"); }
        catch (err) { toast(err.message); }
      });
      vFoot.appendChild(input);
    }
  }

  function runSegment(ms) {
    clearTimeout(timer); paused = false; segStart = Date.now(); segLeft = ms;
    if (!curFill) return;
    curFill.style.transition = "none"; curFill.style.width = ((DURATION - ms) / DURATION * 100) + "%";
    void curFill.offsetWidth;
    curFill.style.transition = "width " + ms + "ms linear"; curFill.style.width = "100%";
    timer = setTimeout(next, ms);
  }
  function pause() { if (paused || !curFill) return; paused = true; clearTimeout(timer); segLeft = Math.max(0, segLeft - (Date.now() - segStart)); var w = getComputedStyle(curFill).width; curFill.style.transition = "none"; curFill.style.width = w; }
  function resume() { if (!paused) return; runSegment(segLeft); }

  function next() { clearTimeout(timer); var g = groups[gi]; if (g && si < g.stories.length - 1) { si++; show(); } else if (gi < groups.length - 1) { gi++; si = 0; show(); } else { closeViewer(); } }
  function prev() { clearTimeout(timer); if (si > 0) { si--; show(); } else if (gi > 0) { gi--; si = groups[gi].stories.length - 1; show(); } else { show(); } }

  // ---------- quién la vio ----------
  async function openViewers(s) {
    pause(); resumeAfterSheet = true;
    sheet.innerHTML = ""; sheet.appendChild(elx("div", "sc-grip"));
    var title = elx("h3", "sc-title", "Visto por " + (s.views_count || 0)); sheet.appendChild(title);
    var list = elx("ul", "sc-list"); sheet.appendChild(list);
    openSheet();
    list.innerHTML = '<div class="sc-empty">Cargando…</div>';
    try {
      var data = await api("/stories/" + s.id + "/viewers", { headers: authHeaders() });
      title.textContent = "Visto por " + (data.views || 0);
      var vs = data.viewers || [];
      list.innerHTML = "";
      if (!vs.length) { list.appendChild(elx("div", "sc-empty", "Todavía nadie vio esta historia.")); return; }
      vs.forEach(function (v) {
        var name = v.display_name || v.username;
        var row = elx("li", "sc-friend");
        var av = elx("span", "sc-av"); if (v.avatar_url) av.style.backgroundImage = "url('" + esc(v.avatar_url) + "')"; else av.textContent = initial(name);
        row.appendChild(av);
        row.appendChild(elx("span", "sc-fn", "<b>" + esc(name) + "</b><span>@" + esc(v.username) + "</span>"));
        if (v.reaction) row.appendChild(elx("span", "st-react", v.reaction === "love" ? "😍" : "❤️"));
        list.appendChild(row);
      });
    } catch (e) { list.innerHTML = '<div class="sc-empty">' + esc(e.message) + "</div>"; }
  }

  // cerrar el visor con Escape
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && viewer && viewer.classList.contains("open")) closeViewer(); });

  loadBar();
})();
