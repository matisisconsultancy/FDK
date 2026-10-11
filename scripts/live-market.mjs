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
     · Yahoo Finance — indices, futures, FX: intraday quote + a year of closes
     · FRED          — official series, no key: Treasury yields, Fed funds,
                       CPI, unemployment, high-yield spread, breakevens,
                       and fallback closes for indices and oil
     · ECB           — €STR and euro-area 10Y government yield
     · CoinGecko     — Bitcoin, Ether

   Proprietary FDK indices (GVI, Espresso, velocity readings) are NOT
   here: they come from Francesco's notes (scripts/gvi-notes-ingest.mjs).

     node scripts/live-market.mjs --out <dir>/market.json
     node scripts/live-market.mjs --probe          # which sources answer for each series?
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
const NOW = new Date();
const log = (...a) => console.log(...a);

/* ---- what we track ------------------------------------------------------
   Each series lists its sources in order of preference; the first that answers wins.
     y:    Yahoo Finance chart API (no key; intraday quote + one year of daily closes)
     td:   Twelve Data (free plan covers U.S. stocks, FX and gold — not indices or oil)
     fred: FRED graph CSV (no key; official daily/monthly series, one-day lag)
     ecb:  ECB data API · cg: CoinGecko */
export const SERIES = [
  { id: "spx",    label: "S&P 500",            group: "Equities",    src: [{ y: "^GSPC" }, { fred: "SP500" }],        dp: 2, why: "U.S. large caps — the AI earnings engine" },
  { id: "ixic",   label: "Nasdaq Composite",   group: "Equities",    src: [{ y: "^IXIC" }, { fred: "NASDAQCOM" }],    dp: 2, why: "Growth and AI duration" },
  { id: "dji",    label: "Dow Jones",          group: "Equities",    src: [{ y: "^DJI" }, { fred: "DJIA" }],          dp: 2, why: "Old-economy breadth" },
  { id: "sx5e",   label: "Euro Stoxx 50",      group: "Equities",    src: [{ y: "^STOXX50E" }],                       dp: 2, why: "Europe's champions" },
  { id: "dax",    label: "DAX",                group: "Equities",    src: [{ y: "^GDAXI" }],                          dp: 2, why: "Germany's industrial AI window" },
  { id: "ftsemib",label: "FTSE MIB",           group: "Equities",    src: [{ y: "FTSEMIB.MI" }],                      dp: 2, why: "Italy: banks and the spread" },
  { id: "n225",   label: "Nikkei 225",         group: "Equities",    src: [{ y: "^N225" }, { fred: "NIKKEI225" }],    dp: 2, why: "Japan, robotics and the yen" },
  { id: "vix",    label: "VIX volatility",     group: "Equities",    src: [{ y: "^VIX" }, { fred: "VIXCLS" }],        dp: 2, why: "The price of fear" },
  { id: "wti",    label: "WTI crude",          group: "Energy",      src: [{ y: "CL=F" }, { fred: "DCOILWTICO" }],    dp: 2, unit: "$/bbl", why: "U.S. inflation transmission" },
  { id: "brent",  label: "Brent crude",        group: "Energy",      src: [{ y: "BZ=F" }, { fred: "DCOILBRENTEU" }],  dp: 2, unit: "$/bbl", why: "The global energy premium" },
  { id: "natgas", label: "U.S. natural gas",   group: "Energy",      src: [{ y: "NG=F" }],                            dp: 3, unit: "$/MMBtu", why: "Power for data centres" },
  { id: "gold",   label: "Gold",               group: "Commodities", src: [{ td: "XAU/USD" }, { y: "GC=F" }],          dp: 2, unit: "$/oz", why: "Real yields and the geopolitical bid" },
  { id: "copper", label: "Copper",             group: "Commodities", src: [{ y: "HG=F" }],                            dp: 3, unit: "$/lb", why: "Electrification demand" },
  { id: "eurusd", label: "EUR/USD",            group: "FX",          src: [{ td: "EUR/USD" }, { y: "EURUSD=X" }, { fred: "DEXUSEU" }], dp: 4, why: "The Europe–U.S. yield gap" },
  { id: "usdjpy", label: "USD/JPY",            group: "FX",          src: [{ td: "USD/JPY" }, { y: "JPY=X" }, { fred: "DEXJPUS" }],    dp: 2, why: "Carry and BOJ tightening" },
  { id: "dxy",    label: "U.S. dollar index",  group: "FX",          src: [{ y: "DX-Y.NYB" }],                        dp: 2, why: "Global dollar liquidity" },
  { id: "nvda",   label: "NVIDIA",             group: "AI leaders",  src: [{ td: "NVDA" }, { y: "NVDA" }],             dp: 2, unit: "$", why: "The architecture of accelerated computing" },
  { id: "msft",   label: "Microsoft",          group: "AI leaders",  src: [{ td: "MSFT" }, { y: "MSFT" }],             dp: 2, unit: "$", why: "Enterprise AI monetization" },
  { id: "tsm",    label: "TSMC (ADR)",         group: "AI leaders",  src: [{ td: "TSM" }, { y: "TSM" }],               dp: 2, unit: "$", why: "The manufacturing constraint on AI" },
  { id: "asml",   label: "ASML (ADR)",         group: "AI leaders",  src: [{ td: "ASML" }, { y: "ASML" }],             dp: 2, unit: "$", why: "The technological gatekeeper" },
  { id: "sox",    label: "PHLX Semiconductor", group: "AI leaders",  src: [{ y: "^SOX" }, { td: "SOXX" }],             dp: 2, why: "The chip cycle in one line" },
  { id: "us2y",   label: "U.S. 2Y Treasury",   group: "Rates",       src: [{ fred: "DGS2" }],                         dp: 2, unit: "%", why: "Where the Fed is priced" },
  { id: "us10y",  label: "U.S. 10Y Treasury",  group: "Rates",       src: [{ fred: "DGS10" }],                        dp: 2, unit: "%", why: "The world's discount rate" },
  { id: "us30y",  label: "U.S. 30Y Treasury",  group: "Rates",       src: [{ fred: "DGS30" }],                        dp: 2, unit: "%", why: "Term premium for long-duration capex" },
  { id: "estr",   label: "€STR",               group: "Rates",       src: [{ ecb: "EST/B.EU000A2X2A25.WT" }],         dp: 3, unit: "%", why: "The euro overnight rate" },
  { id: "ea10y",  label: "Euro area 10Y (AAA)",group: "Rates",       src: [{ ecb: "YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y" }], dp: 2, unit: "%", why: "Europe's risk-free long rate" },
  { id: "btc",    label: "Bitcoin",            group: "Crypto",      src: [{ cg: "bitcoin" }],                        dp: 0, unit: "$", why: "Liquidity at the margin" },
  { id: "eth",    label: "Ether",              group: "Crypto",      src: [{ cg: "ethereum" }],                       dp: 0, unit: "$", why: "Risk appetite in digital assets" },
  { id: "fedfunds", label: "Fed funds (effective)", group: "Macro",  src: [{ fred: "DFF" }],                          dp: 2, unit: "%", why: "The policy rate" },
  { id: "cpi",    label: "U.S. CPI inflation (YoY)", group: "Macro", src: [{ fred: "CPIAUCSL", yoy: true }],          dp: 1, unit: "%", why: "The inflation constraint" },
  { id: "unrate", label: "U.S. unemployment",  group: "Macro",       src: [{ fred: "UNRATE" }],                       dp: 1, unit: "%", why: "AI is growing, jobs are not" },
  { id: "hy",     label: "U.S. high-yield spread", group: "Macro",   src: [{ fred: "BAMLH0A0HYM2" }],                 dp: 2, unit: "%", why: "The price of risky capital" },
  { id: "be10",   label: "10Y breakeven inflation", group: "Macro",  src: [{ fred: "T10YIE" }],                       dp: 2, unit: "%", why: "What markets expect inflation to be" },
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
    if (!q || q.status === "error" || q.code || q.close == null) { out[s] = { error: (q && q.message) || "no data" }; continue; }
    out[s] = {
      value: num(q.close), prev: num(q.previous_close), change: num(q.change), changePct: num(q.percent_change),
      asOf: q.timestamp ? new Date(q.timestamp * 1000).toISOString() : null, open: q.is_market_open === true,
      high52: num(q.fifty_two_week && q.fifty_two_week.high), low52: num(q.fifty_two_week && q.fifty_two_week.low),
    };
  }
  return out;
}
/* Yahoo Finance chart API: the latest quote plus a year of daily closes in one call */
async function yahoo(sym) {
  let d;
  for (const host of ["query1", "query2"]) {
    try { d = await get(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d&includePrePost=false`); break; }
    catch (e) { if (host === "query2") throw e; }
  }
  const r = d && d.chart && d.chart.result && d.chart.result[0];
  if (!r || !r.meta) throw new Error((d && d.chart && d.chart.error && d.chart.error.description) || "no data");
  const m = r.meta, ts = r.timestamp || [], cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  const daily = []; ts.forEach((t, i) => { if (cl[i] != null) daily.push([new Date((t + (m.gmtoffset || 0)) * 1000).toISOString().slice(0, 10), round(cl[i], 6)]); });
  const value = num(m.regularMarketPrice);
  if (value == null) throw new Error("no price");
  const asOfDate = m.regularMarketTime ? new Date((m.regularMarketTime + (m.gmtoffset || 0)) * 1000).toISOString().slice(0, 10) : null;
  // previous close = the last daily close before the quote's own trading day
  let prev = null; for (let i = daily.length - 1; i >= 0; i--) if (!asOfDate || daily[i][0] < asOfDate) { prev = daily[i][1]; break; }
  const p = m.currentTradingPeriod && m.currentTradingPeriod.regular, now = Date.now() / 1000;
  if (daily.length && asOfDate && daily[daily.length - 1][0] === asOfDate) daily[daily.length - 1][1] = value; else if (asOfDate) daily.push([asOfDate, value]);
  return {
    value, prev, change: prev != null ? round(value - prev, 6) : null, changePct: prev ? round((value / prev - 1) * 100, 2) : null,
    asOf: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    open: p ? now >= p.start && now < p.end : null,
    high52: num(m.fiftyTwoWeekHigh), low52: num(m.fiftyTwoWeekLow), daily: daily.slice(-260),
  };
}
/* FRED graph CSV — official series, no key needed */
async function fredCsv(id, yoy) {
  const start = `${NOW.getUTCFullYear() - 2}-01-01`;
  const text = await get(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${start}`, { json: false, timeout: 40000 });
  let pts = csvRows(text).map((r) => { const k = Object.keys(r); return [r[k[0]], num(r[k[1]])]; }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && x[1] != null);
  if (yoy) { const by = new Map(pts); pts = pts.map(([d, v]) => { const b = by.get(`${+d.slice(0, 4) - 1}${d.slice(4)}`); return b ? [d, round((v / b - 1) * 100, 2)] : null; }).filter(Boolean); }
  if (pts.length < 2) throw new Error("no observations");
  const [d1, v1] = pts[pts.length - 1], [, v0] = pts[pts.length - 2];
  return { value: v1, prev: v0, change: round(v1 - v0, 4), changePct: v0 ? round((v1 / v0 - 1) * 100, 2) : null, asOf: d1, daily: pts.slice(-260) };
}
async function ecb(key) {
  const text = await get(`https://data-api.ecb.europa.eu/service/data/${key}?lastNObservations=260&format=csvdata`, { json: false, timeout: 40000 });
  const pts = csvRows(text).map((r) => [r.TIME_PERIOD, num(r.OBS_VALUE)]).filter((x) => x[1] != null);
  if (pts.length < 2) throw new Error("no observations");
  const [d1, v1] = pts[pts.length - 1], [, v0] = pts[pts.length - 2];
  return { value: v1, prev: v0, change: round(v1 - v0, 4), asOf: d1, daily: pts };
}
async function coingecko(ids) {
  return get(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true`);
}
async function coingeckoDaily(id) {
  const d = await get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`);
  const seen = new Map();
  for (const [t, v] of d.prices || []) seen.set(new Date(t).toISOString().slice(0, 10), round(v, 2));
  return [...seen.entries()];
}
const SOURCE_NAME = { y: "Yahoo Finance", td: "Twelve Data", fred: "FRED · St. Louis Fed", ecb: "European Central Bank", cg: "CoinGecko" };
const RATE_UNIT = (s) => s.unit === "%";

/* ---- probe: which symbols answer? ----------------------------------------- */
if (PROBE) {
  for (const s of SERIES) for (const src of s.src) {
    const [k, v] = Object.entries(src)[0];
    try {
      const r = k === "y" ? await yahoo(v) : k === "fred" ? await fredCsv(v, src.yoy) : k === "ecb" ? await ecb(v) : k === "td" ? (await twelveData([v]))[v] : null;
      if (!r) continue;
      log(r.error ? `✗ ${s.id.padEnd(9)} ${k}:${v} ${r.error}` : `✓ ${s.id.padEnd(9)} ${k}:${v} ${r.value} (${r.changePct ?? r.change}) ${r.asOf} d${(r.daily || []).length}`);
    } catch (e) { log(`✗ ${s.id.padEnd(9)} ${k}:${v} ${e.message}`); }
    if (k === "td") await sleep(8000);
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
const today = NOW.toISOString().slice(0, 10);

if (fixture) Object.assign(results, fixture);
else {
  /* markets are shut at the weekend: keep Friday's close, save the Twelve Data quota */
  const weekend = [0, 6].includes(NOW.getUTCDay()) && !process.env.FORCE_TD;
  /* 1 · Twelve Data, one batch (free plan: 8 symbols a minute) */
  const tdWant = SERIES.filter((s) => s.src[0].td && (!weekend || !prevById[s.id])).slice(0, 8);
  let td = {};
  if (tdWant.length) {
    try { td = await twelveData(tdWant.map((s) => s.src[0].td)); }
    catch (e) { errors.push(`twelvedata: ${e.message}`); }
  }
  for (const s of SERIES) {
    let got = null, used = null;
    for (const src of s.src) {
      const [k, v] = Object.entries(src)[0];
      try {
        if (k === "td") { const q = td[v]; if (q && !q.error) got = q; else if (q && q.error) errors.push(`${s.id} td:${v}: ${q.error}`); }
        else if (k === "y") { got = await yahoo(v); await sleep(400); }
        else if (k === "fred") got = await fredCsv(v, src.yoy);
        else if (k === "ecb") got = await ecb(v);
        else if (k === "cg") continue;    // batched below
      } catch (e) { errors.push(`${s.id} ${k}:${v}: ${e.message}`); got = null; }
      if (got && got.value != null) { used = k; got.symbol = v; break; }
    }
    if (!got) continue;
    got.source = SOURCE_NAME[used];
    /* a Twelve Data quote has no history: borrow the daily closes once a day */
    if (used === "td") {
      const p = prevById[s.id];
      if (p && p.dailyAt === today && p.daily && p.daily.length) { got.daily = p.daily; got.dailyAt = today; }
      else {
        const alt = s.src.find((x) => x.y || x.fred);
        if (alt) { try { const h = alt.y ? await yahoo(alt.y) : await fredCsv(alt.fred); got.daily = h.daily; got.dailyAt = today; } catch (e) { errors.push(`${s.id} history: ${e.message}`); } }
      }
    } else got.dailyAt = today;
    results[s.id] = got;
  }
  /* CoinGecko */
  const cg = SERIES.filter((x) => x.src[0].cg);
  try {
    const d = await coingecko(cg.map((s) => s.src[0].cg));
    for (const s of cg) {
      const q = d[s.src[0].cg]; if (!q) continue;
      const r = { value: q.usd, changePct: round(q.usd_24h_change, 2), asOf: q.last_updated_at ? new Date(q.last_updated_at * 1000).toISOString() : NOW.toISOString(), source: SOURCE_NAME.cg, open: true };
      const p = prevById[s.id];
      if (p && p.dailyAt === today && p.daily && p.daily.length) { r.daily = p.daily; r.dailyAt = today; }
      else { await sleep(1500); try { r.daily = await coingeckoDaily(s.src[0].cg); r.dailyAt = today; } catch (e) { errors.push(`${s.id} history: ${e.message}`); } }
      if (r.daily && r.daily.length) r.daily[r.daily.length - 1] = [today, q.usd];
      results[s.id] = r;
    }
  } catch (e) { errors.push(`coingecko: ${e.message}`); }
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
    value, prev: base.prev != null ? round(base.prev, 4) : null, change, changePct: s.unit === "%" ? null : changePct,
    changeBp: base.changeBp ?? (s.unit === "%" && change != null ? Math.round(change * 100) : null),
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
