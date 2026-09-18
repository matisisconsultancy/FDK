#!/usr/bin/env node
/* ============================================================
   FDK · i18n page audit — the check that decides

   Renders every URL with the REAL built dictionaries and looks for
   text that is in the wrong language, by searching the page for the
   source strings themselves. Matching on content rather than on node
   position means nothing upstream can hide a fault downstream.

   It covers the two ways a visitor gets a language, because they run
   through different code and have broken independently:
     · opening the page in it            → i18n-boot.js
     · picking it from the switcher      → i18n.js  (ensure + applyAll)

   and the whole switch matrix, including returning to English and
   switching twice, plus <title>, meta and translatable attributes.

   Reported faults
     english     an English source string still visible in es/it
     stale       es/it text left behind after switching back to English
     crossed     Spanish text on an Italian page, or the reverse
     version     a dictionary requested with an out-of-date ?v=

     PW=/path/to/playwright node scripts/i18n-audit.mjs
   ============================================================ */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE = new Set([".git", "node_modules", "assets", "drafts", "data", ".github",
  "forms", ".i18n-verify", "i18n", "scripts"]);

const urls = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (IGNORE.has(n) || n.startsWith(".")) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n === "index.html") urls.push("/" + relative(ROOT, p).replace(/index\.html$/, ""));
  }
})(ROOT);
urls.sort();

const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".svg":"image/svg+xml", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".png":"image/png",
  ".ico":"image/x-icon", ".woff2":"font/woff2", ".xml":"application/xml", ".txt":"text/plain" };
const missed = new Set();
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f)) { missed.add(p); res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "Content-Type": MIME[p.slice(p.lastIndexOf("."))] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const base = "http://127.0.0.1:" + server.address().port;

/* Headings are rebuilt into one span per word, so rendered text gains spaces
   around punctuation. Compare on words alone so that cannot hide a match. */
const norm = (s) => String(s).replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
const words = (s) => norm(String(s).replace(/<[^>]+>/g, " "))
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const plain = (s) => norm(String(s).replace(/<[^>]+>/g, " "));

const ES = JSON.parse(readFileSync(join(ROOT, "data/i18n/es.json"), "utf8"));
const IT = JSON.parse(readFileSync(join(ROOT, "data/i18n/it.json"), "utf8"));
const LONG = (s) => words(s).split(" ").filter(Boolean).length >= 4;

/* English sources that really do change, long enough to be unambiguous. */
const englishProbes = (dict) => Object.entries(dict)
  .filter(([k, v]) => v !== k && words(k) !== words(v) && LONG(k))
  .map(([k]) => ({ w: words(k), src: plain(k) }));

/* Spanish renderings Italian does not share (and the reverse), for catching
   one language's text surviving on the other's page. */
function crossProbes(a, b) {
  const out = [];
  for (const [k, v] of Object.entries(a)) {
    const other = b[k];
    if (v === k || !LONG(v)) continue;
    if (other === undefined || words(other) === words(v)) continue;
    if (words(v) === words(k)) continue;
    out.push({ w: words(v), src: plain(v) });
  }
  return out;
}

const P = {
  es: englishProbes(ES), it: englishProbes(IT),
  esOnly: crossProbes(ES, IT), itOnly: crossProbes(IT, ES),
};
/* Anything clearly translated — used to spot es/it text left behind in English. */
const translated = [...P.esOnly, ...P.itOnly];

const VERSION = (readFileSync(join(ROOT, "i18n-boot.js"), "utf8")
  .match(/var V = "(v=[0-9a-z]+)"/) || [])[1];

const pw = await import(process.env.PW || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

/* Everything a visitor can read: visible text, the title, the meta cards and
   the attributes the engine translates. */
const READ = () => {
  const parts = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el || el.closest("script,style,noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    parts.push(n.nodeValue || "");
  }
  parts.push(document.title);
  document.querySelectorAll("meta[name='description'],meta[property^='og:'],meta[name^='twitter:']")
    .forEach((m) => parts.push(m.getAttribute("content") || ""));
  document.querySelectorAll("[title],[aria-label],[placeholder],[alt]").forEach((el) => {
    ["title", "aria-label", "placeholder", "alt"].forEach((a) => {
      const v = el.getAttribute(a);
      if (v) parts.push(v);
    });
  });
  /* Each value on its own as well, so a short label can be compared whole —
     a substring search would match "Home" inside a sentence. */
  return { blob: parts.join(" ~ "), nodes: parts };
};

const hits = (text, probes) => {
  const out = [];
  for (const p of probes) if (text.includes(" " + p.w + " ")) out.push(p.src);
  return out;
};

/* Short strings (nav items, tags, buttons) are too short to look for inside a
   page's text without matching by accident, so they are compared as whole
   values instead. */
const NT = JSON.parse(readFileSync(join(ROOT, "data/i18n/no-translate.json"), "utf8"));
/* Every word of a name that stays English on purpose. script.js splits a
   heading into one span per word, so "The European Pivot" puts a bare
   "European" on the page — which is correct, not a missed translation. */
const PINNED = new Set();
for (const n of NT) for (const w of words(n).split(" ")) if (w) PINNED.add(w);

const shortProbes = (dict) => {
  const m = new Map();
  for (const [k, v] of Object.entries(dict)) {
    if (v === k || LONG(k)) continue;
    const w = words(k);
    if (!w || words(v) === w) continue;
    if (w.length < 3) continue;          // "AI" collides with Italian "ai"
    if (w.split(" ").every((t) => PINNED.has(t))) continue;
    if (!m.has(w)) m.set(w, plain(k));
  }
  return m;
};
const SHORT = { es: shortProbes(ES), it: shortProbes(IT) };
const shortHits = (nodes, map) => {
  const out = new Set();
  for (const n of nodes) {
    const w = words(n);
    if (w && map.has(w)) out.add(map.get(w));
  }
  return [...out];
};

const findings = [];
const badVersion = new Set();
const record = (kind, lang, url, list, via) => {
  for (const s of list) findings.push({ kind, lang, url, via, text: s });
};
const watchVersion = (pg) => pg.on("request", (r) => {
  const u = r.url();
  if (u.includes("/i18n/") && !u.includes("?" + VERSION)) badVersion.add(u.split("/").pop());
});

for (const u of urls) {
  /* --- opened directly in each language --- */
  for (const lang of ["es", "it"]) {
    const pg = await browser.newPage({ locale: lang === "es" ? "es-ES" : "it-IT" });
    watchVersion(pg);
    await pg.goto(base + u + "?lang=" + lang, { waitUntil: "load" });
    await pg.waitForTimeout(400);
    const r = await pg.evaluate(READ);
    const t = " " + words(r.blob) + " ";
    record("english", lang, u, hits(t, P[lang]), "load");
    record("english", lang, u, shortHits(r.nodes, SHORT[lang]), "load/short");
    record("crossed", lang, u, hits(t, lang === "es" ? P.itOnly : P.esOnly), "load");
    await pg.close();
  }

  /* --- the switcher, there and back again --- */
  const pg = await browser.newPage({ locale: "en-US" });
  watchVersion(pg);
  await pg.goto(base + u + "?lang=en", { waitUntil: "load" });
  for (const lang of ["es", "it", "en", "it"]) {
    await pg.evaluate((l) => window.FDK_i18n && window.FDK_i18n.set(l), lang);
    await pg.waitForTimeout(320);
    const r = await pg.evaluate(READ);
    const t = " " + words(r.blob) + " ";
    if (lang === "en") {
      record("stale", "en", u, hits(t, translated), "switch");
    } else {
      record("english", lang, u, hits(t, P[lang]), "switch");
      record("english", lang, u, shortHits(r.nodes, SHORT[lang]), "switch/short");
      record("crossed", lang, u, hits(t, lang === "es" ? P.itOnly : P.esOnly), "switch");
    }
  }
  await pg.close();
}
await browser.close(); server.close();

const group = new Map();
for (const f of findings) {
  const k = `${f.kind} · ${f.lang} · ${f.via} · ${f.url}`;
  if (!group.has(k)) group.set(k, new Set());
  group.get(k).add(f.text);
}
for (const [k, set] of [...group].sort().slice(0, 40)) {
  console.log(`\n${k}  (${set.size})`);
  for (const s of [...set].slice(0, 5)) console.log("   · " + s.slice(0, 110));
}
if (group.size > 40) console.log(`\n… and ${group.size - 40} more groups`);
writeFileSync(join(ROOT, "i18n-english-left.json"), JSON.stringify(findings, null, 1));
if (missed.size) console.log("\n404s requested:", [...missed].join(", "));

const count = (kind) => findings.filter((f) => f.kind === kind).length;
console.log(`\n${urls.length} URLs · direct load in es/it · switch en→es→it→en→it`);
console.log(`  english  ${count("english")}   source text still visible in es/it`);
console.log(`  crossed  ${count("crossed")}   one language's text on the other's page`);
console.log(`  stale    ${count("stale")}   es/it text left behind after returning to English`);
console.log(`  version  ${badVersion.size}   dictionaries requested with a stale ?v=`);
process.exit(findings.length + badVersion.size ? 1 : 0);
