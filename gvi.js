/* ============================================================
   FDK · GVI dashboard renderer
   Reads window.GVI_DATA (see gvi-data.js) and paints the
   live indicator dashboard. No data lives here — edit
   gvi-data.js to update the numbers.
   ============================================================ */
(function () {
  "use strict";
  var D = window.GVI_DATA;
  var mount = document.getElementById("gvi");
  if (!D || !mount) return;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function fmt(n) { return Number(n).toFixed(1); }

  function arrow(trend) {
    return trend === "up" ? "▲" : trend === "down" ? "▼" : "▬";
  }
  function deltaHTML(delta, trend) {
    if (delta === undefined || delta === null) return "";
    var sign = delta > 0 ? "+" : "";
    var cls = trend === "up" ? "up" : trend === "down" ? "down" : "flat";
    return '<span class="g-delta g-delta--' + cls + '">' +
      arrow(trend) + " " + sign + Number(delta).toFixed(1) + "</span>";
  }
  function badge(tag, trend) {
    if (!tag) return "";
    var cls = trend === "up" ? "up" : trend === "down" ? "down" : "flat";
    return '<span class="g-badge g-badge--' + cls + '">' + esc(tag) + "</span>";
  }

  /* ---------- inline SVG sparkline ---------- */
  function sparkline(vals, trend) {
    if (!vals || vals.length < 2) return "";
    var w = 96, h = 26, pad = 3;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    var span = (max - min) || 1;
    var stepX = (w - pad * 2) / (vals.length - 1);
    var pts = vals.map(function (v, i) {
      var x = pad + i * stepX;
      var y = pad + (h - pad * 2) * (1 - (v - min) / span);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    var stroke = trend === "down" ? "var(--g-red)" : "var(--g-green)";
    var last = pts[pts.length - 1].split(",");
    return '<svg class="g-spark" viewBox="0 0 ' + w + " " + h + '" width="' + w +
      '" height="' + h + '" aria-hidden="true" preserveAspectRatio="none">' +
      '<polyline fill="none" stroke="' + stroke + '" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(" ") + '"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.1" fill="' + stroke + '"/>' +
      "</svg>";
  }

  /* ---------- header KPI strip ---------- */
  function renderHeadline(h) {
    var kpis = (h.kpis || []).map(function (k) {
      var tcls = k.trend ? " g-kpi__v--" + k.trend : "";
      return '<div class="g-kpi"><span class="g-kpi__l">' + esc(k.label) + "</span>" +
        '<span class="g-kpi__v' + tcls + '">' + esc(k.value) +
        (k.sub ? ' <em>' + esc(k.sub) + "</em>" : "") + "</span></div>";
    }).join("");
    return '<div class="g-headline">' +
      '<div class="g-headline__main">' +
        '<span class="g-headline__l">' + esc(h.label) + "</span>" +
        '<span class="g-headline__score">' + fmt(h.score) + "</span>" +
        deltaHTML(h.delta, h.trend) +
        (h.deltaPct ? '<span class="g-headline__pct">' + esc(h.deltaPct) + "</span>" : "") +
      "</div>" +
      '<div class="g-kpis">' + kpis + "</div>" +
    "</div>";
  }

  /* ---------- generic rank table ---------- */
  function scoreBar(score) {
    var pct = Math.max(0, Math.min(100, score));
    return '<span class="g-bar"><span class="g-bar__fill" style="width:' + pct + '%"></span></span>';
  }

  function countryTable(ds) {
    var rows = ds.rows.map(function (r) {
      return '<tr>' +
        '<td class="g-rank">' + r.rank + "</td>" +
        '<td class="g-name"><span class="g-flag">' + (r.flag || "") + "</span>" + esc(r.name) + "</td>" +
        '<td class="g-score"><span class="g-score__n">' + fmt(r.score) + "</span>" + scoreBar(r.score) + "</td>" +
        "<td>" + deltaHTML(r.delta, r.trend) + "</td>" +
        '<td class="g-mom">' + badge(r.tag, r.trend) + "</td>" +
        '<td class="g-sparkcell">' + sparkline(r.spark, r.trend) + "</td>" +
      "</tr>";
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table">' +
      '<thead><tr><th>#</th><th>Country</th><th>GVI</th><th>Δ pts</th><th>Momentum</th><th>Trend</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function corpTable(list, rankWide) {
    var rows = list.map(function (r) {
      return '<tr>' +
        '<td class="g-rank' + (rankWide ? " g-rank--wide" : "") + '">' + r.rank + "</td>" +
        '<td class="g-name">' + esc(r.name) + '<span class="g-sector">' + esc(r.sector || "") + "</span></td>" +
        '<td class="g-score"><span class="g-score__n">' + fmt(r.score) + "</span></td>" +
        "<td>" + deltaHTML(r.delta, r.trend) + "</td>" +
      "</tr>";
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table g-table--corp">' +
      '<thead><tr><th>#</th><th>Company</th><th>GVI</th><th>Δ</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  function industryTable(ds) {
    var rows = ds.rows.map(function (r) {
      return '<tr>' +
        '<td class="g-rank">' + r.rank + "</td>" +
        '<td class="g-name">' + esc(r.name) +
          (r.leader ? '<span class="g-sector">Leader · ' + esc(r.leader) + "</span>" : "") + "</td>" +
        '<td class="g-score"><span class="g-score__n">' + fmt(r.score) + "</span>" + scoreBar(r.score) + "</td>" +
        "<td>" + deltaHTML(r.delta, r.trend) + "</td>" +
      "</tr>";
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table">' +
      '<thead><tr><th>#</th><th>Industry</th><th>GVI</th><th>Δ</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  /* ---------- panels (tabs) ---------- */
  function panelCountries() { return countryTable(D.countries); }

  function panelCorporates() {
    var c = D.corporates;
    var avg = '<p class="g-note">Global corporate average <strong>' + fmt(c.average.score) + "</strong> " +
      deltaHTML(c.average.delta, c.average.trend) + "</p>";
    var sectors = c.sectors ? '<div class="g-sub"><h4 class="g-sub__h">Top sectors by average GVI</h4>' +
      corpTable(c.sectors.map(function (s) { return { rank: s.rank, name: s.name, sector: "", score: s.score, delta: s.delta, trend: s.trend }; })) + "</div>" : "";
    return avg +
      '<div class="g-two">' +
        '<div><h4 class="g-sub__h g-sub__h--up">Top 15 corporates</h4>' + corpTable(c.top) + "</div>" +
        '<div><h4 class="g-sub__h g-sub__h--down">Bottom 10 corporates</h4>' + corpTable(c.bottom, true) + "</div>" +
      "</div>" + sectors;
  }

  function panelIndustries() {
    var i = D.industries;
    var avg = '<p class="g-note">All-industry average <strong>' + fmt(i.average.score) + "</strong> " +
      deltaHTML(i.average.delta, i.average.trend) + "</p>";
    return avg + industryTable(i);
  }

  var TABS = [
    { id: "countries",  label: "Countries",  cadence: D.countries.cadence,  render: panelCountries },
    { id: "corporates", label: "Corporates", cadence: D.corporates.cadence, render: panelCorporates },
    { id: "industries", label: "Industries", cadence: D.industries.cadence, render: panelIndustries }
  ];

  /* ---------- assemble ---------- */
  function build() {
    var tabsHTML = TABS.map(function (t, idx) {
      return '<button class="g-tab' + (idx === 0 ? " is-active" : "") + '" data-tab="' + t.id + '">' +
        esc(t.label) + '<em>' + esc(t.cadence) + "</em></button>";
    }).join("");

    mount.innerHTML =
      renderHeadline(D.headline) +
      '<div class="g-tabs" role="tablist">' + tabsHTML + "</div>" +
      '<div class="g-panel" id="gviPanel"></div>' +
      '<p class="g-foot">Source: ' + esc(D.meta.source) + " · Data as of " + esc(D.meta.updated) +
        " · Scores on a " + esc(D.meta.scale) + " scale. Illustrative — subject to revision.</p>";

    var panel = document.getElementById("gviPanel");
    function show(id) {
      var t = TABS.filter(function (x) { return x.id === id; })[0] || TABS[0];
      panel.innerHTML = t.render();
    }
    mount.querySelectorAll(".g-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mount.querySelectorAll(".g-tab").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
        show(btn.getAttribute("data-tab"));
      });
    });
    show(TABS[0].id);
  }

  build();
})();
