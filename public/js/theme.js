/* theme.js — Modo claro/oscuro. Aplica data-theme en <html>,
   recuerda la preferencia y ofrece window.toggleTheme(). No toca la app. */
(function () {
  "use strict";
  var KEY = "nf_theme";

  function system() {
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  function pref() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply() {
    var p = pref();
    var mode = (p === "dark" || p === "light") ? p : system();
    document.documentElement.setAttribute("data-theme", mode);
  }

  window.setTheme = function (m) {
    try { if (m === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch (e) {}
    apply();
  };
  window.toggleTheme = function () {
    var cur = document.documentElement.getAttribute("data-theme");
    window.setTheme(cur === "dark" ? "light" : "dark");
  };

  // Cambios del sistema solo afectan si el usuario no fijó preferencia.
  if (window.matchMedia) {
    try {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
        var p = pref(); if (p !== "dark" && p !== "light") apply();
      });
    } catch (e) { /* Safari viejo */ }
  }

  // Interruptor de la barra superior (si existe).
  function wire() {
    var btn = document.getElementById("themeToggle");
    if (btn && !btn.dataset.wired) { btn.dataset.wired = "1"; btn.addEventListener("click", window.toggleTheme); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();

  apply();
})();
