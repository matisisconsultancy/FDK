/* ============================================================
   FDK EmpowerNet · Live market ticker (pill marquee)
   - Elegant "pill" chips per indicator.
   - Smooth, continuous transform-based marquee motion (like the
     original brand marquee), AND finger-draggable / swipeable.
   - Live data via Twelve Data (free key). Until a key is set it
     shows clearly-marked sample values so the layout looks right.
   ============================================================ */
(function () {
  "use strict";

  var CFG = {
    // ← Paste your FREE Twelve Data API key (twelvedata.com → Dashboard → API Key)
    key: "YOUR_TWELVEDATA_KEY",
    refreshMs: 90000,
    cacheMs: 60000,
    speed: 0.045,   // px per ms (~45px/s) — matches the brand marquee feel
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

  render(null, false);   // paint immediately (sample) so the band is never empty
  fetchLive();
  setInterval(fetchLive, CFG.refreshMs);
})();
