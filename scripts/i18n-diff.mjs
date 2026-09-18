#!/usr/bin/env node
/* ============================================================
   FDK · i18n cross-language diff

   Renders every URL in en / es / it with the REAL dictionaries and
   reports each visible text node that did NOT change between English
   and the target language.

   This is deliberately different from scripts/i18n-verify.mjs, which
   derives its skip list from the engine's own constants and therefore
   cannot see a string the engine wrongly skips, nor a dictionary entry
   whose "translation" is just the English again. This one has no skip
   list at all: it measures the only thing a reader notices — did the
   words change when the language did?

   Expect brand names, book titles, tickers, company names and figures
   in the output. Anything else is a bug.

     PW=/path/to/playwright node scripts/i18n-diff.mjs
   ============================================================ */
import { createServer } from "node:http";
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE = new Set([".git", "node_modules", "assets", "drafts", "data", ".github", "forms", ".i18n-verify"]);
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".svg":"image/svg+xml", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".png":"image/png",
  ".ico":"image/x-icon", ".woff2":"font/woff2", ".xml":"application/xml", ".txt":"text/plain" };

const urls = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    if (IGNORE.has(n)) continue;
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n === "index.html") urls.push("/" + relative(ROOT, p).replace(/index\.html$/, ""));
    else if (n.endsWith(".html")) urls.push("/" + relative(ROOT, p));
  }
})(ROOT);
urls.sort();

const missing = new Set();
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = join(ROOT, p);
  if (!f.startsWith(ROOT) || !existsSync(f)) { missing.add(p); res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "Content-Type": MIME[p.slice(p.lastIndexOf("."))] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, r));
const base = "http://127.0.0.1:" + server.address().port;

const pw = await import(process.env.PW || "playwright");
const { chromium } = pw.default || pw;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

const SNAP = () => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n, i = 0;
  while ((n = w.nextNode())) {
    const v = (n.nodeValue || "").replace(/\s+/g, " ").trim();
    i++;
    if (!v) continue;
    const el = n.parentElement;
    if (!el) continue;
    if (el.closest("script,style,noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    let path = [], e = el;
    while (e && e !== document.body) {
      path.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === "string"
        ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""));
      e = e.parentElement;
    }
    out.push({ i, v, sel: path.slice(-3).join(">") });
  }
  return out;
};

const report = [];
let checked = 0;
for (const u of urls) {
  const snaps = {};
  for (const lang of ["en", "es", "it"]) {
    const pg = await browser.newPage({ locale: lang === "en" ? "en-US" : lang === "es" ? "es-ES" : "it-IT" });
    await pg.goto(base + u + "?lang=" + lang, { waitUntil: "load" });
    await pg.waitForTimeout(450);
    snaps[lang] = await pg.evaluate(SNAP);
    await pg.close();
  }
  checked++;
  const byIdx = (arr) => { const m = new Map(); for (const o of arr) m.set(o.i, o); return m; };
  const en = byIdx(snaps.en), es = byIdx(snaps.es), it = byIdx(snaps.it);
  for (const [i, o] of en) {
    const e = es.get(i), t = it.get(i);
    const sameEs = e && e.v === o.v, sameIt = t && t.v === o.v;
    if (!sameEs && !sameIt) continue;
    if (!/[A-Za-zÀ-ÿ]{2}/.test(o.v)) continue;       // no real words
    report.push({ url: u, sel: o.sel, text: o.v, es: sameEs, it: sameIt });
  }
}
await browser.close(); server.close();

writeFileSync(join(ROOT, "i18n-unchanged.json"),
  JSON.stringify(report, null, 1));
const uniq = new Map();
for (const r of report) uniq.set(r.text, (uniq.get(r.text) || 0) + 1);
console.log(`${checked} URLs · ${report.length} unchanged text nodes · ${uniq.size} distinct strings`);
if (missing.size) console.log("404s requested:", [...missing].join(", "));
console.log("\n--- top distinct strings ---");
[...uniq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)
  .forEach(([t, c]) => console.log(String(c).padStart(4), " " + t.slice(0, 110)));
