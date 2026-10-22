#!/usr/bin/env node
/* ============================================================
   FDK · i18n machine translation (fills the gaps, never overwrites)

   The site is written once, in English; the browser swaps every
   string for its Spanish or Italian entry in data/i18n/{es,it}.json.
   This script finds the strings that have no entry yet, newest notes
   first, translates them with Claude in the house style, checks that
   every HTML tag survived, and merges them into the two dictionaries
   (scripts/i18n-merge.mjs). Then `node scripts/i18n-build.mjs` ships
   them. Strings already translated are never touched.

     node scripts/i18n-translate.mjs --dry-run           → what is missing + estimated cost
     node scripts/i18n-translate.mjs                     → translate everything missing
     node scripts/i18n-translate.mjs --max-words 6000    → only the newest ~6,000 words

   Env: ANTHROPIC_API_KEY (required unless --dry-run)
        I18N_MODEL  (default claude-opus-5-5) · I18N_EFFORT (default low)
   ============================================================ */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { extractAll, extractJS, noTranslate } from "./i18n-extract.mjs";
import { resolves } from "./i18n-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const argVal = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const MAX_WORDS = Number(argVal("--max-words", Infinity));
const MODEL = process.env.I18N_MODEL || "claude-opus-5-5";
const EFFORT = process.env.I18N_EFFORT || "low";
const CHUNK_WORDS = 900;        // source words per request (≈3.5k output tokens for ES + IT)
const CONCURRENCY = 4;
const KEY = process.env.ANTHROPIC_API_KEY;
const PRICE = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] }; // $ per 1M in/out

/* ---- what is missing, newest notes first ---------------------------------- */
const all = extractAll();
for (const [k, v] of extractJS()) {
  if (!all.has(k)) all.set(k, v); else v.files.forEach((f) => all.get(k).files.add(f));
}
const dict = {};
for (const lang of ["es", "it"]) dict[lang] = JSON.parse(readFileSync(join(ROOT, "data", "i18n", `${lang}.json`), "utf8"));
const keep = noTranslate();

const w = {};
new Function("window", readFileSync(join(ROOT, "posts.js"), "utf8"))(w);
const noteRank = new Map((w.FDK_POSTS || []).map((p, i) => [p.url.replace(/^\/|\/$/g, "") + "/index.html", i + 1]));
const SKIP = /^(preview|intelligence-library-preview)\//;   // unpublished previews
const rankOf = (files) => Math.min(...[...files].map((f) => (noteRank.has(f) ? noteRank.get(f) : 0)));

const missing = [];
for (const [k, v] of all) {
  if (keep.has(k)) continue;
  if ([...v.files].every((f) => SKIP.test(f))) continue;
  const need = ["es", "it"].filter((l) => !resolves(k, dict[l]));
  if (need.length) missing.push({ text: k, need, rank: rankOf(v.files), words: k.split(/\s+/).length });
}
missing.sort((a, b) => a.rank - b.rank);

let budget = MAX_WORDS, todo = [];
for (const m of missing) { if (budget <= 0) break; todo.push(m); budget -= m.words; }
const words = todo.reduce((s, m) => s + m.words, 0);
const [pin, pout] = PRICE[MODEL] || [4, 20];
const estIn = words * 1.4 + Math.ceil(words / CHUNK_WORDS) * 900, estOut = words * 1.4 * 2 * 1.25;
console.log(`missing: ${missing.length} strings · this run: ${todo.length} strings, ${words.toLocaleString("en")} words`);
console.log(`model ${MODEL} · estimated cost ≈ $${((estIn * pin + estOut * pout) / 1e6).toFixed(2)} (input ≈${Math.round(estIn / 1000)}k, output ≈${Math.round(estOut / 1000)}k tokens)`);
if (DRY || !todo.length) process.exit(0);
if (!KEY) { console.error("✖ ANTHROPIC_API_KEY is not set"); process.exit(1); }

/* ---- the house style the translations must follow ---------------------- */
const GLOSSARY = ["Morning Brief", "Midday Pulse", "The Close", "The Week Ahead", "In Focus", "Key takeaways",
  "Intelligence Library", "The Great Split", "Next Economy", "Velocity Dashboard", "What we watch", "Subscribe"]
  .filter((t) => dict.es[t] && dict.it[t]).map((t) => `- "${t}" → es "${dict.es[t]}" · it "${dict.it[t]}"`).join("\n");
const SYSTEM = `You translate The Velocity Edge, the economic and financial intelligence notes of Francesco De Leo Kaufmann
(FDK EmpowerNet), from English into Spanish (Spain) and Italian, for CEOs, investors, bankers and policymakers.

Rules:
- Translate meaning faithfully, in the register of a serious financial newspaper (Expansión, Il Sole 24 Ore). No additions, no omissions, no summaries.
- Spanish addresses the reader as "usted" (never "tú").
- Keep EVERY HTML tag exactly as in the source, with the same attributes and the same number of tags; translate only the text between tags.
- Keep figures exact. Use each language's number style: decimal comma, thousands point, "20 %" with a space, "5,8 billones de dólares" / "5.800 miliardi di dollari" for $5.8T, "650.000 millones" for $650B.
- Keep in English: The Velocity Edge, FDK, FDK EmpowerNet, Global Velocity Index, GVI, company and product names, tickers, people, and index names (S&P 500, Euro Stoxx 50…).
- "Velocity" as a plain word is "velocidad" / "velocità"; it stays English only inside "The Velocity Edge" and "Global Velocity Index".
- In Italian, a "library" is "biblioteca" (never "libreria"); "Breaking" is "Ultim'ora".
- Fixed terms used across the site:
${GLOSSARY}
- A string that is only a proper noun, a ticker or a figure is returned unchanged.

You receive a JSON list of {id, text}. Return every id with its Spanish and Italian translation.`;

const SCHEMA = { type: "object", additionalProperties: false, required: ["items"], properties: {
  items: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "es", "it"],
    properties: { id: { type: "integer" }, es: { type: "string" }, it: { type: "string" } } } } } };

const tags = (s) => (s.match(/<[^>]+>/g) || []).sort().join("");

async function ask(items) {
  const body = {
    model: MODEL, max_tokens: 16000, system: SYSTEM,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify(items.map((m, i) => ({ id: i, text: m.text }))) }],
  };
  const headers = { "x-api-key": KEY, "anthropic-version": "2026-10-21", "content-type": "application/json" };
  if (MODEL === "claude-opus-5-5") { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; body.fallbacks = "default"; }
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch((process.env.I18N_API_URL || "https://api.anthropic.com") + "/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    usage.in += data.usage?.input_tokens || 0; usage.out += data.usage?.output_tokens || 0;
    if (data.stop_reason === "refusal") throw new Error("refused");
    if (data.stop_reason === "max_tokens") throw new Error("max_tokens");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return JSON.parse(text).items;
  }
  throw new Error("API unavailable after retries");
}

/* ---- run: chunks in parallel, merged as they finish ------------------- */
const chunks = [];
let cur = [], n = 0;
for (const m of todo) { if (n + m.words > CHUNK_WORDS && cur.length) { chunks.push(cur); cur = []; n = 0; } cur.push(m); n += m.words; }
if (cur.length) chunks.push(cur);

const usage = { in: 0, out: 0 };
const tmp = mkdtempSync(join(tmpdir(), "i18n-"));
let done = 0, kept = 0, rejected = 0, failed = 0, batchNo = 0;

function merge(batch) {
  if (!Object.keys(batch).length) return;
  const f = join(tmp, `batch-${++batchNo}.json`);
  writeFileSync(f, JSON.stringify(batch));
  execFileSync(process.execPath, [join(ROOT, "scripts", "i18n-merge.mjs"), f], { stdio: "ignore" });
}

async function runChunk(chunk) {
  let items;
  try { items = await ask(chunk); }
  catch (e) {
    if (chunk.length > 1 && /max_tokens|JSON/.test(e.message)) {   // too long: split and retry
      const h = Math.ceil(chunk.length / 2);
      await runChunk(chunk.slice(0, h)); await runChunk(chunk.slice(h)); return;
    }
    failed += chunk.length; console.warn(`  ! ${chunk.length} strings left in English (${e.message})`); return;
  }
  const batch = {};
  for (const it of items || []) {
    const m = chunk[it.id]; if (!m) continue;
    const entry = {};
    for (const lang of m.need) {
      const v = (it[lang] || "").trim();
      if (v && tags(v) === tags(m.text)) entry[lang] = v; else rejected++;
    }
    if (Object.keys(entry).length) { batch[m.text] = entry; kept++; }
  }
  merge(batch);
  done += chunk.length;
  console.log(`  ${done}/${todo.length} strings · $${((usage.in * pin + usage.out * pout) / 1e6).toFixed(2)} so far`);
}

const queue = [...chunks];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (queue.length) await runChunk(queue.shift()); }));
console.log(`✓ translated ${kept} strings · ${rejected} translations rejected (HTML changed) · ${failed} left in English`);
console.log(`  tokens in ${usage.in.toLocaleString("en")} · out ${usage.out.toLocaleString("en")} · cost ≈ $${((usage.in * pin + usage.out * pout) / 1e6).toFixed(2)}`);
