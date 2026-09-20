/* ============================================================
   FDK EmpowerNet · i18n boot (runs in <head>, ~1 KB)
   Decides the language before a single pixel is painted and —
   only for non-English visitors — pulls in that language's two
   dictionaries synchronously, so the page is never shown in
   English first and then swapped.
     · /i18n/common.<lang>.js  → nav, footer, cards, shared copy
     · /i18n/<slug>.<lang>.js  → the copy unique to this page
   English visitors download neither.
   ============================================================ */
(function () {
  "use strict";
  var LANGS = { en: 1, es: 1, it: 1 };
  var V = "v=d2055a5d52";

  function fromQuery() {
    var m = /[?&]lang=([a-zA-Z-]+)/.exec(location.search);
    return m ? String(m[1]).toLowerCase().slice(0, 2) : null;
  }
  function stored() {
    try { return localStorage.getItem("fdk_lang"); } catch (e) { return null; }
  }
  function fromBrowser() {
    var list = navigator.languages && navigator.languages.length
      ? navigator.languages : [navigator.language || navigator.userLanguage || "en"];
    for (var i = 0; i < list.length; i++) {
      var two = String(list[i] || "").toLowerCase().slice(0, 2);
      if (LANGS[two]) return two;
    }
    return null;
  }

  /* Explicit ?lang= wins, then a previous choice, then the browser. */
  var q = fromQuery();
  if (q && LANGS[q]) { try { localStorage.setItem("fdk_lang", q); } catch (e) {} }
  var s = stored();
  var lang = (q && LANGS[q] && q) || (s && LANGS[s] && s) || fromBrowser() || "en";

  window.FDK_LANG = lang;
  /* The cache key travels with the page so i18n.js reuses this exact one when
     a visitor switches language. Set before the English early-return: an
     English visitor who picks Español needs it too. */
  window.FDK_IV = V;
  try { document.documentElement.setAttribute("lang", lang); } catch (e) {}

  /* Page slug → the per-page dictionary file. "/" → home. */
  var path = location.pathname.replace(/\/index\.html?$/i, "/");
  var slug = path.replace(/^\/+|\/+$/g, "").replace(/\//g, "-").toLowerCase();
  window.FDK_PAGE = slug || "home";

  if (lang === "en") return;

  var files = ["/i18n/common." + lang + ".js", "/i18n/" + window.FDK_PAGE + "." + lang + ".js"];
  if (document.readyState === "loading" && document.write) {
    for (var i = 0; i < files.length; i++)
      document.write('<script src="' + files[i] + "?" + V + '"><\/script>');
  } else {
    /* Defensive path (script moved or injected late): load async and let
       the engine re-apply when the dictionaries land. */
    for (var j = 0; j < files.length; j++) {
      var el = document.createElement("script");
      el.src = files[j] + "?" + V;
      el.onload = function () { if (window.FDK_i18n) window.FDK_i18n.refresh(); };
      document.head.appendChild(el);
    }
  }
})();
