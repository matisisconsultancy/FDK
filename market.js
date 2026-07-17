/* ============================================================
   FDK EmpowerNet · Live market ticker (pill marquee, swipeable)
   - Renders elegant "pill" chips for each indicator.
   - Auto-scrolls like a marquee, but is also a native horizontal
     scroll container, so it can be dragged / swiped with a finger.
   - Live data via Twelve Data (free key). Until a key is set, it
     shows clearly-marked sample values so the layout looks right.
   ============================================================ */
(function () {
  "use strict";

  var CFG = {
    // ← Paste your FREE Twelve Data API key (twelvedata.com → Dashboard → API Key)
    key: "YOUR_TWELVEDATA_KEY",
    refreshMs: 90000,   // refresh live prices every 90s
    cacheMs: 60000,     // reuse data across pages for 60s (fewer API calls)
    items: [
      { s: "WTI/USD",   l: "Oil · WTI",   dp: 2, d: 78.42,  c: 0.82 },
      { s: "BRENT/USD", l: "Brent",       dp: 2, d: 82.15,  c: 0.64 },
      { s: "EUR/USD",   l: "EUR/USD",     dp: 4, d: 1.0842, c: -0.18 },
      { s: "XAU/USD",   l: "Gold",        dp: 2, d: 2338.40, c: 0.42 },
      { s: "BTC/USD",   l: "Bitcoin",     dp: 0, d: 67240,  c: 1.90 },
      { s: "NVDA",      l: "Nvidia",      dp: 2, d: 126.36, c: 1.12 },
      { s: "SPX",       l: "S&P 500",     dp: 0, d: 5460,   c: 0.31 },
      { s: "NDX",       l: "Nasdaq 100",  dp: 0, d: 19180,  c: 0.44 }
    ]
  };

  var containers = Array.prototype.slice.call(document.querySelectorAll(".mkt"));
  if (!containers.length) return;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fmt(n, dp) {
    return Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function pillHTML(it, price, chg) {
    var dir = chg > 0 ? "up" : (chg < 0 ? "down" : "flat");
    var arrow = chg > 0 ? "▲" : (chg < 0 ? "▼" : "•");
    var sign = chg > 0 ? "+" : "";
    return '<span class="mpill">' +
      '<span class="mpill__l">' + it.l + '</span>' +
      '<span class="mpill__px">' + fmt(price, it.dp) + '</span>' +
      '<span class="mpill__ch mpill__ch--' + dir + '">' + arrow + ' ' + sign + Number(chg).toFixed(2) + '%</span>' +
      '</span>';
  }
  function render(map, live) {
    var pills = [];
    if (!live) pills.push('<span class="mpill mpill--tag">Sample</span>');
    CFG.items.forEach(function (it) {
      var q = map && map[it.s];
      if (live && !q) return;                 // when live, never fake a missing symbol
      pills.push(pillHTML(it, q ? q.price : it.d, q ? q.chg : it.c));
    });
    var html = pills.join("");
    containers.forEach(function (c) {
      var track = c.querySelector(".mkt__track");
      if (track) track.innerHTML = html + html; // duplicate for a seamless loop
    });
  }

  function getCache() {
    try { var j = JSON.parse(localStorage.getItem("fdk_mkt") || "null"); if (j && Date.now() - j.t < CFG.cacheMs) return j.m; } catch (e) {}
    return null;
  }
  function setCache(m) { try { localStorage.setItem("fdk_mkt", JSON.stringify({ t: Date.now(), m: m })); } catch (e) {} }

  function parse(data) {
    var map = {};
    CFG.items.forEach(function (it) {
      var q = data[it.s] || (data.symbol === it.s ? data : null);
      if (q && q.close != null && q.percent_change != null && !q.code) {
        map[it.s] = { price: parseFloat(q.close), chg: parseFloat(q.percent_change) };
      }
    });
    return map;
  }
  function fetchLive() {
    if (!CFG.key || CFG.key === "YOUR_TWELVEDATA_KEY") { render(null, false); return; }
    var cached = getCache();
    if (cached) { render(cached, true); return; }
    var syms = CFG.items.map(function (i) { return i.s; }).join(",");
    fetch("https://api.twelvedata.com/quote?symbol=" + encodeURIComponent(syms) + "&apikey=" + CFG.key)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var map = parse(d);
        if (Object.keys(map).length) { setCache(map); render(map, true); }
        else render(null, false);
      })
      .catch(function () { render(null, false); });
  }

  render(null, false);   // paint immediately (sample) so the band is never empty
  fetchLive();
  setInterval(fetchLive, CFG.refreshMs);

  /* ---- marquee that is also finger-swipeable ---- */
  containers.forEach(function (c) {
    var paused = false, onscreen = true, idle = null, last = 0;
    var hold = function () { paused = true; clearTimeout(idle); };
    var release = function () { clearTimeout(idle); idle = setTimeout(function () { paused = false; }, 2500); };
    c.addEventListener("pointerenter", hold);
    c.addEventListener("pointerleave", release);
    c.addEventListener("pointerdown", hold);
    c.addEventListener("pointerup", release);
    c.addEventListener("touchstart", hold, { passive: true });
    c.addEventListener("touchend", release, { passive: true });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { onscreen = e[0].isIntersecting; }, { threshold: 0 }).observe(c);
    }
    function step(ts) {
      if (!last) last = ts;
      var dt = Math.min(48, ts - last); last = ts;
      if (!paused && onscreen && !document.hidden && !reduceMotion) {
        c.scrollLeft += dt * 0.045;               // ~45px/s drift
        var half = c.scrollWidth / 2;
        if (half > 0 && c.scrollLeft >= half) c.scrollLeft -= half;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
})();
