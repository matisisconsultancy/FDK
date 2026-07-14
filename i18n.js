/* ============================================================
   FDK EmpowerNet · i18n engine (dependency-free)
   Translates individual text nodes + a few attributes, so inline
   markup (highlights, links) is preserved and keys match exactly
   between the build-time extractor and this runtime.
   Base language: English. es / it come from window.FDK_I18N.
   ============================================================ */
(function () {
  "use strict";

  var LANGS = ["en", "es", "it"];
  var NAMES = { en: "EN", es: "ES", it: "IT" };
  var DEFAULT = "en";
  var DICT = window.FDK_I18N || { es: {}, it: {} };

  // The translation dictionary (~420 KB) is only fetched when a non-English
  // language is active, so English visitors never download it.
  var dataLoading = false, dataQueue = [];
  function ensureData(cb) {
    if (window.FDK_I18N) { DICT = window.FDK_I18N; cb(); return; }
    dataQueue.push(cb);
    if (dataLoading) return;
    dataLoading = true;
    var s = document.createElement("script");
    s.src = "/i18n-data.js?v=98";
    s.onload = function () { DICT = window.FDK_I18N || DICT; var q = dataQueue; dataQueue = []; q.forEach(function (f) { f(); }); };
    s.onerror = function () { dataQueue = []; };
    document.head.appendChild(s);
  }

  /* ---- language selection ---------------------------------- */
  function stored() { try { return localStorage.getItem("fdk_lang"); } catch (e) { return null; } }
  function detect() {
    var s = stored();
    if (s && LANGS.indexOf(s) >= 0) return s;
    var langs = navigator.languages || [navigator.language || "en"];
    for (var i = 0; i < langs.length; i++) {
      var two = String(langs[i]).toLowerCase().slice(0, 2);
      if (LANGS.indexOf(two) >= 0) return two;
    }
    return DEFAULT;
  }
  var current = detect();

  function norm(s) { return s.replace(/\s+/g, " ").trim(); }

  // Ancestors whose text must never be translated.
  var SKIP = ".brand,.footer__email,.jclock,.cmedia__count,.lang-switch,.marquee,#jClock,[data-no-i18n],code,pre,script,style,noscript,svg";
  function skipped(node) {
    var el = node.parentElement;
    return !!(el && el.closest(SKIP));
  }

  var orig = new WeakMap();   // textNode -> original English string
  var mo = null;

  function tx(lang, node) {
    var raw = orig.has(node) ? orig.get(node) : node.nodeValue;
    if (!orig.has(node)) orig.set(node, raw);
    var m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    var lead = m[1], core = m[2], trail = m[3];
    var key = norm(core);
    var next;
    if (lang === "en") next = raw;
    else {
      var d = DICT[lang];
      var v = d ? d[key] : null;
      next = (v != null) ? (lead + v + trail) : raw;   // fallback: English
    }
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function textNodes(root) {
    var out = [];
    if (!root || !root.ownerDocument && root.nodeType !== 9 && root.nodeType !== 1) return out;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !/[A-Za-zÀ-ÿ]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        if (skipped(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n; while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  /* ---- attributes ------------------------------------------ */
  function attrNodes(root) {
    var r = (root && root.querySelectorAll) ? root : document;
    var list = [];
    var ph = r.querySelectorAll("input[placeholder],textarea[placeholder]");
    for (var i = 0; i < ph.length; i++) list.push([ph[i], "placeholder"]);
    var al = r.querySelectorAll("[aria-label]");
    for (var j = 0; j < al.length; j++) if (!al[j].closest(".brand,.lang-switch")) list.push([al[j], "aria-label"]);
    return list;
  }
  function txAttr(lang, el, attr) {
    var mark = "__i18n_" + attr;
    if (el[mark] === undefined) el[mark] = el.getAttribute(attr) || "";
    var en = el[mark];
    var key = norm(en);
    var out = en;
    if (lang !== "en") { var d = DICT[lang]; var v = d ? d[key] : null; if (v != null) out = v; }
    if (el.getAttribute(attr) !== out) el.setAttribute(attr, out);
  }

  function apply(root, lang) {
    if (mo) mo.disconnect();
    var tn = textNodes(root || document.body);
    for (var i = 0; i < tn.length; i++) tx(lang, tn[i]);
    var an = attrNodes(root || document);
    for (var j = 0; j < an.length; j++) txAttr(lang, an[j][0], an[j][1]);
    if (mo) mo.observe(document.body, { childList: true, subtree: true });
  }

  function applyHead(lang) {
    if (document.title) {
      if (document.__i18nTitle === undefined) document.__i18nTitle = document.title;
      var d = DICT[lang];
      var v = (lang !== "en" && d) ? d[norm(document.__i18nTitle)] : null;
      document.title = (v != null) ? v : document.__i18nTitle;
    }
    var md = document.querySelector('meta[name="description"]');
    if (md) txAttr(lang, md, "content");
    document.documentElement.setAttribute("lang", lang);
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) < 0) lang = DEFAULT;
    current = lang;
    try { localStorage.setItem("fdk_lang", lang); } catch (e) {}
    if (lang === "en") { apply(document.body, lang); applyHead(lang); syncSwitcher(); }
    else ensureData(function () { apply(document.body, lang); applyHead(lang); syncSwitcher(); });
  }

  /* ---- switcher UI ----------------------------------------- */
  var switcher = null;
  function buildSwitcher() {
    var nav = document.getElementById("navLinks");
    if (!nav || document.getElementById("langSwitch")) return;
    var wrap = document.createElement("div");
    wrap.className = "lang-switch"; wrap.id = "langSwitch";
    wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", "Language");
    LANGS.forEach(function (l) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "lang-switch__btn";
      b.setAttribute("data-lang", l); b.textContent = NAMES[l];
      b.addEventListener("click", function () { setLang(l); });
      wrap.appendChild(b);
    });
    nav.appendChild(wrap);
    switcher = wrap; syncSwitcher();
  }
  function syncSwitcher() {
    if (!switcher) return;
    var bs = switcher.querySelectorAll(".lang-switch__btn");
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute("data-lang") === current;
      bs[i].classList.toggle("is-active", on);
      bs[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* ---- observe dynamic content ----------------------------- */
  function makeObserver() {
    if (!window.MutationObserver) return;
    mo = new MutationObserver(function (muts) {
      var roots = [];
      for (var i = 0; i < muts.length; i++)
        for (var j = 0; j < muts[i].addedNodes.length; j++) {
          var n = muts[i].addedNodes[j];
          if (n.nodeType === 1) roots.push(n);
        }
      if (!roots.length) return;
      mo.disconnect();
      for (var k = 0; k < roots.length; k++) {
        var tn = textNodes(roots[k]);
        for (var t = 0; t < tn.length; t++) tx(current, tn[t]);
      }
      mo.observe(document.body, { childList: true, subtree: true });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---- boot ------------------------------------------------ */
  function boot() {
    buildSwitcher();
    makeObserver();
    document.documentElement.setAttribute("lang", current);
    if (current !== "en") ensureData(function () { apply(document.body, current); applyHead(current); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  window.addEventListener("load", function () {
    if (current !== "en") ensureData(function () { apply(document.body, current); });
    syncSwitcher();
  });

  window.FDK_setLang = setLang;
})();
