#!/usr/bin/env node
/* ============================================================================
   FDK · GVI daily auto-ingest (AI vision)
   ----------------------------------------------------------------------------
   Turns the daily FDK infographics into live dashboard data, automatically.

   Flow (runs in GitHub Actions, see .github/workflows/gvi-ingest.yml):
     1. Read every image dropped in data/gvi/inbox/  (jpg / jpeg / png / webp).
     2. Send each to the Anthropic Messages API (vision). The model detects
        which GVI infographic it is and returns strict JSON for that dataset.
     3. Merge the result into data/gvi/latest.json (the source of truth),
        appending today's score to each entity's sparkline history.
     4. Archive the processed image to data/gvi/inbox/processed/.
     5. scripts/gvi-build.mjs regenerates gvi-data.js → the dashboard updates.

   Requires ANTHROPIC_API_KEY (already a repo secret). Model is configurable
   via GVI_VISION_MODEL (defaults to a vision-capable Claude model).

   Usage:  ANTHROPIC_API_KEY=sk-... node scripts/gvi-ingest.mjs
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = path.join(ROOT, "data", "gvi", "inbox");
const PROCESSED = path.join(INBOX, "processed");
const SRC = path.join(ROOT, "data", "gvi", "latest.json");
const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.GVI_VISION_MODEL || "claude-sonnet-5";
const SPARK_MAX = 30;
const KEY = process.env.ANTHROPIC_API_KEY;

const FLAGS = { "United States":"🇺🇸","China":"🇨🇳","South Korea":"🇰🇷","Japan":"🇯🇵","Germany":"🇩🇪",
  "United Kingdom":"🇬🇧","France":"🇫🇷","Switzerland":"🇨🇭","Netherlands":"🇳🇱","Sweden":"🇸🇪",
  "Denmark":"🇩🇰","Norway":"🇳🇴","Spain":"🇪🇸","Austria":"🇦🇹","Italy":"🇮🇹","Brazil":"🇧🇷",
  "United Arab Emirates":"🇦🇪","Mauritius":"🇲🇺","Australia":"🇦🇺","South Africa":"🇿🇦",
  "Argentina":"🇦🇷","Turkey":"🇹🇷","Egypt":"🇪🇬","Venezuela":"🇻🇪" };

const MIME = { ".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp" };

const SYSTEM = `You extract data from FDK "Global Velocity Index" (GVI) infographics into strict JSON.
Identify which infographic it is from its title, then return ONE JSON object (no prose, no code fences)
with a "kind" field and the matching payload. Trends: green up-arrow = "up", yellow/right = "flat",
red down-arrow = "down". Read every number and delta sign carefully.

kind "country-daily"  (title "GLOBAL COUNTRY RANKINGS — DAILY"):
 { "kind":"country-daily","asOf":"YYYY-MM-DD",
   "index":{"score":N,"delta":N,"deltaPct":"+0.19%","trend30d":"Accelerating","improving":N,"declining":N,"coverage":N},
   "rows":[{"rank":N,"name":"","score":N,"delta":N,"trend":"up|flat|down","tag":"momentum label"}] }

kind "corporate-daily" (title "GLOBAL CORPORATE RANKINGS — DAILY"):
 { "kind":"corporate-daily","asOf":"YYYY-MM-DD","average":{"score":N,"delta":N,"trend":""},
   "top":[{"rank":N,"name":"","sector":"","score":N,"delta":N,"trend":""}],
   "bottom":[{"rank":N,"name":"","sector":"","score":N,"delta":N,"trend":""}],
   "sectors":[{"rank":N,"name":"","score":N,"delta":N,"trend":""}] }

kind "country-weekly" (title "COUNTRY RANKINGS — WEEKLY SCORECARD"):
 { "kind":"country-weekly","weekEnding":"YYYY-MM-DD","globalAverage":{"score":N,"delta":N},
   "topRankings":[{"rank":N,"country":"","score":N,"weeklyDelta":N,"trend":""}],
   "bottomRankings":[{"rank":N,"country":"","score":N}],
   "biggestImprovers":[{"country":"","delta":N}],
   "regionalLeaders":[{"region":"","country":"","score":N}],
   "pillars":[{"name":"","score":N,"delta":N}],
   "keyNumbers":[{"value":"","label":""}] }

kind "industry-weekly" (title "CORPORATE RANKINGS BY INDUSTRY"):
 { "kind":"industry-weekly","weekEnding":"YYYY-MM-DD","corporateAverageAllIndustries":{"score":N,"delta":N},
   "highestIndustry":{"name":"","score":N},"lowestIndustry":{"name":"","score":N},
   "industries":[{"rank":N,"name":"","avgScore":N,"weeklyDelta":N,
     "top":[{"rank":N,"company":"","score":N,"delta":N,"trend":""}],
     "bottom":[{"rank":N,"company":"","score":N,"delta":N,"trend":""}]}],
   "industryLeadersByPillar":[{"pillar":"","leader":""}] }

kind "europe-weekly" (title "EUROPE'S TOP CORPORATES BY COUNTRY"):
 { "kind":"europe-weekly","weekEnding":"YYYY-MM-DD","europeAverage":{"score":N,"delta":N},
   "highestCorporate":{"name":"","country":"","score":N},"lowestCorporate":{"name":"","country":"","score":N},
   "countries":[{"name":"","countryGVI":N,"delta":N,"trend":"",
     "top":[{"rank":N,"company":"","score":N,"delta":N,"trend":""}],
     "bottom":[{"rank":N,"company":"","score":N,"delta":N,"trend":""}]}],
   "pillarLeaders":[{"pillar":"","leader":""}] }

kind "banks-weekly" (title "EUROPEAN BANKS RANKINGS"):
 { "kind":"banks-weekly","weekEnding":"YYYY-MM-DD","europeanBanksAverage":{"score":N,"delta":N},
   "highestBank":{"name":"","country":"","score":N},"lowestBank":{"name":"","country":"","score":N},
   "topOverall":[{"rank":N,"bank":"","country":"","score":N,"delta":N,"trend":""}],
   "bottomOverall":[{"rank":N,"bank":"","country":"","score":N,"delta":N,"trend":""}],
   "pillarWeighting":[{"pillar":"","weight":"25%"}],
   "countries":[{"name":"","countryAvgGVI":N,"top":[{"rank":N,"bank":"","score":N}]}] }

If the image is not a recognizable GVI infographic, return {"kind":"unknown"}.`;

function b64(file) { return fs.readFileSync(file).toString("base64"); }

async function extract(file) {
  const ext = path.extname(file).toLowerCase();
  const media = MIME[ext];
  if (!media) throw new Error("unsupported type " + ext);
  const body = {
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: media, data: b64(file) } },
      { type: "text", text: "Extract this GVI infographic into the matching JSON. Output only the JSON." }
    ] }]
  };
  const res = await fetch(API, { method: "POST", headers: {
    "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"
  }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  let text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  return JSON.parse(text);
}

/* ---- merge helpers ---- */
function appendSpark(priorRows, name, score, keyField) {
  const p = (priorRows || []).find((r) => (r[keyField] || r.name) === name);
  const s = (p && Array.isArray(p.spark)) ? p.spark.slice() : [];
  s.push(score);
  return s.slice(-SPARK_MAX);
}

function merge(store, ex) {
  switch (ex.kind) {
    case "country-daily": {
      const priorRows = store.daily?.countries?.rows || [];
      store.daily = store.daily || {};
      store.daily.index = Object.assign({}, store.daily.index, ex.index, {
        label: "Global Velocity Index", asOf: ex.asOf, trend: (ex.index.delta || 0) < 0 ? "down" : "up"
      });
      store.daily.countries = { asOf: ex.asOf, rows: ex.rows.map((r) => ({
        rank: r.rank, flag: FLAGS[r.name] || "", name: r.name, score: r.score, delta: r.delta,
        trend: r.trend, tag: r.tag, spark: appendSpark(priorRows, r.name, r.score, "name")
      })) };
      return ex.asOf;
    }
    case "corporate-daily":
      store.daily = store.daily || {};
      store.daily.corporates = { asOf: ex.asOf, average: ex.average, top: ex.top, bottom: ex.bottom, sectors: ex.sectors };
      return ex.asOf;
    case "country-weekly":
      store.weekly = store.weekly || {}; store.weekly.weekEnding = ex.weekEnding; store.weekly.countriesScorecard = ex; return ex.weekEnding;
    case "industry-weekly":
      store.weekly = store.weekly || {}; store.weekly.weekEnding = ex.weekEnding; store.weekly.industries = ex; return ex.weekEnding;
    case "europe-weekly":
      store.weekly = store.weekly || {}; store.weekly.weekEnding = ex.weekEnding; store.weekly.europe = ex; return ex.weekEnding;
    case "banks-weekly":
      store.weekly = store.weekly || {}; store.weekly.weekEnding = ex.weekEnding; store.weekly.banks = ex; return ex.weekEnding;
    default:
      return null;
  }
}

async function main() {
  if (!KEY) { console.error("✖ ANTHROPIC_API_KEY is not set."); process.exit(1); }
  if (!fs.existsSync(INBOX)) { console.log("No inbox — nothing to do."); process.exit(0); }
  const files = fs.readdirSync(INBOX)
    .filter((f) => MIME[path.extname(f).toLowerCase()])
    .filter((f) => fs.statSync(path.join(INBOX, f)).isFile())
    .sort();
  if (!files.length) { console.log("Inbox empty — nothing to ingest."); process.exit(0); }

  const store = JSON.parse(fs.readFileSync(SRC, "utf8"));
  fs.mkdirSync(PROCESSED, { recursive: true });
  let latestDate = store.meta?.updated || null;
  let done = 0;

  for (const f of files) {
    const abs = path.join(INBOX, f);
    console.log(`\n━━━ ${f}`);
    try {
      const ex = await extract(abs);
      if (!ex || ex.kind === "unknown") { console.warn(`  ! not a recognized GVI infographic — leaving in inbox`); continue; }
      const date = merge(store, ex);
      if (date && (!latestDate || date > latestDate)) latestDate = date;
      console.log(`  ✓ ${ex.kind} → merged (as of ${date})`);
      fs.renameSync(abs, path.join(PROCESSED, f));
      done++;
    } catch (e) {
      console.error(`  ✖ failed on ${f}: ${e.message}`);
    }
  }

  if (done) {
    store.meta = store.meta || {}; store.meta.updated = latestDate || store.meta.updated;
    fs.writeFileSync(SRC, JSON.stringify(store, null, 2));
    console.log(`\n✓ ingested ${done} infographic(s); latest data as of ${store.meta.updated}`);
  } else {
    console.log("\nNo infographics ingested.");
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ingested=${done}\n`);
}
main().catch((e) => { console.error("✖ gvi-ingest failed:", e); process.exit(1); });
