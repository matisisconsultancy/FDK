/* ============================================================
   FDK · Velocity dashboard renderer (unified, 6 sections)
   Reads window.GVI_DATA (generated from data/gvi/latest.json).
   Sections: Today · Market · Velocity · Rankings · Indices · Next Economy
   ============================================================ */
(function () {
  "use strict";
  var D = window.GVI_DATA;
  var mount = document.getElementById("gvi");
  if (!D || !mount) return;

  var daily = D.daily || {}, weekly = D.weekly || {};

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return (n === undefined || n === null) ? "" : Number(n).toFixed(1); }
  function arrow(t) { return t === "up" ? "▲" : t === "down" ? "▼" : "▬"; }
  function deltaHTML(delta, trend) {
    if (delta === undefined || delta === null || delta === "") return "";
    var isNum = typeof delta === "number";
    var sign = isNum && delta > 0 ? "+" : "";
    var cls = trend === "up" ? "up" : trend === "down" ? "down" : "flat";
    var txt = isNum ? sign + Number(delta).toFixed(1) : esc(delta);
    return '<span class="g-delta g-delta--' + cls + '">' + arrow(trend) + " " + txt + "</span>";
  }
  function badge(tag, trend) {
    if (!tag) return "";
    var cls = trend === "up" ? "up" : trend === "down" ? "down" : "flat";
    return '<span class="g-badge g-badge--' + cls + '">' + esc(tag) + "</span>";
  }
  function scoreBar(score, max) {
    var pct = Math.max(0, Math.min(100, (score / (max || 100)) * 100));
    return '<span class="g-bar"><span class="g-bar__fill" style="width:' + pct + '%"></span></span>';
  }
  function arrows(n, trend) {
    var cls = trend === "down" ? "down" : "up";
    return '<span class="g-arrows g-arrows--' + cls + '">' + new Array((n || 0) + 1).join(arrow(trend)) + "</span>";
  }
  function sparkline(vals, trend) {
    if (!vals || vals.length < 2) return "";
    var w = 96, h = 26, pad = 3, min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = (max - min) || 1;
    var stepX = (w - pad * 2) / (vals.length - 1);
    var pts = vals.map(function (v, i) { return (pad + i * stepX).toFixed(1) + "," + (pad + (h - pad * 2) * (1 - (v - min) / span)).toFixed(1); });
    var stroke = trend === "down" ? "var(--g-red)" : "var(--g-green)", last = pts[pts.length - 1].split(",");
    return '<svg class="g-spark" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true" preserveAspectRatio="none"><polyline fill="none" stroke="' + stroke + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(" ") + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.1" fill="' + stroke + '"/></svg>';
  }
  function gauge(score, max, label) {
    var pct = Math.max(0, Math.min(1, score / (max || 100)));
    var r = 52, c = Math.PI * r, off = c * (1 - pct);
    return '<div class="g-gauge"><svg viewBox="0 0 130 78" width="150" aria-hidden="true">' +
      '<path d="M13 70 A52 52 0 0 1 117 70" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M13 70 A52 52 0 0 1 117 70" fill="none" stroke="var(--g-green)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '</svg><div class="g-gauge__v">' + score + '<em>/' + (max || 100) + '</em></div>' +
      (label ? '<div class="g-gauge__l">' + esc(label) + "</div>" : "") + "</div>";
  }

  /* ---------- reusable tables (legacy rankings) ---------- */
  function countryTable(ds) {
    var rows = ds.rows.map(function (r) {
      return '<tr><td class="g-rank">' + r.rank + '</td><td class="g-name"><span class="g-flag">' + (r.flag || "") + '</span>' + esc(r.name) +
        '</td><td class="g-score"><span class="g-score__n">' + fmt(r.score) + '</span>' + scoreBar(r.score) + '</td><td>' + deltaHTML(r.delta, r.trend) +
        '</td><td class="g-mom">' + badge(r.tag, r.trend) + '</td><td class="g-sparkcell">' + sparkline(r.spark, r.trend) + '</td></tr>';
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table"><thead><tr><th>#</th><th>Country</th><th>GVI</th><th>Δ</th><th>Momentum</th><th>Trend</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function benchTable(list, kind) {
    var rows = list.map(function (r) {
      return '<tr><td class="g-rank">' + r.rank + '</td><td class="g-name">' + esc(r.name) +
        (r.note ? '<span class="g-sector">' + esc(r.note) + '</span>' : "") + '</td>' +
        '<td class="g-score"><span class="g-score__n">' + fmt(r.score) + '</span>' + scoreBar(r.score) + '</td><td>' + deltaHTML(r.delta, r.trend) + '</td></tr>';
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table"><thead><tr><th>#</th><th>' + (kind === "down" ? "Laggard" : "Leader") + '</th><th>GVI</th><th>Δ</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function miniRank(list, key) {
    return '<ol class="g-mini">' + list.map(function (r) {
      return '<li><span class="g-mini__r">' + r.rank + '</span><span class="g-mini__n">' + esc(r.company || r.bank || r.name) + '</span><span class="g-mini__s">' + fmt(r.score) + '</span>' + deltaHTML(r.delta, r.trend) + '</li>';
    }).join("") + '</ol>';
  }
  function corpTable(list, showSector) {
    var rows = list.map(function (r) {
      return '<tr><td class="g-rank">' + r.rank + '</td><td class="g-name">' + esc(r.name) + (showSector && r.sector ? '<span class="g-sector">' + esc(r.sector) + '</span>' : "") +
        '</td><td class="g-score"><span class="g-score__n">' + fmt(r.score) + '</span></td><td>' + deltaHTML(r.delta, r.trend) + '</td></tr>';
    }).join("");
    return '<div class="g-tablewrap"><table class="g-table"><thead><tr><th>#</th><th>Name</th><th>GVI</th><th>Δ</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function cardsGrid(items, headFn, bodyFn) {
    return '<div class="g-cards">' + items.map(function (it) {
      return '<div class="g-card"><div class="g-card__head">' + headFn(it) + '</div>' + bodyFn(it) + '</div>';
    }).join("") + '</div>';
  }

  /* ---------- 1 · TODAY ---------- */
  function panelToday() {
    var t = D.today || {};
    var strip = (t.strip || []).map(function (s) {
      return '<div class="g-tchip"><span class="g-tchip__l">' + esc(s.label) + '</span><span class="g-tchip__v ' + (s.trend === "down" ? "down" : s.trend === "up" ? "up" : "") + '">' + esc(s.value) + (s.delta ? " " + esc(s.delta) : "") + '</span></div>';
    }).join("");
    return '<div class="g-today">' +
      '<div class="g-today__main"><span class="g-eyebrow">' + esc(t.edition || "") + ' · ' + esc(t.date || "") + '</span>' +
      '<h3 class="g-today__thesis">' + esc(t.thesis || "") + '</h3><p class="g-today__sub">' + esc(t.subtitle || "") + '</p>' +
      (t.standfirst ? '<p class="g-today__stand">“' + esc(t.standfirst) + '”</p>' : "") + '</div>' +
      '<div class="g-today__gauge">' + gauge(t.velocityReading.score, t.velocityReading.max, t.velocityReading.label) + '</div>' +
      '</div><div class="g-strip">' + strip + '</div>';
  }

  /* ---------- 2 · MARKET ---------- */
  function panelMarket() {
    var m = D.market || {};
    var rows = m.rows.map(function (r) {
      return '<tr><td class="g-name">' + esc(r.k) + '</td><td class="g-score"><span class="g-score__n ' + (r.trend === "down" ? "dn" : "") + '">' + esc(r.v) + '</span></td><td class="g-note2">' + esc(r.note) + '</td><td>' + arrow(r.trend) + '</td></tr>';
    }).join("");
    return '<p class="g-note">Public market signals · as of ' + esc(m.asOf) + ' · auto-updatable from a market data API</p>' +
      '<div class="g-tablewrap"><table class="g-table g-table--mkt"><thead><tr><th>Signal</th><th>Latest</th><th>Why it matters</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- 3 · VELOCITY ---------- */
  function panelVelocity() {
    var v = D.velocity || {};
    var rows = v.rows.map(function (r) {
      return '<div class="g-vrow"><span class="g-vrow__n">' + esc(r.name) + '</span>' + arrows(r.arrows, r.trend) +
        '<span class="g-vrow__s">' + r.score + '</span><span class="g-bar g-bar--wide"><span class="g-bar__fill" style="width:' + r.score + '%"></span></span></div>';
    }).join("");
    return '<div class="g-velhead">' + gauge(v.overall.score, v.overall.max, v.overall.label) +
      '<p class="g-note">' + esc(v.scale) + ' · as of ' + esc(v.asOf) + '</p></div><div class="g-vlist">' + rows + '</div>';
  }

  /* ---------- 4 · RANKINGS (benchmark + legacy sub-views) ---------- */
  var RANK_SUB = [
    { id: "benchmark", label: "Corporate Benchmark", render: subBenchmark },
    { id: "countries", label: "Countries", render: function () { return countryTable(daily.countries); } },
    { id: "corporates", label: "Corporates (daily)", render: subCorporates },
    { id: "industries", label: "Industries", render: subIndustries },
    { id: "europe", label: "Europe", render: subEurope },
    { id: "banks", label: "EU Banks", render: subBanks }
  ];
  function subBenchmark() {
    var b = D.corporateBenchmark || {};
    var pillars = '<div class="g-sub"><h4 class="g-sub__h">Pillar leadership</h4><div class="g-chips">' +
      b.pillars.map(function (p) { return '<span class="g-chip"><em>' + esc(p.pillar) + '</em>' + esc(p.leaders.join(" · ")) + '</span>'; }).join("") + '</div></div>';
    return '<p class="g-note">' + esc(b.title) + ' · as of ' + esc(b.asOf) + '</p><div class="g-two">' +
      '<div><h4 class="g-sub__h g-sub__h--up">Top 10 velocity leaders</h4>' + benchTable(b.leaders, "up") + '</div>' +
      '<div><h4 class="g-sub__h g-sub__h--down">10 corporate laggards</h4>' + benchTable(b.laggards, "down") + '</div></div>' + pillars;
  }
  function subCorporates() {
    var c = daily.corporates;
    return '<p class="g-note">Global corporate average <strong>' + fmt(c.average.score) + '</strong> ' + deltaHTML(c.average.delta, c.average.trend) + ' · as of ' + esc(c.asOf) + '</p>' +
      '<div class="g-two"><div><h4 class="g-sub__h g-sub__h--up">Top 15</h4>' + corpTable(c.top, true) + '</div><div><h4 class="g-sub__h g-sub__h--down">Bottom 10</h4>' + corpTable(c.bottom, true) + '</div></div>';
  }
  function subIndustries() {
    var w = weekly.industries;
    return '<p class="g-note">All-industry average <strong>' + fmt(w.corporateAverageAllIndustries.score) + '</strong> ' + deltaHTML(w.corporateAverageAllIndustries.delta, "up") + ' · week ending ' + esc(w.weekEnding) + '</p>' +
      cardsGrid(w.industries, function (ind) {
        return '<span class="g-card__rank">' + ind.rank + '</span><span class="g-card__title">' + esc(ind.name) + '</span><span class="g-card__score">' + fmt(ind.avgScore) + " " + deltaHTML(ind.weeklyDelta, ind.weeklyDelta < 0 ? "down" : "up") + '</span>';
      }, function (ind) {
        return '<div class="g-card__cols"><div><span class="g-card__lbl g-card__lbl--up">Top 5</span>' + miniRank(ind.top) + '</div><div><span class="g-card__lbl g-card__lbl--down">Bottom 5</span>' + miniRank(ind.bottom) + '</div></div>';
      });
  }
  function subEurope() {
    var w = weekly.europe;
    return '<p class="g-note">Europe corporate average <strong>' + fmt(w.europeAverage.score) + '</strong> ' + deltaHTML(w.europeAverage.delta, "up") + ' · week ending ' + esc(w.weekEnding) + '</p>' +
      cardsGrid(w.countries, function (co) {
        return '<span class="g-card__title">' + esc(co.name) + '</span><span class="g-card__score">' + fmt(co.countryGVI) + " " + deltaHTML(co.delta, co.trend) + '</span>';
      }, function (co) {
        return '<div class="g-card__cols"><div><span class="g-card__lbl g-card__lbl--up">Top 5</span>' + miniRank(co.top) + '</div><div><span class="g-card__lbl g-card__lbl--down">Bottom 5</span>' + miniRank(co.bottom) + '</div></div>';
      });
  }
  function subBanks() {
    var w = weekly.banks;
    return '<p class="g-note">European banks average <strong>' + fmt(w.europeanBanksAverage.score) + '</strong> ' + deltaHTML(w.europeanBanksAverage.delta, "up") + ' · week ending ' + esc(w.weekEnding) + '</p>' +
      '<div class="g-two"><div><h4 class="g-sub__h g-sub__h--up">Top 5 (Europe)</h4>' + benchTable(w.topOverall.map(function (b) { return { rank: b.rank, name: b.bank + " · " + b.country, score: b.score, delta: b.delta, trend: b.trend }; }), "up") + '</div>' +
      '<div><h4 class="g-sub__h g-sub__h--down">Bottom 5 (Europe)</h4>' + benchTable(w.bottomOverall.map(function (b) { return { rank: b.rank, name: b.bank + " · " + b.country, score: b.score, delta: b.delta, trend: b.trend }; }), "down") + '</div></div>' +
      '<div class="g-sub"><h4 class="g-sub__h">Leaders by country</h4>' + cardsGrid(w.countries, function (co) {
        return '<span class="g-card__title">' + esc(co.name) + '</span><span class="g-card__score">' + fmt(co.countryAvgGVI) + '</span>';
      }, function (co) { return miniRank(co.top); }) + '</div>';
  }
  function panelRankings() {
    var subs = RANK_SUB.map(function (s, i) { return '<button class="g-subtab' + (i === 0 ? " on" : "") + '" data-sub="' + s.id + '">' + esc(s.label) + '</button>'; }).join("");
    return '<div class="g-subtabs">' + subs + '</div><div class="g-subpanel" id="gviSub"></div>';
  }

  /* ---------- 5 · INDICES ---------- */
  function panelIndices() {
    var e = D.indices.espresso;
    var rows = e.rows.map(function (r) {
      return '<tr><td class="g-rank">' + r.rank + '</td><td class="g-name"><span class="g-flag">' + (r.flag || "") + '</span>' + esc(r.name) + '<span class="g-sector">' + esc(r.note) + '</span></td>' +
        '<td class="g-score"><span class="g-score__n">' + fmt(r.score) + '</span>' + scoreBar(r.score) + '</td></tr>';
    }).join("");
    var vel = e.velocity.map(function (v) {
      return '<div class="g-vrow' + (v.highlight ? " g-vrow--hl" : "") + '"><span class="g-vrow__n">' + esc(v.name) + '</span><span class="g-vrow__s">' + v.score + '</span><span class="g-bar g-bar--wide"><span class="g-bar__fill" style="width:' + v.score + '%"></span></span></div>';
    }).join("");
    return '<p class="g-note">' + esc(e.title) + ' — ' + esc(e.subtitle) + ' · ' + esc(e.constant) + ' · as of ' + esc(e.asOf) + '</p>' +
      '<div class="g-two g-two--wide"><div><h4 class="g-sub__h">Global Top 15 (Espresso Score)</h4><div class="g-tablewrap"><table class="g-table"><thead><tr><th>#</th><th>Country</th><th>Score</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div><h4 class="g-sub__h">Espresso Velocity Reading</h4><div class="g-vlist">' + vel + '</div></div></div>';
  }

  /* ---------- 6 · NEXT ECONOMY ---------- */
  function panelNextEconomy() {
    var n = D.nextEconomy;
    var rows = n.rows.map(function (r) {
      return '<tr><td class="g-name">' + esc(r.k) + '</td><td class="g-note2">' + esc(r.latest) + '</td><td>' + arrow(r.trend) + '</td><td class="g-mom">' + badge(r.reading, r.trend) + '</td></tr>';
    }).join("");
    return '<p class="g-note">' + esc(n.title) + ' · ' + esc(n.hypothesis) + ' · as of ' + esc(n.asOf) + '</p>' +
      '<div class="g-tablewrap"><table class="g-table g-table--mkt"><thead><tr><th>Indicator</th><th>Latest</th><th></th><th>NERC reading</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="g-foot">Full analysis (6 themes, key takeaways, implications) is published to <a href="/intelligence-library">The Velocity Edge</a>.</p>';
  }

  /* ---------- assemble ---------- */
  var TABS = [
    { id: "today", label: "Today", render: panelToday },
    { id: "market", label: "Market", render: panelMarket },
    { id: "velocity", label: "Velocity", render: panelVelocity },
    { id: "rankings", label: "Rankings", render: panelRankings },
    { id: "indices", label: "Indices", render: panelIndices },
    { id: "next", label: "Next Economy", render: panelNextEconomy }
  ];

  function build() {
    var tabsHTML = TABS.map(function (t, i) { return '<button class="g-tab' + (i === 0 ? " is-active" : "") + '" data-tab="' + t.id + '">' + esc(t.label) + "</button>"; }).join("");
    mount.innerHTML = '<div class="g-tabs" role="tablist">' + tabsHTML + '</div><div class="g-panel" id="gviPanel"></div>' +
      '<p class="g-foot">Source: ' + esc(D.meta.source) + ' · Data as of ' + esc(D.meta.updated) + ' · FDK proprietary readings on a 0–100 scale · illustrative, subject to revision.</p>';
    var panel = document.getElementById("gviPanel");
    function wireSub() {
      var sp = document.getElementById("gviSub"); if (!sp) return;
      function showSub(id) { var s = RANK_SUB.filter(function (x) { return x.id === id; })[0] || RANK_SUB[0]; sp.innerHTML = s.render(); }
      mount.querySelectorAll(".g-subtab").forEach(function (b) {
        b.addEventListener("click", function () {
          mount.querySelectorAll(".g-subtab").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on"); showSub(b.getAttribute("data-sub"));
        });
      });
      showSub(RANK_SUB[0].id);
    }
    function show(id) { var t = TABS.filter(function (x) { return x.id === id; })[0] || TABS[0]; panel.innerHTML = t.render(); if (id === "rankings") wireSub(); }
    mount.querySelectorAll(".g-tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        mount.querySelectorAll(".g-tab").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active"); show(btn.getAttribute("data-tab"));
      });
    });
    show(TABS[0].id);
  }
  build();
  document.addEventListener("fdk:langchange", build);
})();
