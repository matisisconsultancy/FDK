/* ============================================================
   FDK · Live market feed client  (window.VELive)

   Reads the one feed every page shares — written every 20 minutes
   by .github/workflows/live-market.yml — so no visitor's browser
   ever calls a market API (free quotas hold whatever the traffic).

     VELive.on(function (feed) { … })   // now (cached) + on every refresh
     VELive.get(id)                      // one series
     VELive.fmt(series) / VELive.chg(series) / VELive.spark(points, w, h)
     VELive.ago(iso)                     // "7 min ago"
   ============================================================ */
(function () {
  "use strict";
  if (window.VELive) return;
  /* tickers read the light twin (latest values); the dashboard sets VE_LIVE_FULL for the history */
  var BASE = "https://raw.githubusercontent.com/matisisconsultancy/FDK/live-data/";
  var FULL = !!window.VE_LIVE_FULL;
  var URL = BASE + (FULL ? "market.json" : "ticker.json");
  var POLL = FULL ? 60000 : 120000, CACHE = FULL ? "ve_live_full_v1" : "ve_live_v1";
  var feed = null, subs = [], byId = {}, timer = null;

  function lang() { return (window.FDK_i18n && window.FDK_i18n.lang && window.FDK_i18n.lang()) || "en"; }
  function loc() { return { en: "en-US", es: "es-ES", it: "it-IT" }[lang()] || "en-US"; }
  function index(f) { byId = {}; (f.series || []).forEach(function (s) { byId[s.id] = s; }); }
  function emit() { subs.forEach(function (cb) { try { cb(feed); } catch (e) { if (window.console) console.error(e); } }); }
  function accept(f, fromCache) {
    if (!f || !f.series || !f.series.length) return;
    if (feed && !fromCache && f.updated === feed.updated) return;   // nothing new
    feed = f; index(f); emit();
  }
  try { var c = JSON.parse(localStorage.getItem(CACHE) || "null"); if (c && c.series) accept(c, true); } catch (e) {}

  function load() {
    if (document.hidden) return;
    /* one URL per minute: fresh enough, and the CDN can still share it */
    fetch(URL + "?m=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (f) { try { localStorage.setItem(CACHE, JSON.stringify(f)); } catch (e) {} accept(f, false); })
      .catch(function () {});
  }
  function start() { if (timer) return; load(); timer = setInterval(load, POLL); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) load(); });

  function num(n, dp) { return Number(n).toLocaleString(loc(), { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
  function fmt(s) {
    if (!s || s.value == null) return "—";
    var v = num(s.value, s.dp);
    if (s.unit === "%") return v + "%";
    if (s.unit === "bp") return (s.value > 0 ? "+" : "") + v + " bp";
    if (s.unit && s.unit.charAt(0) === "$") return "$" + v + (s.unit.length > 1 ? s.unit.slice(1) : "");
    return v;
  }
  /* the change people expect: % for prices, basis points for yields */
  function chg(s) {
    if (!s) return { txt: "", dir: "flat" };
    var isRate = s.unit === "%" || s.unit === "bp";
    var v = isRate ? (s.changeBp != null ? s.changeBp : (s.change != null ? Math.round(s.change * 100) : null)) : s.changePct;
    if (v == null) return { txt: "", dir: "flat" };
    var dir = v > 0 ? "up" : v < 0 ? "down" : "flat";
    return { dir: dir, v: v, txt: (v > 0 ? "+" : v < 0 ? "−" : "") + (isRate ? Math.abs(v) + " bp" : num(Math.abs(v), 2) + "%") };
  }
  function ago(iso) {
    var t = Date.parse(iso); if (!t) return "";
    var m = Math.max(0, Math.round((Date.now() - t) / 60000)), L = lang();
    var W = { en: ["just now", "min ago", "h ago", "d ago"], es: ["ahora mismo", "min", "h", "d"], it: ["adesso", "min fa", "h fa", "g fa"] }[L] || ["just now", "min ago", "h ago", "d ago"];
    var pre = L === "es" ? "hace " : "";
    if (m < 1) return W[0];
    if (m < 60) return pre + m + " " + W[1];
    if (m < 2880) return pre + Math.round(m / 60) + " " + W[2];
    return pre + Math.round(m / 1440) + " " + W[3];
  }
  /* a tiny SVG line for a series of [date, value] points */
  function spark(pts, w, h, cls) {
    pts = (pts || []).filter(function (p) { return p && p[1] != null; });
    if (pts.length < 2) return "";
    var vs = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), rg = hi - lo || 1;
    var step = w / (pts.length - 1);
    var d = vs.map(function (v, i) { return (i ? "L" : "M") + (i * step).toFixed(1) + " " + (h - 2 - ((v - lo) / rg) * (h - 4)).toFixed(1); }).join("");
    var up = vs[vs.length - 1] >= vs[0];
    return '<svg class="vl-spark ' + (cls || "") + ' vl-spark--' + (up ? "up" : "down") + '" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + 'L' + w + " " + h + "L0 " + h + 'Z" class="vl-spark__area"/><path d="' + d + '" class="vl-spark__line"/></svg>';
  }

  window.VELive = {
    url: URL,
    on: function (cb) { subs.push(cb); if (feed) { try { cb(feed); } catch (e) {} } start(); },
    get: function (id) { return byId[id] || null; },
    feed: function () { return feed; },
    fmt: fmt, chg: chg, ago: ago, spark: spark, num: num, refresh: load,
  };
})();
