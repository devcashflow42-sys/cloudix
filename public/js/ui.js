/* ui.js — Efecto ripple (Material Design) por delegación de eventos. */
(function () {
  "use strict";
  var SEL = ".sc-primary,.gc-abtn,.sc-follow,.pc-filter,.pc-tool,.sc-tbtn,.sc-iconpick";
  document.addEventListener("pointerdown", function (e) {
    var btn = e.target.closest && e.target.closest(SEL);
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var ink = document.createElement("span");
    ink.className = "ripple-ink";
    ink.style.width = ink.style.height = size + "px";
    ink.style.left = (e.clientX - rect.left - size / 2) + "px";
    ink.style.top = (e.clientY - rect.top - size / 2) + "px";
    btn.appendChild(ink);
    setTimeout(function () { ink.remove(); }, 560);
  }, { passive: true });
})();
