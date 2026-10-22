/* ============================================================
   FDK · Live market board renderer
   Reads the live market feed (live-data branch, refreshed every
   15 minutes in market hours by .github/workflows/live-market.yml,
   the same feed as the Velocity Dashboard) and paints grouped quote
   cards with price, daily % change and a sparkline. Falls back to
   data/market/quotes.json only if the live feed cannot be reached.
   ============================================================ */
(function () {
  "use strict";
  var mount = document.getElementById("market");
  if (!mount) return;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  /* Prices and timestamps follow the language the visitor is reading in. */
  function loc() {
    var l = window.FDK_i18n ? window.FDK_i18n.lang() : "en";
    return { en: "en-US", es: "es-ES", it: "it-IT" }[l] || "en-US";
  }
  function fmtPrice(n, cur) {
    if (n == null) return "—";
    var dp = Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 10 ? 2 : 4;
    var s = Number(n).toLocaleString(loc(), { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return cur ? s + " " + esc(cur) : s;
  }
  function pctHTML(chg) {
    if (chg == null) return '<span class="mb-chg mb-chg--flat">—</span>';
    var dir = chg > 0 ? "up" : chg < 0 ? "down" : "flat";
    var arrow = chg > 0 ? "▲" : chg < 0 ? "▼" : "▬";
    var sign = chg > 0 ? "+" : "";
    return '<span class="mb-chg mb-chg--' + dir + '">' + arrow + " " + sign + Number(chg).toFixed(2) + "%</span>";
  }
  function sparkline(vals, chg) {
    if (!vals || vals.length < 2) return "";
    var w = 120, h = 34, pad = 3;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var stepX = (w - pad * 2) / (vals.length - 1);
    var pts = vals.map(function (v, i) {
      var x = pad + i * stepX, y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    var stroke = chg < 0 ? "var(--mb-red)" : "var(--mb-green)";
    var last = pts[pts.length - 1].split(",");
    return '<svg class="mb-spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + stroke + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(" ") + '"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.2" fill="' + stroke + '"/></svg>';
  }

  function card(q) {
    return '<div class="mb-card' + (q.stale ? " is-stale" : "") + '">' +
      '<div class="mb-card__top"><span class="mb-card__label">' + esc(q.label) + '</span>' +
      '<span class="mb-card__sym">' + esc(q.symbol) + (q.exchange ? ":" + esc(q.exchange) : "") + '</span></div>' +
      '<div class="mb-card__mid"><span class="mb-card__px">' + fmtPrice(q.price, q.currency) + '</span>' + pctHTML(q.chg) + '</div>' +
      sparkline(q.spark, q.chg) +
      (q.stale ? '<span class="mb-card__stale">last known</span>' : "") +
    '</div>';
  }

  function render(data) {
    var groups = {};
    (data.items || []).forEach(function (q) { (groups[q.group] = groups[q.group] || []).push(q); });
    var html = Object.keys(groups).map(function (name) {
      return '<section class="mb-group"><h3 class="mb-group__h">' + esc(name) + '</h3>' +
        '<div class="mb-grid">' + groups[name].map(card).join("") + '</div></section>';
    }).join("");
    var when = data.updated ? new Date(data.updated).toLocaleString(loc() === "en-US" ? "en-GB" : loc(), { dateStyle: "medium", timeStyle: "short" }) : "—";
    var tag = data.provider === "sample"
      ? '<span class="mb-badge mb-badge--sample">Indicative data</span>'
      : '<span class="mb-badge">Live · ' + esc(data.provider || "market data") + '</span>';
    mount.innerHTML = '<div class="mb-meta">' + tag + '<span class="mb-updated">Updated ' + esc(when) + '</span></div>' + html +
      '<p class="mb-foot">Quotes refreshed automatically every 15 minutes during market hours. Prices may be delayed. For information only — not investment advice.</p>';
  }

  function fail(msg) {
    mount.innerHTML = '<p class="mb-error">' + esc(msg) + '</p>';
  }

  var lastData = null;
  document.addEventListener("fdk:langchange", function () { if (lastData) render(lastData); });

  /* live feed → the board's quote shape */
  var LIVE = "https://raw.githubusercontent.com/matisisconsultancy/FDK/live-data/market.json";
  function fromLive(d) {
    var items = (d.series || []).filter(function (x) { return x && x.value != null; }).map(function (x) {
      var daily = (x.daily || []).slice(-30).map(function (r) { return Array.isArray(r) ? r[1] : r; }).filter(function (v) { return typeof v === "number"; });
      return { label: x.label, symbol: (x.symbol || x.id || "").replace(/^\^/, ""), group: x.group || "Markets", price: x.value,
        chg: x.changePct != null ? x.changePct : null, currency: "", spark: daily, stale: !!x.stale };
    });
    var src = (d.sources || []).map(function (s) { return String(typeof s === "string" ? s : (s && s.name) || "").replace(/\s*\(.*?\)|\s*·.*$/g, "").trim(); })
      .filter(function (s, i, a) { return s && a.indexOf(s) === i; }).slice(0, 4);
    return { updated: d.updated, provider: src.length ? src.join(", ") : "Yahoo Finance, FRED", items: items };
  }
  fetch(LIVE + "?m=" + Math.floor(Date.now() / 60000), { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error("live feed " + r.status); return r.json(); })
    .then(function (d) { var b = fromLive(d); if (!b.items.length) throw new Error("empty live feed"); return b; })
    .catch(function () {
      return fetch("/data/market/quotes.json?t=" + Date.now()).then(function (r) { if (!r.ok) throw new Error("quotes.json not found (" + r.status + ")"); return r.json(); });
    })
    .then(function (d) { lastData = d; render(d); })
    .catch(function (e) { fail("Market data unavailable — " + e.message + "."); });
})();
