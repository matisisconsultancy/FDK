/* ============================================================
   FDK EmpowerNet · Live market ticker (pill marquee)
   - Elegant "pill" chips per indicator.
   - Smooth, continuous transform-based marquee motion (like the
     original brand marquee), AND finger-draggable / swipeable.
   - Live data from the shared FDK feed (live-data/market.json,
     refreshed every 20 minutes by GitHub Actions). If it cannot be
     reached it shows clearly-marked sample values.
   ============================================================ */
(function () {
  "use strict";

  var CFG = {
    /* One shared feed for every page, refreshed every 20 minutes by
       .github/workflows/live-market.yml — no market API is called from the
       browser, so the free quotas hold whatever the traffic. */
    feed: "https://raw.githubusercontent.com/matisisconsultancy/FDK/live-data/ticker.json",
    refreshMs: 120000,
    cacheMs: 600000,
    speed: 0.045,   // px per ms (~45px/s) — matches the brand marquee feel
    items: [
      { s: "spx",    l: "S&P 500",     dp: 0, d: 5460,   c: 0.31 },
      { s: "ixic",   l: "Nasdaq",      dp: 0, d: 19180,  c: 0.44 },
      { s: "sx5e",   l: "Euro Stoxx 50", dp: 0, d: 5100, c: 0.20 },
      { s: "us10y",  l: "US 10Y",      dp: 2, d: 4.25,   c: 0.02, rate: true },
      { s: "brent",  l: "Brent",       dp: 2, d: 82.15,  c: 0.64 },
      { s: "wti",    l: "Oil · WTI",   dp: 2, d: 78.42,  c: 0.82 },
      { s: "eurusd", l: "EUR/USD",     dp: 4, d: 1.0842, c: -0.18 },
      { s: "gold",   l: "Gold",        dp: 2, d: 2338.40, c: 0.42 },
      { s: "btc",    l: "Bitcoin",     dp: 0, d: 67240,  c: 1.90 },
      { s: "nvda",   l: "Nvidia",      dp: 2, d: 126.36, c: 1.12 }
    ]
  };

  var lastMap = null, lastLive = false;
  var containers = Array.prototype.slice.call(document.querySelectorAll(".mkt"));
  if (!containers.length) return;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function t(s) { return (window.FDK_t ? window.FDK_t(s) : s) || s; }
  function fmt(n, dp) {
    var loc = window.FDK_i18n ? { en: "en-US", es: "es-ES", it: "it-IT" }[window.FDK_i18n.lang()] : "en-US";
    return Number(n).toLocaleString(loc || "en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function pillHTML(it, price, chg) {
    var dir = chg > 0 ? "up" : (chg < 0 ? "down" : "flat");
    var arrow = chg > 0 ? "▲" : (chg < 0 ? "▼" : "•");
    var sign = chg > 0 ? "+" : "";
    var ch = chg == null ? "" : (it.rate ? sign + Math.round(chg) + " bp" : sign + Number(chg).toFixed(2) + "%");
    return '<span class="mpill">' +
      '<span class="mpill__l">' + it.l + '</span>' +
      '<span class="mpill__px">' + fmt(price, it.dp) + (it.rate ? "%" : "") + '</span>' +
      (ch ? '<span class="mpill__ch mpill__ch--' + dir + '">' + arrow + ' ' + ch + '</span>' : "") +
      '</span>';
  }
  function render(map, live) {
    lastMap = map; lastLive = live;
    var pills = [];
    if (!live) pills.push('<span class="mpill mpill--tag">' + t("Sample") + "</span>");
    CFG.items.forEach(function (it) {
      var q = map && map[it.s];
      if (live && !q) return;
      pills.push(pillHTML(it, q ? q.price : it.d, q ? q.chg : it.c));
    });
    var html = pills.join("");
    containers.forEach(function (c) {
      var track = c.querySelector(".mkt__track");
      if (track) { track.innerHTML = html + html; if (c.__measure) c.__measure(); }
    });
  }

  function getCache() {
    try { var j = JSON.parse(localStorage.getItem("fdk_mkt2") || "null"); if (j && Date.now() - j.t < CFG.cacheMs) return j.m; } catch (e) {}
    return null;
  }
  function setCache(m) { try { localStorage.setItem("fdk_mkt2", JSON.stringify({ t: Date.now(), m: m })); } catch (e) {} }

  function parse(feed) {
    var map = {}, by = {};
    (feed && feed.series || []).forEach(function (x) { by[x.id] = x; });
    CFG.items.forEach(function (it) {
      var x = by[it.s];
      if (!x || x.value == null) return;
      var chg = it.rate ? (x.changeBp != null ? x.changeBp : null) : x.changePct;
      map[it.s] = { price: x.value, chg: chg };
    });
    return map;
  }
  function fetchLive() {
    var cached = getCache();
    if (cached) render(cached, true);
    fetch(CFG.feed + "?m=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var map = parse(d);
        if (Object.keys(map).length) { setCache(map); render(map, true); }
        else if (!cached) render(null, false);
      })
      .catch(function () { if (!cached) render(null, false); });
  }

  /* ---- smooth transform marquee + finger drag ---- */
  containers.forEach(function (c) {
    var track = c.querySelector(".mkt__track");
    if (!track) return;
    var pos = 0, half = 0, dragging = false, startX = 0, startPos = 0, paused = false, onscreen = true, last = 0, idle = null;

    c.__measure = function () { half = track.scrollWidth / 2; };
    function apply() { track.style.transform = "translate3d(" + pos.toFixed(2) + "px,0,0)"; }
    function wrap() { if (half > 0) { while (pos <= -half) pos += half; while (pos > 0) pos -= half; } }

    c.style.touchAction = "pan-y";   // let vertical page scroll pass through
    c.addEventListener("pointerenter", function () { if (!dragging) paused = true; });
    c.addEventListener("pointerleave", function () { if (!dragging) { clearTimeout(idle); idle = setTimeout(function () { paused = false; }, 600); } });
    c.addEventListener("pointerdown", function (e) {
      dragging = true; paused = true; startX = e.clientX; startPos = pos;
      if (c.setPointerCapture) { try { c.setPointerCapture(e.pointerId); } catch (x) {} }
      clearTimeout(idle);
    });
    c.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      pos = startPos + (e.clientX - startX); wrap(); apply();
    });
    var release = function () { if (!dragging) return; dragging = false; clearTimeout(idle); idle = setTimeout(function () { paused = false; }, 2000); };
    c.addEventListener("pointerup", release);
    c.addEventListener("pointercancel", release);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { onscreen = e[0].isIntersecting; }, { threshold: 0 }).observe(c);
    }
    function step(ts) {
      if (!last) last = ts;
      var dt = Math.min(48, ts - last); last = ts;
      if (!half) c.__measure();
      if (!paused && !dragging && onscreen && !document.hidden && !reduceMotion) {
        pos -= dt * CFG.speed; wrap(); apply();
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    window.addEventListener("resize", c.__measure);
  });

  document.addEventListener("fdk:langchange", function () { render(lastMap, lastLive); });

  render(null, false);   // paint immediately (sample) so the band is never empty
  fetchLive();
  setInterval(fetchLive, CFG.refreshMs);
})();
