#!/usr/bin/env node
/* ============================================================
   FDK · Live market feed

   Everything on the Velocity Dashboard that public sources can
   give us is refreshed here, on a schedule, and written to ONE
   file every page reads (the browser never calls a market API
   itself, so the free quotas hold however many people visit):

     https://raw.githubusercontent.com/<repo>/live-data/market.json

   Sources (no paid plan needed):
     · Twelve Data   — indices, stocks, commodities, FX
                       (key: TWELVE_DATA_KEY secret, else the public site key)
     · U.S. Treasury — official daily par yield curve (2Y, 10Y, 30Y)
     · ECB           — €STR and euro-area 10Y government yield
     · CoinGecko     — Bitcoin, Ether
     · FRED          — only if FRED_API_KEY is set: Fed funds, CPI,
                       unemployment, high-yield spread, breakevens

   Proprietary FDK indices (GVI, Espresso, velocity readings) are NOT
   here: they come from Francesco's notes (scripts/gvi-notes-ingest.mjs).

     node scripts/live-market.mjs --out <dir>/market.json
     node scripts/live-market.mjs --probe          # which symbols does the key cover?
     node scripts/live-market.mjs --fixture f.json --out x.json   # offline test
   ============================================================ */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = arg("--out") || "market.json";
const PROBE = args.includes("--probe");
const FIXTURE = arg("--fixture");
const TD_KEY = process.env.TWELVE_DATA_KEY || "348570cac4d04db0a36e15bc8b4f8833";
const FRED_KEY = process.env.FRED_API_KEY || "";
const NOW = new Date();
const log = (...a) => console.log(...a);

/* ---- what we track ------------------------------------------------------
   td: Twelve Data symbol(s) in order of preference (first that answers wins);
   tier "core" refreshes every run, "ext" every third run (free plan: 8 credits/min, 800/day). */
export const SERIES = [
  { id: "spx",   label: "S&P 500",           group: "Equities",    src: "td", td: ["SPX", "GSPC"],          dp: 2, tier: "core", why: "U.S. large caps — the AI earnings engine" },
  { id: "ixic",  label: "Nasdaq Composite",  group: "Equities",    src: "td", td: ["IXIC"],                 dp: 2, tier: "core", why: "Growth and AI duration" },
  { id: "dji",   label: "Dow Jones",         group: "Equities",    src: "td", td: ["DJI"],                  dp: 2, tier: "core", why: "Old-economy breadth" },
  { id: "wti",   label: "WTI crude",         group: "Energy",      src: "td", td: ["WTI/USD"],              dp: 2, unit: "$/bbl", tier: "core", why: "U.S. inflation transmission" },
  { id: "brent", label: "Brent crude",       group: "Energy",      src: "td", td: ["BRENT/USD", "XBR/USD"], dp: 2, unit: "$/bbl", tier: "core", why: "The global energy premium" },
  { id: "gold",  label: "Gold",              group: "Commodities", src: "td", td: ["XAU/USD"],              dp: 2, unit: "$/oz", tier: "core", why: "Real yields and the geopolitical bid" },
  { id: "eurusd",label: "EUR/USD",           group: "FX",          src: "td", td: ["EUR/USD"],              dp: 4, tier: "core", why: "The Europe–U.S. yield gap" },
  { id: "usdjpy",label: "USD/JPY",           group: "FX",          src: "td", td: ["USD/JPY"],              dp: 2, tier: "core", why: "Carry and BOJ tightening" },
  { id: "nvda",  label: "NVIDIA",            group: "AI leaders",  src: "td", td: ["NVDA"],                 dp: 2, unit: "$", tier: "ext", why: "The architecture of accelerated computing" },
  { id: "msft",  label: "Microsoft",         group: "AI leaders",  src: "td", td: ["MSFT"],                 dp: 2, unit: "$", tier: "ext", why: "Enterprise AI monetization" },
  { id: "tsm",   label: "TSMC (ADR)",        group: "AI leaders",  src: "td", td: ["TSM"],                  dp: 2, unit: "$", tier: "ext", why: "The manufacturing constraint on AI" },
  { id: "asml",  label: "ASML (ADR)",        group: "AI leaders",  src: "td", td: ["ASML"],                 dp: 2, unit: "$", tier: "ext", why: "The technological gatekeeper" },
  { id: "soxx",  label: "Semiconductors (SOXX ETF)", group: "AI leaders", src: "td", td: ["SOXX"],          dp: 2, unit: "$", tier: "ext", why: "The chip cycle in one line" },
  { id: "us2y",  label: "U.S. 2Y Treasury",  group: "Rates",       src: "ust", col: "2 Yr",                 dp: 2, unit: "%", why: "Where the Fed is priced" },
  { id: "us10y", label: "U.S. 10Y Treasury", group: "Rates",       src: "ust", col: "10 Yr",                dp: 2, unit: "%", why: "The world's discount rate" },
  { id: "us30y", label: "U.S. 30Y Treasury", group: "Rates",       src: "ust", col: "30 Yr",                dp: 2, unit: "%", why: "Term premium for long-duration capex" },
  { id: "estr",  label: "€STR",              group: "Rates",       src: "ecb", key: "EST/B.EU000A2X2A25.WT", dp: 3, unit: "%", why: "The euro overnight rate" },
  { id: "ea10y", label: "Euro area 10Y (AAA)", group: "Rates",     src: "ecb", key: "YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y", dp: 2, unit: "%", why: "Europe's risk-free long rate" },
  { id: "btc",   label: "Bitcoin",           group: "Crypto",      src: "cg",  cg: "bitcoin",               dp: 0, unit: "$", why: "Liquidity at the margin" },
  { id: "eth",   label: "Ether",             group: "Crypto",      src: "cg",  cg: "ethereum",              dp: 0, unit: "$", why: "Risk appetite in digital assets" },
  { id: "fedfunds", label: "Fed funds (effective)", group: "Macro", src: "fred", fred: "DFF",               dp: 2, unit: "%", why: "The policy rate" },
  { id: "cpi",   label: "U.S. CPI inflation", group: "Macro",      src: "fred", fred: "CPIAUCSL", yoy: true, dp: 1, unit: "%", why: "The inflation constraint" },
  { id: "unrate",label: "U.S. unemployment", group: "Macro",       src: "fred", fred: "UNRATE",             dp: 1, unit: "%", why: "AI is growing, jobs are not" },
  { id: "hy",    label: "U.S. high-yield spread", group: "Macro",  src: "fred", fred: "BAMLH0A0HYM2",       dp: 2, unit: "%", why: "The price of risky capital" },
  { id: "be10",  label: "10Y breakeven inflation", group: "Macro", src: "fred", fred: "T10YIE",             dp: 2, unit: "%", why: "What markets expect inflation to be" },
];

/* ---- helpers ------------------------------------------------------------- */
async function get(url, { json = true, timeout = 20000 } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "fdk-velocity-feed/1.0 (+https://fdkempowernet.com)", Accept: json ? "application/json" : "text/csv,*/*" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return json ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const round = (v, dp) => v == null ? null : Math.round(v * 10 ** dp) / 10 ** dp;
function csvRows(text) {
  const lines = text.trim().split(/\r?\n/);
  const split = (l) => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => { const c = split(l); const o = {}; head.forEach((h, i) => (o[h] = (c[i] || "").trim())); return o; });
}

/* ---- sources ------------------------------------------------------------- */
async function twelveData(symbols) {
  if (!symbols.length) return {};
  const d = await get(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(","))}&apikey=${TD_KEY}`);
  if (d && d.code && d.status === "error") throw new Error(`Twelve Data: ${d.message}`);
  const out = {};
  for (const s of symbols) {
    const q = symbols.length === 1 ? d : d[s];
    if (!q || q.status === "error" || q.code) { out[s] = { error: (q && q.message) || "no data" }; continue; }
    out[s] = {
      value: num(q.close), prev: num(q.previous_close), change: num(q.change), changePct: num(q.percent_change),
      asOf: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : null, open: q.is_market_open === true,
      high52: num(q.fifty_two_week && q.fifty_two_week.high), low52: num(q.fifty_two_week && q.fifty_two_week.low),
    };
  }
  return out;
}
async function twelveDaily(symbol) {
  const d = await get(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=260&apikey=${TD_KEY}`);
  if (!d || d.status === "error" || !Array.isArray(d.values)) throw new Error((d && d.message) || "no series");
  return d.values.map((v) => [v.datetime.slice(0, 10), num(v.close)]).filter((x) => x[1] != null).reverse();
}
async function treasury() {
  const y = NOW.getUTCFullYear();
  const url = (yr) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${yr}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${yr}&page&_format=csv`;
  let rows = csvRows(await get(url(y), { json: false }));
  if (rows.length < 40) { try { rows = rows.concat(csvRows(await get(url(y - 1), { json: false }))); } catch { /* fine */ } }
  // rows come newest first, dates as MM/DD/YYYY
  const iso = (d) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d); return m ? `${m[3]}-${m[1]}-${m[2]}` : d; };
  return rows.map((r) => ({ date: iso(r.Date), r })).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).sort((a, b) => a.date.localeCompare(b.date));
}
async function ecb(key) {
  const text = await get(`https://data-api.ecb.europa.eu/service/data/${key}?lastNObservations=260&format=csvdata`, { json: false });
  return csvRows(text).map((r) => [r.TIME_PERIOD, num(r.OBS_VALUE)]).filter((x) => x[1] != null);
}
async function coingecko(ids) {
  const d = await get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`);
  return d;
}
async function coingeckoDaily(id) {
  const d = await get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`);
  const seen = new Map();
  for (const [t, v] of d.prices || []) seen.set(new Date(t).toISOString().slice(0, 10), v);
  return [...seen.entries()];
}
async function fred(id) {
  const d = await get(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_KEY}&file_type=json&observation_start=${NOW.getUTCFullYear() - 2}-01-01`);
  return (d.observations || []).map((o) => [o.date, num(o.value)]).filter((x) => x[1] != null);
}

/* ---- probe: which Twelve Data symbols does this key cover? -------------- */
if (PROBE) {
  const cands = [...new Set(SERIES.filter((s) => s.src === "td").flatMap((s) => s.td).concat(["NDX", "GDAXI", "DAX", "FTSEMIB", "SX5E", "STOXX50E", "N225", "VIX", "XAG/USD", "NG/USD", "BTC/USD"]))];
  for (let i = 0; i < cands.length; i += 8) {
    if (i) await sleep(62000);
    try {
      const r = await twelveData(cands.slice(i, i + 8));
      for (const [s, q] of Object.entries(r)) log(q.error ? `✗ ${s.padEnd(10)} ${q.error}` : `✓ ${s.padEnd(10)} ${q.value}  (${q.changePct}%)  ${q.asOf}`);
    } catch (e) { log("batch failed:", e.message); }
  }
  process.exit(0);
}

/* ---- run ---------------------------------------------------------------- */
const prevFeed = (() => { try { return JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { return { series: [] }; } })();
const prevById = Object.fromEntries((prevFeed.series || []).map((s) => [s.id, s]));
const run = (prevFeed.run || 0) + 1;
const fixture = FIXTURE ? JSON.parse(fs.readFileSync(FIXTURE, "utf8")) : null;
const results = {};   // id -> {value, prev, change, changePct, asOf, source, daily?, open?}
const errors = [];

async function step(name, fn) { try { await fn(); } catch (e) { errors.push(`${name}: ${e.message}`); log(`✗ ${name}: ${e.message}`); } }

if (fixture) Object.assign(results, fixture);
else {
  /* Twelve Data — core every run, the AI leaders every third run */
  /* markets are shut at the weekend: keep Friday's close and save the quota */
  const weekend = [0, 6].includes(NOW.getUTCDay()) && !process.env.FORCE_TD;
  const tdSeries = SERIES.filter((s) => s.src === "td" && (!weekend || !prevById[s.id]) && (s.tier === "core" || run % 3 === 1 || !prevById[s.id]));
  const pick = (s) => (prevById[s.id] && prevById[s.id].symbol) || s.td[0];
  const batches = []; for (let i = 0; i < tdSeries.length; i += 8) batches.push(tdSeries.slice(i, i + 8));
  for (let b = 0; b < batches.length; b++) {
    if (b) await sleep(62000);
    await step(`twelvedata batch ${b + 1}`, async () => {
      const r = await twelveData(batches[b].map(pick));
      for (const s of batches[b]) {
        const sym = pick(s), q = r[sym];
        if (q && !q.error && q.value != null) results[s.id] = { ...q, source: "Twelve Data", symbol: sym };
        else errors.push(`twelvedata ${s.id} (${sym}): ${q ? q.error : "missing"}`);
      }
    });
  }
  /* once a day: daily closes for the charts (1 credit per symbol) */
  const today = NOW.toISOString().slice(0, 10);
  const needDaily = SERIES.filter((s) => s.src === "td" && results[s.id] && (!prevById[s.id] || prevById[s.id].dailyAt !== today)).slice(0, 7);
  if (needDaily.length) {
    await sleep(62000);
    for (const s of needDaily) await step(`daily ${s.id}`, async () => { results[s.id].daily = await twelveDaily(results[s.id].symbol); results[s.id].dailyAt = today; });
  }
  /* U.S. Treasury */
  await step("treasury", async () => {
    const rows = await treasury();
    for (const s of SERIES.filter((x) => x.src === "ust")) {
      const pts = rows.map((x) => [x.date, num(x.r[s.col])]).filter((p) => p[1] != null);
      if (pts.length < 2) continue;
      const [d1, v1] = pts[pts.length - 1], [, v0] = pts[pts.length - 2];
      results[s.id] = { value: v1, prev: v0, change: round(v1 - v0, 3), changeBp: Math.round((v1 - v0) * 100), asOf: d1, source: "U.S. Treasury", daily: pts.slice(-260) };
    }
  });
  /* ECB */
  for (const s of SERIES.filter((x) => x.src === "ecb")) await step(`ecb ${s.id}`, async () => {
    const pts = await ecb(s.key);
    if (pts.length < 2) throw new Error("no observations");
    const [d1, v1] = pts[pts.length - 1], [, v0] = pts[pts.length - 2];
    results[s.id] = { value: v1, prev: v0, change: round(v1 - v0, 3), changeBp: Math.round((v1 - v0) * 100), asOf: d1, source: "European Central Bank", daily: pts };
  });
  /* CoinGecko */
  await step("coingecko", async () => {
    const cg = SERIES.filter((x) => x.src === "cg");
    const d = await coingecko(cg.map((s) => s.cg));
    for (const s of cg) {
      const q = d[s.cg]; if (!q) continue;
      results[s.id] = { value: q.usd, changePct: round(q.usd_24h_change, 2), asOf: q.last_updated_at ? new Date(q.last_updated_at * 1000).toISOString() : NOW.toISOString(), source: "CoinGecko", open: true };
      if (!prevById[s.id] || prevById[s.id].dailyAt !== NOW.toISOString().slice(0, 10)) {
        await sleep(1500);
        try { results[s.id].daily = await coingeckoDaily(s.cg); results[s.id].dailyAt = NOW.toISOString().slice(0, 10); } catch (e) { errors.push(`coingecko daily ${s.id}: ${e.message}`); }
      }
    }
  });
  /* FRED — optional */
  if (FRED_KEY) {
    for (const s of SERIES.filter((x) => x.src === "fred")) await step(`fred ${s.id}`, async () => {
      let pts = await fred(s.fred);
      if (s.yoy) {   // monthly index → year-on-year %
        const by = new Map(pts); pts = pts.map(([d, v]) => { const y = `${+d.slice(0, 4) - 1}${d.slice(4)}`; const b = by.get(y); return b ? [d, round((v / b - 1) * 100, 2)] : null; }).filter(Boolean);
      }
      if (pts.length < 2) throw new Error("no observations");
      const [d1, v1] = pts[pts.length - 1], [, v0] = pts[pts.length - 2];
      results[s.id] = { value: v1, prev: v0, change: round(v1 - v0, 3), asOf: d1, source: "FRED · Federal Reserve Bank of St. Louis", daily: pts.slice(-260) };
    });
  } else log("· FRED_API_KEY not set — macro series (Fed funds, CPI, unemployment, HY spread, breakevens) skipped");
}

/* ---- assemble: carry the last good value forward when a source is down --- */
const INTRADAY_MAX = 7 * 24 * 4;
const series = [];
for (const s of SERIES) {
  const r = results[s.id], p = prevById[s.id];
  if (!r && !p) continue;
  const base = r || p;
  const value = round(base.value, Math.max(s.dp, 4));
  let changePct = base.changePct != null ? round(base.changePct, 2) : (base.prev ? round((base.value / base.prev - 1) * 100, 2) : null);
  const change = base.change != null ? round(base.change, 4) : (base.prev != null ? round(base.value - base.prev, 4) : null);
  // intraday trail for sparklines (one point per run, only when the value moved or an hour passed)
  let intraday = (p && p.intraday) || [];
  if (r && value != null) {
    const last = intraday[intraday.length - 1], t = NOW.toISOString().slice(0, 16) + "Z";
    if (!last || last[1] !== value || Date.parse(t) - Date.parse(last[0]) > 3600e3) intraday = intraday.concat([[t, value]]);
    const cut = Date.now() - 7 * 864e5; intraday = intraday.filter((x) => Date.parse(x[0]) >= cut).slice(-INTRADAY_MAX);
  }
  series.push({
    id: s.id, label: s.label, group: s.group, unit: s.unit || "", dp: s.dp, why: s.why,
    value, prev: base.prev != null ? round(base.prev, 4) : null, change, changePct, changeBp: base.changeBp ?? null,
    asOf: base.asOf || null, open: base.open ?? null, source: base.source, symbol: base.symbol || undefined,
    high52: base.high52 ?? null, low52: base.low52 ?? null,
    stale: !r, checkedAt: NOW.toISOString(),
    daily: (r && r.daily) || (p && p.daily) || [], dailyAt: (r && r.dailyAt) || (p && p.dailyAt) || null,
    intraday,
  });
}
/* derived: the U.S. curve (10Y − 2Y), in basis points */
const s2 = series.find((x) => x.id === "us2y"), s10 = series.find((x) => x.id === "us10y");
if (s2 && s10) {
  const m2 = new Map(s2.daily); const pts = s10.daily.filter(([d]) => m2.has(d)).map(([d, v]) => [d, Math.round((v - m2.get(d)) * 100)]);
  if (pts.length >= 2) {
    const [d1, v1] = pts[pts.length - 1], [, v0] = pts[pts.length - 2];
    series.push({ id: "curve", label: "U.S. curve 10Y−2Y", group: "Rates", unit: "bp", dp: 0, why: "Recession signal and the price of time", value: v1, prev: v0, change: v1 - v0, changePct: null, changeBp: v1 - v0, asOf: d1, source: "U.S. Treasury (derived)", stale: s10.stale, checkedAt: NOW.toISOString(), daily: pts, intraday: [] });
  }
}

const feed = {
  schema: 1, updated: NOW.toISOString(), run,
  note: "Public market data refreshed automatically for the FDK Velocity Dashboard. Delayed quotes; not investment advice.",
  sources: [...new Set(series.map((s) => s.source).filter(Boolean))],
  errors: errors.slice(0, 30),
  series,
};
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(feed));
log(`✓ live feed: ${series.length} series (${series.filter((s) => !s.stale).length} fresh, ${series.filter((s) => s.stale).length} carried) → ${OUT}`);
if (errors.length) log(`  ${errors.length} source issue(s):\n  - ` + errors.join("\n  - "));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Live feed\n${series.map((s) => `- ${s.stale ? "⚠" : "✓"} **${s.label}** ${s.value}${s.unit === "%" ? "%" : ""} · ${s.source} · ${s.asOf}`).join("\n")}\n${errors.length ? `\n**Issues**\n${errors.map((e) => `- ${e}`).join("\n")}\n` : ""}`);
}
