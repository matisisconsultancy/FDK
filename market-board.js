/* ============================================================
   FDK · Live market board renderer
   Fetches data/market/quotes.json (refreshed daily by the
   GitHub Action) and paints grouped quote cards with price,
   daily % change and a sparkline. No API key in the browser.
   ============================================================ */
(function () {
  "use strict";
  var mount = document.getElementById("market");
  if (!mount) return;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtPrice(n, cur) {
    if (n == null) return "—";
    var dp = Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 10 ? 2 : 4;
    var s = Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
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
    var when = data.updated ? new Date(data.updated).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
    var tag = data.provider === "sample"
      ? '<span class="mb-badge mb-badge--sample">Sample data — set TWELVEDATA_API_KEY to go live</span>'
      : '<span class="mb-badge">Live · ' + esc(data.provider || "market data") + '</span>';
    mount.innerHTML = '<div class="mb-meta">' + tag + '<span class="mb-updated">Updated ' + esc(when) + '</span></div>' + html +
      '<p class="mb-foot">Quotes refreshed automatically by a scheduled job. Prices may be delayed. For information only — not investment advice.</p>';
  }

  function fail(msg) {
    mount.innerHTML = '<p class="mb-error">' + esc(msg) + '</p>';
  }

  fetch("/data/market/quotes.json?t=" + Date.now())
    .then(function (r) { if (!r.ok) throw new Error("quotes.json not found (" + r.status + ")"); return r.json(); })
    .then(render)
    .catch(function (e) { fail("Market data unavailable — " + e.message + ". The daily job writes data/market/quotes.json."); });
})();
