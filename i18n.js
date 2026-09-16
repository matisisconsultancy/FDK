/* ============================================================
   FDK EmpowerNet · i18n engine (dependency-free, ES5)

   Base language: English — it lives in the HTML, so an English
   visitor loads nothing extra and sees the page as authored.
   es / it come from window.FDK_I18N, filled by /i18n/*.js.

   Translation happens on *units*, not on loose words: a unit is
   a block that only holds text and inline markup, so a whole
   sentence is translated at once and its <strong>/<span class=…>
   emphasis is carried over intact. Blocks that wrap something
   fragile (an image, a button, a counter, anything with an id)
   fall back to translating their text nodes in place, which never
   rebuilds the DOM.

   The key for a unit is a canonical serialisation of its inner
   markup (attributes sorted, whitespace collapsed). scripts/
   i18n-core.mjs produces byte-identical keys at build time, so
   the extractor and this file can never drift apart.
   ============================================================ */
(function () {
  "use strict";

  var LANGS = ["en", "es", "it"];
  var NAMES = { en: "EN", es: "ES", it: "IT" };
  var LABEL = { en: "English", es: "Español", it: "Italiano" };
  var DEFAULT = "en";
  var VERSION = "v=104";

  var current = (function () {
    var l = window.FDK_LANG;
    return LANGS.indexOf(l) >= 0 ? l : DEFAULT;
  })();

  function dict() {
    var d = window.FDK_I18N;
    return (d && d[current]) || null;
  }

  /* ---------- character helpers ---------- */
  var LETTERS = /[A-Za-zÀ-ÿ]/;
  function normWS(s) { return String(s).replace(/[\s\u00a0]+/g, " "); }
  function escText(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;"); }
  function key(s) { return normWS(s).replace(/^ | $/g, ""); }

  /* ---------- node classification (mirrors scripts/i18n-core.mjs) ---------- */
  var VOID = { area:1,base:1,br:1,col:1,embed:1,hr:1,img:1,input:1,link:1,
    meta:1,param:1,source:1,track:1,wbr:1 };
  var INLINE = { a:1,b:1,strong:1,i:1,em:1,span:1,br:1,small:1,sup:1,sub:1,
    mark:1,u:1,abbr:1,q:1,cite:1,time:1,wbr:1,s:1,del:1,ins:1,kbd:1,var:1,bdi:1,bdo:1 };
  var SKIP_TAG = { script:1,style:1,noscript:1,svg:1,code:1,pre:1,canvas:1,iframe:1,template:1 };
  var SKIP_CLASS = { brand:1,"brand__text":1,"brand__mark":1,"footer__brand":1,"footer__email":1,"cmedia__count":1,"lang-switch":1,
    marquee:1,mkt:1,"mb-card__px":1,"mb-card__sym":1,"mb-chg":1,"g-delta":1,"g-spark":1,
    "r-word":1,"r-word__in":1,"r-block__in":1,hl:1,"art-stat__num":1,"stat__num":1 };
  var SKIP_ID = { jClock:1, cBigNum:1, year:1, loaderCount:1 };
  /* Blocks that line up independent labels (a byline, a stat, an accordion
     head) rather than forming a sentence: their parts are translated one by
     one, so a new note's date, tag or figure needs no entry of its own. */
  var PARTS_CLASS = { "art-meta":1,"art-author":1,"art-stat":1,"signal__head":1,buystore:1,
    "jcard__top":1,"jpost__badge":1,"mb-card__top":1,"mb-meta":1,"g-tchip":1,"g-card__head":1 };
  /* Never rebuilt from a translation string — listeners, canvases,
     counters and media must survive untouched. */
  var OPAQUE_TAG = { img:1,picture:1,input:1,button:1,select:1,textarea:1,video:1,
    audio:1,object:1,form:1,label:1,script:1,style:1,noscript:1,svg:1,code:1,pre:1,
    canvas:1,iframe:1,template:1 };

  function tagOf(el) { return String(el.nodeName).toLowerCase(); }
  function hasText(el) { return LETTERS.test(el.textContent || ""); }

  function isSkipped(el) {
    var t = tagOf(el);
    if (SKIP_TAG[t]) return true;
    if (el.getAttribute && el.getAttribute("data-no-i18n") !== null) return true;
    if (el.getAttribute && el.getAttribute("aria-hidden") === "true" && !hasText(el)) return true;
    if (el.getAttribute && el.getAttribute("data-count") !== null) return true;   // animated figure
    if (el.id && SKIP_ID[el.id]) return true;
    var cls = (el.getAttribute && el.getAttribute("class")) || "";
    if (cls) {
      var parts = cls.split(/\s+/);
      for (var i = 0; i < parts.length; i++) if (SKIP_CLASS[parts[i]]) return true;
    }
    return false;
  }
  function isOpaque(el) {
    var t = tagOf(el);
    if (OPAQUE_TAG[t]) return true;
    if (el.id) return true;
    if (el.getAttribute("data-cursor") !== null) return true;
    var at = el.attributes;
    for (var i = 0; i < at.length; i++) if (at[i].name.slice(0, 2) === "on") return true;
    return false;
  }
  function hasOpaque(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType !== 1) continue;
      if (isOpaque(n) || hasOpaque(n)) return true;
    }
    return false;
  }

  /* ---------- canonical serialisation ---------- */
  function serializeChildren(el) {
    var out = "";
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) out += escText(normWS(n.nodeValue));
      else if (n.nodeType === 1) out += serializeEl(n);
    }
    return out;
  }
  function serializeEl(el) {
    var names = [], at = el.attributes, i;
    for (i = 0; i < at.length; i++) names.push(at[i].name.toLowerCase());
    names.sort();
    var a = "";
    for (i = 0; i < names.length; i++)
      a += " " + names[i] + '="' + escAttr(el.getAttribute(names[i]) || "") + '"';
    var t = tagOf(el);
    if (VOID[t]) return "<" + t + a + ">";
    return "<" + t + a + ">" + serializeChildren(el) + "</" + t + ">";
  }

  function isParts(el) {
    if (el.getAttribute("data-i18n-parts") !== null) return true;
    var cls = el.getAttribute("class") || "";
    if (!cls) return false;
    var parts = cls.split(/\s+/);
    for (var i = 0; i < parts.length; i++) if (PARTS_CLASS[parts[i]]) return true;
    return false;
  }

  function classify(el) {
    if (isParts(el)) return "recurse";
    var textWithLetters = 0, inlineWithText = 0, blockChild = 0;
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { if (LETTERS.test(n.nodeValue)) textWithLetters++; }
      else if (n.nodeType === 1) {
        if (isSkipped(n)) continue;
        var t = tagOf(n);
        if (!INLINE[t]) { if (hasText(n)) blockChild++; }
        else if (hasText(n)) inlineWithText++;
      }
    }
    if (blockChild > 0) return "recurse";
    if (inlineWithText === 0) return textWithLetters > 0 ? "text" : "recurse";
    if (hasOpaque(el)) return "text";
    return "unit";
  }

  /* ============================================================
     Lookup — dictionary first, then a small set of pattern rules
     so dates, reading times and "Slot · Section" labels coming
     from posts.js keep working when a new note is published
     before its copy has been translated.
     ============================================================ */
  var MONTHS = ["January","February","March","April","May","June","July",
    "August","September","October","November","December"];
  var MONTH_OUT = {
    es: ["enero","febrero","marzo","abril","mayo","junio","julio","agosto",
         "septiembre","octubre","noviembre","diciembre"],
    it: ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto",
         "settembre","ottobre","novembre","dicembre"]
  };
  var READ = { es: "min de lectura", it: "min di lettura" };

  function lookupRaw(k) {
    var d = dict();
    if (!d) return null;
    var v = d[k];
    return (v === undefined || v === null) ? null : v;
  }

  /* Prefixes that introduce a machine-written date, so "as of 2026-09-14"
     reads correctly without every date having its own entry. */
  var PREFIX = ["Data as of", "Week ending", "week ending", "As of", "as of",
    "Updated", "updated", "As at", "as at", "Published"];

  function dateRule(k) {
    var m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(k);     // July 30, 2026
    if (m) {
      var i = MONTHS.indexOf(m[1]);
      if (i >= 0) return current === "es"
        ? m[2] + " de " + MONTH_OUT[current][i] + " de " + m[3]
        : m[2] + " " + MONTH_OUT[current][i] + " " + m[3];
    }
    m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(k);           // 26 July 2026
    if (m) {
      var j = MONTHS.indexOf(m[2]);
      if (j >= 0) return current === "es"
        ? m[1] + " de " + MONTH_OUT[current][j] + " de " + m[3]
        : m[1] + " " + MONTH_OUT[current][j] + " " + m[3];
    }
    return null;
  }

  /* One indivisible label: the dictionary, then the handful of shapes the
     publishing pipeline produces on its own. Returns null when nothing fits. */
  function atom(k) {
    var v = lookupRaw(k);
    if (v !== null) return v;
    v = dateRule(k);
    if (v !== null) return v;
    var m = /^(\d+) min read$/.exec(k);
    if (m) return m[1] + " " + READ[current];
    for (var i = 0; i < PREFIX.length; i++) {
      var p = PREFIX[i];
      if (k.length > p.length + 1 && k.slice(0, p.length) === p && k.charAt(p.length) === " ") {
        var lead = lookupRaw(p);
        if (lead === null) continue;
        var rest = k.slice(p.length + 1);
        var dr = dateRule(rest);
        return lead + " " + (dr === null ? rest : dr);
      }
    }
    if (!LETTERS.test(k)) return k;          // pure figures / punctuation
    return null;
  }

  /* Only used inside an already-structural "·" label, where a dash joins a
     title to its subtitle. Never applied to running prose, where a half
     translated sentence would read worse than a clean English one. */
  function dashPair(k) {
    var i = k.indexOf(" \u2014 ");
    if (i < 0) return null;
    var a = atom(key(k.slice(0, i))), b = atom(key(k.slice(i + 3)));
    if (a === null && b === null) return null;
    return (a === null ? k.slice(0, i) : a) + " \u2014 " + (b === null ? k.slice(i + 3) : b);
  }

  function rules(k) {
    /* A quotation the page wraps in typographic marks (the dashboard's
       standfirst) — translate what is inside and put the marks back. */
    var q = /^\u201c([\s\S]+)\u201d$/.exec(k);
    if (q) {
      var qi = translate(key(q[1]));
      if (qi !== null) return "\u201c" + qi + "\u201d";
    }
    /* "Read more →" — translate the label, keep the glyph. */
    var m = /^([\s\S]+?)\s*([\u2190-\u2193\u00bb\u203a])$/.exec(k);
    if (m) {
      var inner = translate(key(m[1]));
      if (inner !== null) return inner + " " + m[2];
    }
    /* "Morning View · Markets", "Source: … · Data as of … · illustrative".
       The middle dot is a structural separator across this site, so each
       segment is translated on its own and anything unknown (a company, a
       provider name) is passed through untouched. */
    if (k.indexOf("\u00b7") >= 0) {
      var parts = k.split("\u00b7"), out = [], any = false;
      for (var i = 0; i < parts.length; i++) {
        var p = key(parts[i]);
        if (p === "") { out.push(""); continue; }
        var tv = atom(p);
        if (tv === null) tv = dashPair(p);        // "Title — subtitle"
        if (tv === null) out.push(p);
        else { if (tv !== p) any = true; out.push(tv); }
      }
      if (any) {
        var lead = out[0] === "" ? "\u00b7 " : "";
        var trail = out[out.length - 1] === "" ? " \u00b7" : "";
        var mid = [];
        for (var j = 0; j < out.length; j++) if (out[j] !== "") mid.push(out[j]);
        return lead + mid.join(" \u00b7 ") + trail;
      }
      return null;
    }
    return atom(k);
  }

  function translate(k) {
    if (current === DEFAULT || !k) return null;
    var v = lookupRaw(k);
    if (v !== null) return v;
    return rules(k);
  }

  /* ============================================================
     Applying a translation
     ============================================================ */
  var origText = window.WeakMap ? new WeakMap() : null;
  var textStore = [];   // WeakMap-less fallback (very old browsers)
  function getOrig(node) {
    if (origText) return origText.has(node) ? origText.get(node) : null;
    for (var i = 0; i < textStore.length; i++) if (textStore[i][0] === node) return textStore[i][1];
    return null;
  }
  function setOrig(node, v) {
    if (origText) origText.set(node, v);
    else textStore.push([node, v]);
  }

  function txText(node) {
    var raw = getOrig(node);
    if (raw === null) { raw = node.nodeValue; setOrig(node, raw); }
    var m = /^([\s\u00a0]*)([\s\S]*?)([\s\u00a0]*)$/.exec(raw);
    var lead = m[1], core = m[2], trail = m[3];
    var next = raw;
    if (current !== DEFAULT) {
      var v = translate(key(core));
      if (v !== null) next = lead + v + trail;
    }
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  /* Returns true when the whole block was translated in one piece. When it
     returns false the caller falls back to translating the block's parts —
     which is what makes blocks assembled at runtime (a journal card's
     "Midday Pulse · Markets" next to its date) work without every possible
     combination having to exist in the dictionary. */
  function txUnit(el) {
    var src = el.__i18nSrc;
    if (src === undefined) {
      src = key(serializeChildren(el));
      el.__i18nSrc = src;
      el.__i18nHTML = el.innerHTML;
      el.__i18nUnit = true;
    }
    if (current !== DEFAULT) {
      var v = translate(src);
      if (v !== null) {
        if (el.innerHTML !== v) el.innerHTML = v;
        return true;
      }
    }
    if (el.innerHTML !== el.__i18nHTML) el.innerHTML = el.__i18nHTML;
    return current === DEFAULT;
  }

  /* ---------- attributes ---------- */
  var ATTRS = ["placeholder", "aria-label", "title", "alt"];
  function txAttr(el, attr) {
    if (!el.hasAttribute(attr)) return;
    var mark = "__i18n_" + attr;
    if (el[mark] === undefined) el[mark] = el.getAttribute(attr) || "";
    var en = el[mark];
    if (!LETTERS.test(en)) return;
    var out = en;
    if (current !== DEFAULT) {
      var v = translate(key(en));
      if (v !== null) out = v;
    }
    if (el.getAttribute(attr) !== out) el.setAttribute(attr, out);
  }
  function txAttrs(el) {
    if (!el.hasAttribute) return;
    var cls = el.getAttribute("class") || "";
    var brandish = cls.indexOf("brand") >= 0 || cls.indexOf("lang-switch") >= 0;
    for (var i = 0; i < ATTRS.length; i++) {
      if (brandish && ATTRS[i] === "aria-label") continue;
      txAttr(el, ATTRS[i]);
    }
  }

  /* ---------- the walk ---------- */
  function walk(el) {
    if (!el || el.nodeType !== 1) return;
    if (isSkipped(el)) return;
    txAttrs(el);
    var mode = el.__i18nUnit ? "unit" : classify(el);
    if (mode === "unit" && txUnit(el)) return;
    var next;
    for (var n = el.firstChild; n; n = next) {
      next = n.nextSibling;
      if (n.nodeType === 3) { if (LETTERS.test(n.nodeValue)) txText(n); }
      else if (n.nodeType === 1) walk(n);
    }
  }

  function walkAdded(node) {
    if (node.nodeType === 3) { if (LETTERS.test(node.nodeValue)) txText(node); return; }
    if (node.nodeType === 1) walk(node);
  }

  /* ---------- <head> ---------- */
  var META = ['meta[name="description"]', 'meta[property="og:title"]',
    'meta[property="og:description"]', 'meta[name="twitter:title"]',
    'meta[name="twitter:description"]'];
  function applyHead() {
    if (document.__i18nTitle === undefined) document.__i18nTitle = document.title;
    var t = document.__i18nTitle;
    if (current !== DEFAULT) {
      var v = translate(key(t));
      if (v !== null) t = v;
    }
    if (document.title !== t) document.title = t;
    for (var i = 0; i < META.length; i++) {
      var el = document.querySelector(META[i]);
      if (el) txAttr(el, "content");
    }
    document.documentElement.setAttribute("lang", current);
  }

  /* ============================================================
     Numbers — market prices and counters read correctly in each
     locale (1.234,5 in es/it vs 1,234.5 in en).
     ============================================================ */
  var NUM_LOCALE = { en: "en-US", es: "es-ES", it: "it-IT" };
  function num(n, opts) {
    try { return Number(n).toLocaleString(NUM_LOCALE[current] || "en-US", opts || {}); }
    catch (e) { return String(n); }
  }

  /* ============================================================
     Switcher
     ============================================================ */
  var switcher = null;
  function buildSwitcher() {
    var nav = document.getElementById("navLinks");
    if (!nav || document.getElementById("langSwitch")) return;
    var wrap = document.createElement("div");
    wrap.className = "lang-switch";
    wrap.id = "langSwitch";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "Language / Idioma / Lingua");
    wrap.setAttribute("data-no-i18n", "");
    for (var i = 0; i < LANGS.length; i++) {
      (function (l) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lang-switch__btn";
        b.setAttribute("data-lang", l);
        b.setAttribute("lang", l);
        b.title = LABEL[l];
        b.textContent = NAMES[l];
        b.addEventListener("click", function () { setLang(l); });
        wrap.appendChild(b);
      })(LANGS[i]);
    }
    nav.appendChild(wrap);
    switcher = wrap;
    syncSwitcher();
  }
  function syncSwitcher() {
    if (!switcher) return;
    var bs = switcher.querySelectorAll(".lang-switch__btn");
    for (var i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute("data-lang") === current;
      bs[i].className = "lang-switch__btn" + (on ? " is-active" : "");
      bs[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* ---------- dictionary loading for a language picked at runtime ---------- */
  var loaded = {}, pending = {};
  loaded[DEFAULT] = true;
  if (window.FDK_I18N && window.FDK_I18N[current]) loaded[current] = true;

  function ensure(lang, cb) {
    if (lang === DEFAULT || loaded[lang]) { cb(); return; }
    if (pending[lang]) { pending[lang].push(cb); return; }
    pending[lang] = [cb];
    var files = ["/i18n/common." + lang + ".js",
                 "/i18n/" + (window.FDK_PAGE || "home") + "." + lang + ".js"];
    var left = files.length;
    function done() {
      if (--left > 0) return;
      loaded[lang] = true;
      var q = pending[lang]; pending[lang] = null;
      for (var i = 0; i < q.length; i++) q[i]();
    }
    for (var i = 0; i < files.length; i++) {
      var s = document.createElement("script");
      s.src = files[i] + "?" + VERSION;
      s.onload = done;
      s.onerror = done;          // a page with no copy of its own is fine
      document.head.appendChild(s);
    }
  }

  /* ============================================================
     Public API
     ============================================================ */
  function applyAll() {
    if (mo) mo.disconnect();
    walk(document.body);
    applyHead();
    if (mo) mo.observe(document.body, { childList: true, subtree: true });
  }

  function setLang(lang) {
    if (LANGS.indexOf(lang) < 0) lang = DEFAULT;
    if (lang === current && loaded[lang]) { syncSwitcher(); return; }
    current = lang;
    window.FDK_LANG = lang;
    try { localStorage.setItem("fdk_lang", lang); } catch (e) {}
    /* On a phone the menu is open when the flag is tapped — close it so the
       visitor sees the page change language instead of the nav. */
    var nav = document.getElementById("navLinks"), tg = document.getElementById("navToggle");
    if (nav && nav.className.indexOf("open") >= 0) {
      nav.className = nav.className.replace(/\bopen\b/g, "").replace(/\s+/g, " ");
      if (tg) { tg.className = tg.className.replace(/\bopen\b/g, "").replace(/\s+/g, " ");
                tg.setAttribute("aria-expanded", "false"); }
    }
    ensure(lang, function () {
      applyAll();
      syncSwitcher();
      /* Give the rest of the site a chance to re-render locale-formatted
         values (market prices, clocks) without a page reload. */
      try {
        document.dispatchEvent(new CustomEvent("fdk:langchange", { detail: { lang: lang } }));
      } catch (e) {
        var ev = document.createEvent("Event");
        ev.initEvent("fdk:langchange", true, true);
        document.dispatchEvent(ev);
      }
    });
  }

  /* ---------- observe content rendered by the other scripts ---------- */
  var mo = null;
  function makeObserver() {
    if (!window.MutationObserver) return;
    mo = new MutationObserver(function (muts) {
      var added = [];
      for (var i = 0; i < muts.length; i++)
        for (var j = 0; j < muts[i].addedNodes.length; j++)
          added.push(muts[i].addedNodes[j]);
      if (!added.length) return;
      mo.disconnect();
      for (var k = 0; k < added.length; k++) walkAdded(added[k]);
      mo.observe(document.body, { childList: true, subtree: true });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  window.FDK_i18n = {
    lang: function () { return current; },
    set: setLang,
    t: function (s) { var v = translate(key(s)); return v === null ? s : v; },
    num: num,
    refresh: function () { applyAll(); syncSwitcher(); },
    langs: LANGS
  };
  /* Short alias used inside script.js / market.js / gvi.js. */
  window.FDK_t = window.FDK_i18n.t;

  /* ---------- boot ---------- */
  buildSwitcher();
  if (current !== DEFAULT) { walk(document.body); applyHead(); }
  makeObserver();
  syncSwitcher();
})();
