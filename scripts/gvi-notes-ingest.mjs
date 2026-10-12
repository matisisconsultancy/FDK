#!/usr/bin/env node
/* ============================================================================
   FDK · GVI notes → dashboard
   ----------------------------------------------------------------------------
   The FDK Velocity Dashboard reads data/gvi/latest.json (built into gvi-data.js).
   The GVI notes (FDK GVI Corporate Benchmark, Global Velocity Index updates,
   the Espresso Index, nowcasts, rankings, the Next Economy Research Centre)
   carry the same numbers as text. This step reads every recently published
   one that has not been ingested yet, extracts its data with Claude (text,
   strict JSON) and merges it into the matching dashboard section, with a link
   back to the note it came from.

   RULE (editor's instruction): not every note sent through Telegram feeds the
   dashboard — only notes titled GVI or about the data/indices Francesco works
   on. The edition (Morning View, Midday Pulse, The Close …) never qualifies a
   note on its own; its title, slot or tag must name one of those indices.

   Runs in .github/workflows/publish-drafts.yml right after a note is published,
   then scripts/gvi-build.mjs regenerates gvi-data.js.

   Usage:
     ANTHROPIC_API_KEY=… node scripts/gvi-notes-ingest.mjs          # normal run
     node scripts/gvi-notes-ingest.mjs --fixture file.json           # apply pre-extracted updates
     node scripts/gvi-notes-ingest.mjs --dry-run                     # list candidates only
   Options: --days N (look-back window, default 4)
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "data", "gvi", "latest.json");
const POSTS = path.join(ROOT, "posts.js");
const DRAFTS = path.join(ROOT, "drafts", "published");
const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.GVI_NOTES_MODEL || process.env.GVI_VISION_MODEL || "claude-sonnet-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FIXTURE = opt("--fixture");
const DRY = args.includes("--dry-run");
const DAYS = Number(opt("--days") || 4);
const SPARK_MAX = 30;

const FLAGS = { "United States":"🇺🇸","China":"🇨🇳","South Korea":"🇰🇷","Japan":"🇯🇵","Germany":"🇩🇪",
  "United Kingdom":"🇬🇧","France":"🇫🇷","Switzerland":"🇨🇭","Netherlands":"🇳🇱","Sweden":"🇸🇪",
  "Denmark":"🇩🇰","Norway":"🇳🇴","Spain":"🇪🇸","Austria":"🇦🇹","Italy":"🇮🇹","Brazil":"🇧🇷","Taiwan":"🇹🇼",
  "Singapore":"🇸🇬","India":"🇮🇳","Canada":"🇨🇦","Israel":"🇮🇱","Ireland":"🇮🇪","Finland":"🇫🇮","Belgium":"🇧🇪",
  "United Arab Emirates":"🇦🇪","Saudi Arabia":"🇸🇦","Mauritius":"🇲🇺","Australia":"🇦🇺","South Africa":"🇿🇦",
  "Argentina":"🇦🇷","Turkey":"🇹🇷","Egypt":"🇪🇬","Venezuela":"🇻🇪","Poland":"🇵🇱","Portugal":"🇵🇹","Greece":"🇬🇷" };

/* ---- which notes feed the dashboard ---------------------------------------- */
const RELEVANT = /\bgvi\b|global velocity index|corporate benchmark|espresso index|nowcast|velocity reading|country rankings|corporate rankings|next economy (dashboard|research)|global cities/i;
function isRelevant(p) {
  const hay = `${p.slot} ${p.tag} ${p.title}`;
  return RELEVANT.test(hay);   // the edition alone (e.g. Morning View) never qualifies a note
}

/* ---- the extraction contract ------------------------------------------------ */
const SYSTEM = `You turn one FDK "Velocity Edge" research note into structured updates for the FDK Velocity Dashboard.
Return ONE JSON object, no prose, no code fences: {"updates":[ ... ]}. Include only the update kinds the note
actually contains data for; return {"updates":[]} if it has none. Never invent numbers: copy them exactly from
the note. When the note says a change is not available (e.g. "N/V"), use the string "N/V" for delta and "flat"
for trend. Use null for anything the note does not state. Dates are YYYY-MM-DD (the note's reporting date).
House format ("Istruzioni per le note"): a line "Scores as of <date>" gives asOf; "verified" / "provisional" says
whether the data is final (provisional: true when it says provisional); ranking lines read "Rank. Name — score (change)".

kind "corporate-benchmark" — a ranked list of corporate GVI scores (leaders and/or laggards):
 {"kind":"corporate-benchmark","asOf":"","title":"GVI Corporate Benchmark",
  "leaders":[{"rank":N,"name":"","score":N,"delta":N|"N/V"|null,"trend":"up|flat|down","note":"one short line"}],
  "laggards":[{"rank":N,"name":"","score":N,"delta":N|"N/V"|null,"trend":"up|flat|down","note":"one short line"}],
  "groups":[{"pillar":"group or pillar name","leaders":["Company", "…"]}]}
  (laggards: rank 1 = lowest score; groups = how the note clusters companies, if it does)

kind "espresso" — the Espresso Index (country ordering of intelligence purchasing power):
 {"kind":"espresso","asOf":"","title":"The Espresso Index","subtitle":"","provisional":true|false,
  "rows":[{"rank":N,"name":"Country","score":N|null,"note":"principal driver, short"}],
  "drivers":[{"name":"","weight":"25%","note":""}]}

kind "country-daily" — Global Velocity Index country rankings with scores:
 {"kind":"country-daily","asOf":"","index":{"score":N,"delta":N,"deltaPct":"","trend30d":"","improving":N,"declining":N,"coverage":N},
  "rows":[{"rank":N,"name":"","score":N,"delta":N,"trend":"up|flat|down","tag":"momentum label"}]}

kind "corporate-daily" — daily global corporate rankings (top / bottom / sectors with scores):
 {"kind":"corporate-daily","asOf":"","average":{"score":N,"delta":N,"trend":""},
  "top":[{"rank":N,"name":"","sector":"","score":N,"delta":N,"trend":""}],
  "bottom":[{"rank":N,"name":"","sector":"","score":N,"delta":N,"trend":""}],
  "sectors":[{"rank":N,"name":"","score":N,"delta":N,"trend":""}]}

kind "velocity" — a Velocity Reading / nowcast: one overall 0–100 reading and the forces behind it:
 {"kind":"velocity","asOf":"","overall":{"score":N,"max":100,"label":"e.g. Morning Velocity Reading"},
  "rows":[{"name":"force or driver","score":N,"trend":"up|flat|down"}]}

kind "next-economy" — a Next Economy Research Centre (NERC) reading: a hypothesis and its indicators:
 {"kind":"next-economy","asOf":"","title":"Next Economy Dashboard","hypothesis":"the hypothesis as stated",
  "rows":[{"k":"indicator","latest":"latest value as printed","trend":"up|flat|down","reading":"short interpretation"}]}

kind "today" — the day's headline for the dashboard's Today panel (include it for a daily GVI / index note):
 {"kind":"today","date":"","edition":"","thesis":"the note's title","subtitle":"the note's one-line dek, plain text",
  "standfirst":"the note's epigraph or key quote","velocityReading":{"score":N,"max":100,"label":""}|null,
  "strip":[{"label":"short label","value":"as printed, e.g. 5.24%","delta":null,"trend":"up|flat|down"}],
  "headline":"one sentence: what the note adds to the dashboard (e.g. 'NVIDIA 97, TSMC 95 and Microsoft 94 lead')"}
  (strip: up to 5 key numbers stated in the note)`;

async function extract(note, text) {
  const body = {
    model: MODEL, max_tokens: 6000, system: SYSTEM,
    messages: [{ role: "user", content: `Note metadata: ${JSON.stringify(note)}\n\nNote text:\n${text}\n\nReturn only the JSON.` }]
  };
  const res = await fetch(API, { method: "POST", headers: {
    "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"
  }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  let out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  return JSON.parse(out);
}

/* ---- helpers ------------------------------------------------------------------ */
function loadPosts() {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(POSTS, "utf8"), ctx);
  return ctx.window.FDK_POSTS || [];
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function isoDate(d) {
  const m = /^(\w+) (\d{1,2}), (\d{4})$/.exec((d || "").trim());
  if (!m) return null;
  const mo = MONTHS.indexOf(m[1]); if (mo < 0) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}
function slugOf(p) { return String(p.url || "").replace(/^\/+|\/+$/g, ""); }
function noteText(slug) {
  if (fs.existsSync(DRAFTS)) {
    const f = fs.readdirSync(DRAFTS).filter((x) => x.endsWith(`-${slug}.md`)).sort().pop();
    if (f) return fs.readFileSync(path.join(DRAFTS, f), "utf8");
  }
  const page = path.join(ROOT, slug, "index.html");
  if (!fs.existsSync(page)) return null;
  let h = fs.readFileSync(page, "utf8");
  const a = h.indexOf("<article"), b = h.indexOf("</article>", a);
  if (a >= 0 && b > a) h = h.slice(a, b);
  return h.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<(p|li|h\d|br|div|tr)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "’").replace(/&quot;/g, '"').replace(/\n\s*\n+/g, "\n").trim();
}
function appendSpark(prior, name, score) {
  const p = (prior || []).find((r) => r.name === name);
  const s = (p && Array.isArray(p.spark)) ? p.spark.slice() : [];
  if (typeof score === "number") s.push(score);
  return s.slice(-SPARK_MAX);
}
const newer = (a, b) => !b || (a && a >= b);

/* ---- merge one update into the store ------------------------------------------ */
function merge(store, u, src) {
  const source = { title: src.title, url: src.url, date: src.iso, slot: src.slot };
  switch (u.kind) {
    case "corporate-benchmark": {
      const cur = store.corporateBenchmark || {};
      if (!newer(u.asOf, cur.asOf)) return null;
      store.corporateBenchmark = {
        asOf: u.asOf, title: u.title || "GVI Corporate Benchmark",
        leaders: u.leaders && u.leaders.length ? u.leaders : (cur.leaders || []),
        laggards: u.laggards && u.laggards.length ? u.laggards : (cur.laggards || []),
        pillars: u.groups && u.groups.length ? u.groups : [], source
      };
      return u.asOf;
    }
    case "espresso": {
      store.indices = store.indices || {};
      const cur = store.indices.espresso || {};
      if (!newer(u.asOf, cur.asOf)) return null;
      store.indices.espresso = {
        asOf: u.asOf, title: u.title || "The Espresso Index", subtitle: u.subtitle || cur.subtitle || "",
        constant: u.provisional ? "provisional ordering" : (cur.constant || ""), provisional: !!u.provisional,
        rows: (u.rows || []).map((r) => Object.assign({ flag: FLAGS[r.name] || "" }, r)),
        velocity: [], drivers: u.drivers || [], source
      };
      return u.asOf;
    }
    case "country-daily": {
      store.daily = store.daily || {};
      const cur = store.daily.countries || {};
      if (!newer(u.asOf, cur.asOf)) return null;
      const prior = cur.rows || [];
      store.daily.index = Object.assign({}, store.daily.index, u.index || {}, { label: "Global Velocity Index", asOf: u.asOf,
        trend: ((u.index && u.index.delta) || 0) < 0 ? "down" : "up", source });
      store.daily.countries = { asOf: u.asOf, source, rows: (u.rows || []).map((r) => ({
        rank: r.rank, flag: FLAGS[r.name] || "", name: r.name, score: r.score, delta: r.delta, trend: r.trend, tag: r.tag,
        spark: appendSpark(prior, r.name, r.score) })) };
      return u.asOf;
    }
    case "corporate-daily": {
      store.daily = store.daily || {};
      const cur = store.daily.corporates || {};
      if (!newer(u.asOf, cur.asOf)) return null;
      store.daily.corporates = { asOf: u.asOf, average: u.average, top: u.top || [], bottom: u.bottom || [], sectors: u.sectors || [], source };
      return u.asOf;
    }
    case "velocity": {
      const cur = store.velocity || {};
      if (!newer(u.asOf, cur.asOf) || !u.overall || typeof u.overall.score !== "number") return null;
      store.velocity = { asOf: u.asOf, overall: Object.assign({ max: 100 }, u.overall), scale: cur.scale || "0 = constrained · 100 = unconstrained",
        rows: (u.rows || []).map((r) => ({ name: r.name, score: r.score, arrows: Math.max(1, Math.min(4, Math.round((r.score || 0) / 25))), trend: r.trend || "flat" })), source };
      return u.asOf;
    }
    case "next-economy": {
      const cur = store.nextEconomy || {};
      if (!newer(u.asOf, cur.asOf) || !(u.rows || []).length) return null;
      store.nextEconomy = { asOf: u.asOf, title: u.title || cur.title || "Next Economy Dashboard", hypothesis: u.hypothesis || "", rows: u.rows, source };
      return u.asOf;
    }
    case "today": {
      const cur = store.today || {};
      const date = u.date || src.iso;
      if (!newer(date, cur.date)) return null;
      const notes = (cur.date === date ? (cur.notes || []) : []).filter((n) => n.url !== src.url);
      notes.push({ title: src.title, url: src.url, slot: src.slot, headline: u.headline || "" });
      const lead = /morning view|today/i.test(src.slot) || !cur.thesis || cur.date !== date;
      store.today = lead ? {
        date, edition: u.edition || src.slot, thesis: u.thesis || src.title, subtitle: u.subtitle || "", standfirst: u.standfirst || "",
        velocityReading: u.velocityReading && typeof u.velocityReading.score === "number" ? Object.assign({ max: 100, trend: "up" }, u.velocityReading) : null,
        strip: (u.strip || []).slice(0, 5), source, notes
      } : Object.assign({}, cur, { notes, strip: (cur.strip || []).concat(u.strip || []).slice(0, 5) });
      return date;
    }
    default:
      return null;
  }
}

/* ---- main --------------------------------------------------------------------- */
async function main() {
  const store = JSON.parse(fs.readFileSync(SRC, "utf8"));
  store.meta = store.meta || {};
  const done = new Set(store.meta.notesIngested || []);
  const posts = loadPosts();
  const newest = posts.map((p) => isoDate(p.date)).filter(Boolean).sort().pop();
  const cutoff = newest ? new Date(Date.parse(newest) - DAYS * 864e5).toISOString().slice(0, 10) : null;

  let fixture = null;
  if (FIXTURE) fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

  const cands = posts.filter((p) => {
    const iso = isoDate(p.date), slug = slugOf(p);
    if (!iso || !slug || done.has(slug)) return false;
    if (fixture) return !!fixture[slug];
    return isRelevant(p) && (!cutoff || iso >= cutoff);
  }).map((p) => ({ title: p.title, url: p.url, slot: p.slot, tag: p.tag, date: p.date, iso: isoDate(p.date), slug: slugOf(p) }))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  if (!cands.length) { console.log("No new dashboard-relevant notes."); return out(0); }
  console.log(`Dashboard-relevant notes to ingest: ${cands.map((c) => c.slug).join(", ")}`);
  if (DRY) return out(0);
  if (!fixture && !KEY) { console.error("✖ ANTHROPIC_API_KEY is not set — skipping."); return out(0); }

  let merged = 0;
  for (const c of cands) {
    try {
      let res;
      if (fixture) res = fixture[c.slug];
      else {
        const text = noteText(c.slug);
        if (!text) { console.warn(`  ! no text for ${c.slug}`); continue; }
        res = await extract({ title: c.title, slot: c.slot, tag: c.tag, date: c.date }, text.slice(0, 60000));
      }
      const ups = (res && res.updates) || [];
      for (const u of ups) {
        const d = merge(store, u, c);
        if (d) { merged++; console.log(`  ✓ ${c.slug} → ${u.kind} (as of ${d})`); if (newer(d, store.meta.updated)) store.meta.updated = d; }
        else console.log(`  · ${c.slug} → ${u.kind} skipped (older than the dashboard data)`);
      }
      done.add(c.slug);
    } catch (e) {
      console.error(`  ✖ ${c.slug}: ${e.message}`);
    }
  }
  store.meta.notesIngested = Array.from(done).slice(-300);
  fs.writeFileSync(SRC, JSON.stringify(store, null, 2) + "\n");
  console.log(`✓ ${merged} dashboard update(s) from ${cands.length} note(s); data as of ${store.meta.updated}`);
  return out(merged);
}
function out(n) { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `merged=${n}\n`); }
main().catch((e) => { console.error("✖ gvi-notes-ingest failed:", e); process.exit(1); });
