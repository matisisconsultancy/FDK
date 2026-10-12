/* ============================================================
   The Velocity Edge · shared menu behaviour (note pages, archive)
   Mobile: full-screen accordion, every group closed on open.
   Desktop: hover/focus submenus are pure CSS (/ve-nav.css).
   ============================================================ */
(function () {
  "use strict";
  relatedCards();
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

/* ============================================================
   Note pages · "More from The Velocity Edge": the latest notes as
   the same edition cards as /velocityedge/ (replaces the plain
   cards that /script.js puts in #artMoreGrid)
   ============================================================ */
function relatedCards() {
  var grid = document.getElementById("artMoreGrid");
  if (!grid || !window.FDK_POSTS) return;
  var here = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "");
  var list = window.FDK_POSTS.filter(function (p) {
    var t = (p.title || "").trim();
    return p.url && p.url.replace(/\/$/, "") !== here && t.length > 10 && !/^in-?focus$/i.test(t) && (p.slot || "").toLowerCase().indexOf("add this just") < 0;
  }).slice(0, 3);
  if (!list.length) return;
  function fkey(p) {
    var sl = (p.slot || "").toLowerCase().trim();
    if (/^(the week ahead|week ahead|sunday edition|monday brief)$/.test(sl)) return "week";
    if (/^(in focus|in depth)$/.test(sl)) return "focus";
    if (sl === "midday pulse") return "midday";
    if (/^(the close|night briefing|evening note|closing of the day)$/.test(sl) || p.kind === "night") return "closing";
    if (/^(morning brief|morning view|morning note|today.s edition|daily nowcast|provisional nowcast)$/.test(sl)) return "morning";
    var h = parseInt((p.time || "08:00").split(":")[0], 10);
    return h < 12 ? "morning" : h < 17 ? "midday" : "closing";
  }
  var NAME = { morning: "Morning Brief", midday: "Midday Pulse", closing: "The Close", week: "The Week Ahead", focus: "In Focus" };
  var COV = [["collision", /collision|shock|clash|divergen|bifurcat/], ["reversal", /reversal|rotation|reorder|repricing/], ["moonshot", /moonshot|age of|frontier/], ["orbits", /supercycle|cycle|loop|compound/], ["orbs", /two |dual|both /], ["chip", /chip|nvidia|compute|semiconductor|gpu|cuda|data cent|economics test|stack|model/], ["columns", /bank|mps|caltagirone|risiko|monte dei paschi|lender/], ["globe", /china|u\.s\.|geopolit|sovereign|alliance|security order|global/], ["city", /europe|european|eurozone|ital|architecture/], ["terrain", /credit|bond|yield|treasur|rate|spread|hurdle|cost of capital|denominator|debt/], ["reversal", /capital|flow|velocity|split/]];
  var ALL = ["reversal", "chip", "collision", "globe", "columns", "terrain", "orbs", "city", "orbits", "moonshot"], used = {};
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function cover(p) {
    var t = ((p.title || "") + " " + (p.tag || "") + " " + (p.excerpt || "")).toLowerCase(), c = null, i;
    for (i = 0; i < COV.length && !c; i++) if (COV[i][1].test(t) && !used[COV[i][0]]) c = COV[i][0];
    if (!c) { var k = hash(p.url || ""); for (i = 0; i < ALL.length && !c; i++) { var n = ALL[(k + i) % ALL.length]; if (!used[n]) c = n; } }
    used[c] = 1; return "/assets/notes/" + c + ".webp";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  grid.className = "vcards";
  grid.innerHTML = list.map(function (p) {
    var k = fkey(p), t = String(p.tag || "").split(" · "), tp = t.length > 1 ? t[t.length - 1] : "";
    return '<a class="vcard vcard--' + k + '" href="' + esc(p.url) + '"><div class="vcard__media"><img src="' + cover(p) + '" alt="" width="1280" height="720" loading="lazy" decoding="async">' +
      '<span class="vcard__badge"><i class="vcard__ph vcard__ph--' + k + '" aria-hidden="true"></i>' + esc(p.time || "") + (p.time ? " · " : "") + esc((p.slot || "").replace("U.s.", "U.S.")) + '</span></div>' +
      '<div class="vcard__body"><span class="vcard__cat">' + NAME[k] + (tp ? " · " + esc(tp) : "") + '</span><h3>' + esc(p.title) + '</h3><p>' + esc(p.excerpt) + '</p>' +
      '<div class="vcard__foot"><span>' + esc(p.date) + (p.read ? " · " + esc(p.read) : "") + '</span><span class="vcard__go">Read →</span></div></div></a>';
  }).join("");
  if (!document.getElementById("vcardsAll")) grid.insertAdjacentHTML("afterend", '<div class="vcards-all" id="vcardsAll"><a href="/intelligence-library/">All notes <span aria-hidden="true">↗</span></a></div>');
}
