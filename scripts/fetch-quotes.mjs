#!/usr/bin/env node
/* ============================================================
   FDK · Live market data fetcher
   Runs in GitHub Actions (see .github/workflows/market-update.yml).
   Reads data/market/watchlist.json, pulls quotes from TwelveData,
   and writes data/market/quotes.json (which the site renders).

   The API key comes from the TWELVEDATA_API_KEY env/secret — it is
   NEVER shipped to the browser. Bad symbols are logged and skipped,
   never breaking the board. A short price history is kept per item
   so the site can draw sparklines.

   Local dry-run (prints, writes sample):  node scripts/fetch-quotes.mjs --sample
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "data", "market");
const WATCHLIST = join(DIR, "watchlist.json");
const OUT = join(DIR, "quotes.json");
const SPARK_MAX = 30;
const SAMPLE = process.argv.includes("--sample");
const KEY = process.env.TWELVEDATA_API_KEY || "";
const BASE = "https://api.twelvedata.com/quote";

function flatten(wl) {
  const items = [];
  (wl.groups || []).forEach((g) => (g.items || []).forEach((it) =>
    items.push({ id: it.label, label: it.label, symbol: it.symbol, exchange: it.exchange || null, group: g.name })));
  return items;
}
function loadPrior() { try { return JSON.parse(readFileSync(OUT, "utf8")); } catch { return null; } }
function priorSpark(prior, id) {
  if (!prior || !prior.items) return [];
  const p = prior.items.find((x) => x.id === id);
  return (p && Array.isArray(p.spark)) ? p.spark.slice(-SPARK_MAX + 1) : [];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOne(it) {
  const u = new URL(BASE);
  u.searchParams.set("symbol", it.symbol);
  if (it.exchange) u.searchParams.set("exchange", it.exchange);
  u.searchParams.set("apikey", KEY);
  const r = await fetch(u, { headers: { accept: "application/json" } });
  const d = await r.json();
  if (!d || d.status === "error" || d.code || d.close == null) {
    throw new Error(d && d.message ? d.message : "no data");
  }
  return {
    price: parseFloat(d.close),
    chg: d.percent_change != null ? parseFloat(d.percent_change) : null,
    currency: d.currency || null,
    name: d.name || it.label
  };
}

/* ---- deterministic sample generator (for local preview only) ---- */
function sampleQuote(it, i) {
  const base = [126, 88, 92, 41, 12.7, 3.6, 2340, 1.08, 67000][i % 9] * (1 + (i % 5) / 20);
  const chg = ((i * 37) % 400 - 180) / 100; // -1.80 .. +2.19
  return { price: Math.round(base * 100) / 100, chg, currency: it.exchange ? "EUR" : "USD", name: it.label };
}

async function main() {
  if (!existsSync(WATCHLIST)) { console.error("✗ missing", WATCHLIST); process.exit(1); }
  const wl = JSON.parse(readFileSync(WATCHLIST, "utf8"));
  const items = flatten(wl);
  const prior = loadPrior();
  const stamp = new Date().toISOString();

  if (!SAMPLE && !KEY) { console.error("✗ TWELVEDATA_API_KEY not set (add it as a GitHub secret)"); process.exit(1); }

  const out = [], skipped = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const q = SAMPLE ? sampleQuote(it, i) : await fetchOne(it);
      const spark = priorSpark(prior, it.id).concat([q.price]).slice(-SPARK_MAX);
      out.push({ id: it.id, label: it.label, symbol: it.symbol, exchange: it.exchange,
        group: it.group, price: q.price, chg: q.chg, currency: q.currency, name: q.name, spark });
      console.log(`  ✓ ${it.label} (${it.symbol}${it.exchange ? ":" + it.exchange : ""}) = ${q.price} ${q.chg >= 0 ? "+" : ""}${q.chg}%`);
    } catch (e) {
      skipped.push({ id: it.id, symbol: it.symbol, exchange: it.exchange, reason: String(e.message || e) });
      // carry the last known value forward if we have one, so the board stays populated
      const p = prior && prior.items && prior.items.find((x) => x.id === it.id);
      if (p) out.push(Object.assign({}, p, { stale: true }));
      console.warn(`  ! skip ${it.label} (${it.symbol}) — ${e.message || e}`);
    }
    if (!SAMPLE) await sleep(8000); // stay under free-tier 8 req/min
  }

  mkdirSync(DIR, { recursive: true });
  const payload = { updated: stamp, provider: SAMPLE ? "sample" : "TwelveData", count: out.length, skipped, items: out };
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\n✓ wrote ${OUT}: ${out.length} quotes, ${skipped.length} skipped ${SAMPLE ? "(SAMPLE data)" : ""}`);
}
main().catch((e) => { console.error("✗ fetch-quotes failed:", e); process.exit(1); });
