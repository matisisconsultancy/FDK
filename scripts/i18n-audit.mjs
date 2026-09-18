#!/usr/bin/env node
/* ============================================================
   FDK · i18n page audit

   Renders every URL in es and it with the REAL built dictionaries
   and looks for English that survived, by searching the page's
   visible text for the English source strings themselves.

   It exists because the other two checks each have a blind spot:
     · i18n-verify.mjs serves one pseudo-dictionary for every
       /i18n/* request, so it never proves a string reached the
       page file the browser actually asks for.
     · i18n-diff.mjs pairs text nodes across languages by index,
       and script.js splits headings into one span per word — a
       heading whose word count changes when translated shifts
       every later index, hiding the rest of the page.

   This one matches on content, so nothing downstream can hide.

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

const norm = (s) => s.replace(/\s+/g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').trim();
/* Headings are split into one span per word, so the rendered text gains
   spaces around punctuation. Compare on words alone so that cannot hide
   a match. */
const words = (s) => norm(s.replace(/<[^>]+>/g, " "))
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const strip = (s) => words(s);

/* English sources that have a real translation, long enough that an
   accidental match is not credible. */
function probes(lang) {
  const dict = JSON.parse(readFileSync(join(ROOT, "data", "i18n", `${lang}.json`), "utf8"));
  const out = [];
  for (const [k, v] of Object.entries(dict)) {
    if (v === k) continue;                       // identical by nature
    const en = strip(k), tr = strip(v);
    if (en === tr) continue;
    if (en.split(" ").length < 3) continue;      // too short to be safe
    out.push({ en, tr, src: norm(k.replace(/<[^>]+>/g, " ")) });
  }
  return out.sort((a, b) => b.en.length - a.en.length);
}

const pw = await import(process.env.PW || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const TEXT = () => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const parts = []; let n;
  while ((n = w.nextNode())) {
    const el = n.parentElement;
    if (!el || el.closest("script,style,noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    parts.push(n.nodeValue || "");
  }
  return parts.join(" ");
};

/* ---------------------------------------------------------------
   Phase 2 runs first so a failure here is not buried: the language
   SWITCH, which loads dictionaries through i18n.js rather than
   i18n-boot.js. A page opened directly at ?lang=es never touches
   that path, which is how a stale cache key in i18n.js survived
   every earlier check while making each switch serve a months-old
   dictionary from cache.
   --------------------------------------------------------------- */
const VERSION = (readFileSync(join(ROOT, "i18n-boot.js"), "utf8")
  .match(/var V = "(v=[0-9a-z]+)"/) || [])[1];
const switchFindings = [], badVersion = new Set();
{
  const P = { es: probes("es"), it: probes("it") };
  for (const u of urls) {
    const pg = await browser.newPage({ locale: "en-US" });
    pg.on("request", (r) => {
      const url = r.url();
      if (url.includes("/i18n/") && !url.includes("?" + VERSION)) badVersion.add(url.split("/").pop());
    });
    await pg.goto(base + u + "?lang=en", { waitUntil: "load" });
    for (const lang of ["es", "it"]) {
      await pg.evaluate((l) => window.FDK_i18n && window.FDK_i18n.set(l), lang);
      await pg.waitForTimeout(350);
      const text = " " + words(await pg.evaluate(TEXT)) + " ";
      for (const { en, src } of P[lang])
        if (text.includes(" " + en + " ")) switchFindings.push({ lang, url: u, en: src });
    }
    await pg.close();
  }
}

const findings = [];
for (const lang of ["es", "it"]) {
  const P = probes(lang);
  for (const u of urls) {
    const pg = await browser.newPage({ locale: lang === "es" ? "es-ES" : "it-IT" });
    await pg.goto(base + u + "?lang=" + lang, { waitUntil: "load" });
    await pg.waitForTimeout(400);
    const text = " " + words(await pg.evaluate(TEXT)) + " ";
    await pg.close();
    for (const { en, src } of P) if (text.includes(" " + en + " ")) findings.push({ lang, url: u, en: src });
  }
}
await browser.close(); server.close();

const byUrl = new Map();
for (const f of findings) {
  const k = `${f.lang} ${f.url}`;
  if (!byUrl.has(k)) byUrl.set(k, []);
  byUrl.get(k).push(f.en);
}
for (const [k, list] of [...byUrl].sort()) {
  console.log(`\n${k}  (${list.length})`);
  for (const s of list.slice(0, 6)) console.log("   · " + s.slice(0, 110));
}
const swByUrl = new Map();
for (const f of switchFindings) {
  const k = `${f.lang} ${f.url}`;
  if (!swByUrl.has(k)) swByUrl.set(k, []);
  swByUrl.get(k).push(f.en);
}
if (swByUrl.size) {
  console.log("\n--- after switching language in the page ---");
  for (const [k, list] of [...swByUrl].sort().slice(0, 12)) {
    console.log(`\n${k}  (${list.length})`);
    for (const s2 of list.slice(0, 4)) console.log("   \u00b7 " + s2.slice(0, 100));
  }
}
if (badVersion.size)
  console.log("\ndictionaries requested with a stale cache key:", [...badVersion].join(", "));
writeFileSync(join(ROOT, "i18n-english-left.json"),
  JSON.stringify({ onLoad: findings, onSwitch: switchFindings, badVersion: [...badVersion] }, null, 1));
if (missed.size) console.log("\n404s requested:", [...missed].join(", "));
console.log(`\n${urls.length} URLs \u00d7 2 languages`);
console.log(`  on load    ${findings.length} English strings still rendered`);
console.log(`  on switch  ${switchFindings.length} English strings still rendered`);
if (badVersion.size) console.log(`  stale cache keys: ${[...badVersion].join(", ")}`);
process.exit(findings.length + switchFindings.length + badVersion.size ? 1 : 0);
