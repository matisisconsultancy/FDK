/* ============================================================
   The Velocity Edge · shared menu behaviour (note pages, archive)
   Mobile: full-screen accordion, every group closed on open.
   Desktop: hover/focus submenus are pure CSS (/ve-nav.css).
   ============================================================ */
(function () {
  "use strict";
  var b = document.getElementById("veBurger"), m = document.getElementById("mmenu"), nav = document.getElementById("nav");
  if (!b || !m) return;
  var gs = [].slice.call(m.querySelectorAll(".mm-g"));

  function openG(g, on) {
    g.classList.toggle("is-open", on);
    var t = g.querySelector(".mm-tog"), sb = g.querySelector(".mm-sub");
    if (t) t.setAttribute("aria-expanded", String(on));
    if (sb) { if (on) sb.removeAttribute("inert"); else sb.setAttribute("inert", ""); }
  }
  function set(open) {
    b.setAttribute("aria-expanded", String(open));
    b.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    m.hidden = !open;
    document.body.classList.toggle("menu-open", open);
    if (!open) gs.forEach(function (g) { openG(g, false); });
    if (nav && open) { nav.classList.remove("snav--hidden"); nav.classList.remove("nav--hidden"); }
  }
  b.addEventListener("click", function () { set(m.hidden); });
  m.addEventListener("click", function (e) {
    var t = e.target.closest(".mm-tog");
    if (t) {
      var g = t.closest(".mm-g"), on = !g.classList.contains("is-open");
      gs.forEach(function (x) { openG(x, x === g && on); });
      return;
    }
    if (e.target.closest("a")) set(false);
  });
  addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) { set(false); b.focus(); } });
  var mq = matchMedia("(min-width: 941px)");
  if (mq.addEventListener) mq.addEventListener("change", function (q) { if (q.matches) set(false); });

  /* language buttons in the mobile menu (the desktop switch is built by /i18n.js) */
  var lang = m.querySelector(".mmenu__lang");
  function sync() {
    if (!lang) return;
    var cur = window.FDK_LANG || "en";
    [].forEach.call(lang.querySelectorAll("button"), function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-lang") === cur)); });
  }
  if (lang) {
    if (!window.FDK_i18n) { lang.hidden = true; return; }
    lang.addEventListener("click", function (e) {
      var x = e.target.closest("button[data-lang]");
      if (!x) return;
      window.FDK_i18n.set(x.getAttribute("data-lang"));
      set(false);
    });
    document.addEventListener("fdk:langchange", sync);
    sync();
  }
})();
