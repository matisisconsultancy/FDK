/* ============================================================
   FDK · GVI dashboard renderer
   Reads window.GVI_DATA (generated from data/gvi/latest.json)
   and paints the live indicator dashboard. No data lives here.
   ============================================================ */
(function () {
  "use strict";
  var D = window.GVI_DATA;
  var mount = document.getElementById("gvi");
  if (!D || !mount) return;

  var daily = D.daily || {};
  var weekly = D.weekly || {};

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return (n === undefined || n === null) ? "" : Number(n).toFixed(1); }
  function arrow(t) { return t === "up" ? "▲" : t === "down" ? "▼" : "▬"; }
  function deltaHTML(delta, trend) {
    if (delta === undefined || delta === null) return "";
    var sign = delta > 0 ? "+" : "";
    var cls = trend === "up" ? "up" : trend === "down" ? "down" : "flat";
    return '<span class="g-delta g-delta--' + cls + '">' + arrow(trend) + " " + sign + Number(delta).toFixed(1) + "</span>";
  }
  function badge(tag, trend) {
    if (!tag) return "";
    var cls = trend === "up" ? "up" : trend === "down" ? "down" : "flat";
    return '<span class="g-badge g-badge--' + cls + '">' + esc(tag) + "</span>";
  }
  function scoreBar(score) {
    var pct = Math.max(0, Math.min(100, score));
    return '<span class="g-bar"><span class="g-bar__fill" style="width:' + pct + '%"></span></span>';
  }
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
    return '<svg class="g-spark" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h +
      '" aria-hidden="true" preserveAspectRatio="none"><polyline fill="none" stroke="' + stroke +
      '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(" ") +
      '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.1" fill="' + stroke + '"/></svg>';
  }

  /* ---------- header KPI strip ---------- */
  function renderHeadline() {
    var h = daily.index || {};
    var kpis = [
      { label: "Countries improving", value: h.improving, trend: "up" },
      { label: "Countries declining", value: h.declining, trend: (h.declining ? "down" : "flat") },
      { label: "Coverage", value: h.coverage, sub: "countries" },
      { label: "30-day trend", value: h.trend30d, trend: "up" }
    ].map(function (k) {
      var tcls = k.trend ? " g-kpi__v--" + k.trend : "";
      return '<div class="g-kpi"><span class="g-kpi__l">' + esc(k.label) + "</span>" +
        '<span class="g-kpi__v' + tcls + '">' + esc(k.value) + (k.sub ? ' <em>' + esc(k.sub) + "</em>" : "") + "</span></div>";
    }).join("");
    return '<div class="g-headline"><div class="g-headline__main">' +
      '<span class="g-headline__l">' + esc(h.label || "Global Velocity Index") + '</span>' +
      '<span class="g-headline__score">' + fmt(h.score) + "</span>" +
      deltaHTML(h.delta, h.trend) +
      (h.deltaPct ? '<span class="g-headline__pct">' + esc(h.deltaPct) + "</span>" : "") +
      "</div><div class=\"g-kpis\">" + kpis + "</div></div>";
  }

  /* ---------- table builders ---------- */
  function countryTable(ds) {
    var rows = ds.rows.map(function (r) {
      return '<tr><td class="g-rank">' + r.rank + '</td>' +
        '<td class="g-name"><span class="g-flag">' + (r.flag || "") + '</span>' + esc(r.name) + '</td>' +
        '<td class="g-score"><span class="g-score__n">' + fmt(r.score) + '</span>' + scoreBar(r.score) + '</td>' +
        '<td>' + deltaHTML(r.delta, r.trend) + '</td>' +
        '<td class="g-mom">' + badge(r.tag, r.trend) + '</td>' +
        '<td class="g-sparkcell">' + sparkline(r.spark, r.trend) + '</td></tr>';
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table"><thead><tr><th>#</th><th>Country</th><th>GVI</th><th>Δ pts</th><th>Momentum</th><th>Trend</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function corpTable(list, wide, showSector) {
    var rows = list.map(function (r) {
      return '<tr><td class="g-rank' + (wide ? " g-rank--wide" : "") + '">' + r.rank + '</td>' +
        '<td class="g-name">' + esc(r.name || r.company || r.bank) +
        (showSector && r.sector ? '<span class="g-sector">' + esc(r.sector) + '</span>' : "") + '</td>' +
        '<td class="g-score"><span class="g-score__n">' + fmt(r.score) + '</span></td>' +
        '<td>' + deltaHTML(r.delta, r.trend) + '</td></tr>';
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table g-table--corp"><thead><tr><th>#</th><th>Name</th><th>GVI</th><th>Δ</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function miniRank(list) {
    return '<ol class="g-mini">' + list.map(function (r) {
      return '<li><span class="g-mini__r">' + r.rank + '</span><span class="g-mini__n">' + esc(r.company || r.bank || r.name) +
        '</span><span class="g-mini__s">' + fmt(r.score) + '</span>' + deltaHTML(r.delta, r.trend) + '</li>';
    }).join("") + '</ol>';
  }

  /* ---------- panels ---------- */
  function panelCountries() {
    return '<p class="g-note">Daily nowcast · as of ' + esc(daily.countries.asOf) + '</p>' + countryTable(daily.countries);
  }
  function panelCorporates() {
    var c = daily.corporates;
    var avg = '<p class="g-note">Global corporate average <strong>' + fmt(c.average.score) + '</strong> ' + deltaHTML(c.average.delta, c.average.trend) + ' · as of ' + esc(c.asOf) + '</p>';
    var sectors = c.sectors ? '<div class="g-sub"><h4 class="g-sub__h">Top sectors by average GVI</h4>' + corpTable(c.sectors) + '</div>' : "";
    return avg + '<div class="g-two"><div><h4 class="g-sub__h g-sub__h--up">Top 15 corporates</h4>' + corpTable(c.top, false, true) +
      '</div><div><h4 class="g-sub__h g-sub__h--down">Bottom 10 corporates</h4>' + corpTable(c.bottom, true, true) + '</div></div>' + sectors;
  }
  function panelIndustries() {
    var w = weekly.industries;
    var avg = '<p class="g-note">All-industry average <strong>' + fmt(w.corporateAverageAllIndustries.score) + '</strong> ' +
      deltaHTML(w.corporateAverageAllIndustries.delta, "up") + ' · week ending ' + esc(w.weekEnding) + '</p>';
    var cards = w.industries.map(function (ind) {
      return '<div class="g-card"><div class="g-card__head"><span class="g-card__rank">' + ind.rank + '</span>' +
        '<span class="g-card__title">' + esc(ind.name) + '</span>' +
        '<span class="g-card__score">' + fmt(ind.avgScore) + " " + deltaHTML(ind.weeklyDelta, ind.weeklyDelta < 0 ? "down" : "up") + '</span></div>' +
        '<div class="g-card__cols"><div><span class="g-card__lbl g-card__lbl--up">Top 5</span>' + miniRank(ind.top) + '</div>' +
        '<div><span class="g-card__lbl g-card__lbl--down">Bottom 5</span>' + miniRank(ind.bottom) + '</div></div></div>';
    }).join("");
    return avg + '<div class="g-cards">' + cards + '</div>';
  }
  function panelEurope() {
    var w = weekly.europe;
    var avg = '<p class="g-note">Europe corporate average <strong>' + fmt(w.europeAverage.score) + '</strong> ' + deltaHTML(w.europeAverage.delta, "up") +
      ' · highest ' + esc(w.highestCorporate.name) + ' (' + fmt(w.highestCorporate.score) + ') · week ending ' + esc(w.weekEnding) + '</p>';
    var cards = w.countries.map(function (co) {
      return '<div class="g-card"><div class="g-card__head"><span class="g-card__title">' + esc(co.name) + '</span>' +
        '<span class="g-card__score">' + fmt(co.countryGVI) + " " + deltaHTML(co.delta, co.trend) + '</span></div>' +
        '<div class="g-card__cols"><div><span class="g-card__lbl g-card__lbl--up">Top 5</span>' + miniRank(co.top) + '</div>' +
        '<div><span class="g-card__lbl g-card__lbl--down">Bottom 5</span>' + miniRank(co.bottom) + '</div></div></div>';
    }).join("");
    return avg + '<div class="g-cards">' + cards + '</div>';
  }
  function panelBanks() {
    var w = weekly.banks;
    var avg = '<p class="g-note">European banks average <strong>' + fmt(w.europeanBanksAverage.score) + '</strong> ' + deltaHTML(w.europeanBanksAverage.delta, "up") +
      ' · highest ' + esc(w.highestBank.name) + ' (' + fmt(w.highestBank.score) + ') · week ending ' + esc(w.weekEnding) + '</p>';
    var top = '<div><h4 class="g-sub__h g-sub__h--up">Top 5 banks (Europe)</h4>' + corpTable(w.topOverall.map(mapBank)) + '</div>';
    var bot = '<div><h4 class="g-sub__h g-sub__h--down">Bottom 5 banks (Europe)</h4>' + corpTable(w.bottomOverall.map(mapBank), true) + '</div>';
    var byCountry = '<div class="g-sub"><h4 class="g-sub__h">Leaders by country</h4><div class="g-cards g-cards--tight">' +
      w.countries.map(function (co) {
        return '<div class="g-card"><div class="g-card__head"><span class="g-card__title">' + esc(co.name) + '</span>' +
          '<span class="g-card__score">' + fmt(co.countryAvgGVI) + '</span></div>' + miniRank(co.top) + '</div>';
      }).join("") + '</div></div>';
    function mapBank(b) { return { rank: b.rank, name: b.bank + " · " + b.country, score: b.score, delta: b.delta, trend: b.trend }; }
    return avg + '<div class="g-two">' + top + bot + '</div>' + byCountry;
  }
  function panelScorecard() {
    var w = weekly.countriesScorecard;
    var g = '<p class="g-note">Global average GVI <strong>' + fmt(w.globalAverage.score) + '</strong> ' + deltaHTML(w.globalAverage.delta, "up") + ' · week ending ' + esc(w.weekEnding) + '</p>';
    var regional = '<div class="g-sub"><h4 class="g-sub__h">Regional leaders</h4><div class="g-chips">' +
      w.regionalLeaders.map(function (r) { return '<span class="g-chip"><em>' + esc(r.region) + '</em>' + esc(r.country) + ' <b>' + fmt(r.score) + '</b></span>'; }).join("") + '</div></div>';
    var pillars = '<div class="g-sub"><h4 class="g-sub__h">Velocity pillar trends</h4><div class="g-pillars">' +
      w.pillars.map(function (p) {
        return '<div class="g-pillar"><span class="g-pillar__n">' + esc(p.name) + '</span><span class="g-pillar__s">' + fmt(p.score) + " " + deltaHTML(p.delta, "up") + '</span>' +
          '<span class="g-bar"><span class="g-bar__fill" style="width:' + p.score + '%"></span></span></div>';
      }).join("") + '</div></div>';
    var keys = '<div class="g-sub"><h4 class="g-sub__h">Key numbers to watch</h4><div class="g-chips">' +
      w.keyNumbers.map(function (k) { return '<span class="g-chip g-chip--kn"><b>' + esc(k.value) + '</b>' + esc(k.label) + '</span>'; }).join("") + '</div></div>';
    return g + regional + pillars + keys;
  }

  var TABS = [
    { id: "countries",  label: "Countries",  cadence: "Daily",  render: panelCountries },
    { id: "corporates", label: "Corporates", cadence: "Daily",  render: panelCorporates },
    { id: "industries", label: "Industries", cadence: "Weekly", render: panelIndustries },
    { id: "europe",     label: "Europe",     cadence: "Weekly", render: panelEurope },
    { id: "banks",      label: "EU Banks",   cadence: "Weekly", render: panelBanks },
    { id: "scorecard",  label: "Global map & pillars", cadence: "Weekly", render: panelScorecard }
  ];

  function build() {
    var tabsHTML = TABS.map(function (t, i) {
      return '<button class="g-tab' + (i === 0 ? " is-active" : "") + '" data-tab="' + t.id + '">' + esc(t.label) + '<em>' + esc(t.cadence) + '</em></button>';
    }).join("");
    mount.innerHTML = renderHeadline() +
      '<div class="g-tabs" role="tablist">' + tabsHTML + '</div>' +
      '<div class="g-panel" id="gviPanel"></div>' +
      '<p class="g-foot">Source: ' + esc(D.meta.source) + ' · Data as of ' + esc(D.meta.updated) +
      ' · Scores on a ' + esc(D.meta.scale) + ' scale. Illustrative — subject to revision.</p>';
    var panel = document.getElementById("gviPanel");
    function show(id) { var t = TABS.filter(function (x) { return x.id === id; })[0] || TABS[0]; panel.innerHTML = t.render(); }
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
