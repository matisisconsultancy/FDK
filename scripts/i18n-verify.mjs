#!/usr/bin/env node
/* ============================================================
   FDK · i18n runtime verification

   Loads every page in a real browser with a pseudo-dictionary in
   which every extracted key translates to a marker, then reports
   any visible English that survived. A survivor means the key the
   browser asked for is not the key the extractor produced — the
   one failure mode that silently leaves a page half-translated.

     node scripts/i18n-verify.mjs           (needs playwright)
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { extractAll, extractJS, htmlFiles, noTranslate } from "./i18n-extract.mjs";
import { slugFor } from "./i18n-build.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARK = "✓";     // every translated string becomes a tick

const pw = await import(process.env.PW || "playwright");
const { chromium } = pw.default || pw;

/* ---- pseudo dictionary: key → key with every letter replaced ---- */
const all = extractAll();
for (const k of extractJS().keys()) if (!all.has(k)) all.set(k, null);
for (const k of JSON.parse(readFileSync(join(ROOT, "data/i18n/runtime.json"), "utf8")))
  if (!all.has(k)) all.set(k, null);
const pseudo = {};
for (const k of all.keys()) {
  // keep tags intact so unit replacement still produces valid markup
  pseudo[k] = k.replace(/>([^<]+)</g, (m, t) => ">" + t.replace(/[A-Za-zÀ-ÿ]/g, MARK) + "<")
               .replace(/^([^<]+)/, (t) => t.replace(/[A-Za-zÀ-ÿ]/g, MARK))
               .replace(/([^>]+)$/, (t) => t.replace(/[A-Za-zÀ-ÿ]/g, MARK));
}

const TMP = join(ROOT, ".i18n-verify");
if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(TMP, "i18n"), { recursive: true });
writeFileSync(join(TMP, "i18n", "common.es.js"),
  "window.FDK_I18N=window.FDK_I18N||{};window.FDK_I18N.es=" + JSON.stringify(pseudo) + ";\n");

/* ---- static server: serve the repo, but override /i18n/* ---- */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith("/i18n/")) {
    // one dictionary answers for common + every page file
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(readFileSync(join(TMP, "i18n", "common.es.js")));
    return;
  }
  if (p.endsWith("/")) p += "index.html";
  const file = join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end("no"); return; }
  const ext = p.slice(p.lastIndexOf("."));
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const base = "http://127.0.0.1:" + server.address().port;

const exe = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const page = await browser.newPage({ locale: "es-ES" });
let problems = 0, checked = 0;

for (const f of htmlFiles()) {
  const rel = relative(ROOT, f);
  const url = base + "/" + rel.replace(/index\.html$/, "");
  await page.goto(url + "?lang=es", { waitUntil: "load" });
  await page.waitForTimeout(400);

  const leftovers = await page.evaluate(({ MARK, KEEP }) => {
    const SKIP = ".brand,.footer__email,.jclock,.cmedia__count,.lang-switch,.marquee,.mkt," +
      ".mb-card__px,.mb-card__sym,.mb-chg,.g-delta,.g-spark,.art-stat__num,.stat__num," +
      "[data-no-i18n],[data-count],code,pre,script,style,noscript,svg,canvas";
    const out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const v = n.nodeValue;
      if (!/[A-Za-zÀ-ÿ]/.test(v)) continue;
      if (v.indexOf(MARK) >= 0) continue;          // translated
      const el = n.parentElement;
      if (!el || el.closest(SKIP)) continue;
      if (!el.offsetParent && el.tagName !== "OPTION" &&
          getComputedStyle(el).display === "none") continue;
      const t = v.replace(/\s+/g, " ").trim();
      if (!t || KEEP.indexOf(t) >= 0) continue;   // proper nouns stay as they are
      out.push(t.slice(0, 90));
    }
    return out;
  }, { MARK, KEEP: [...noTranslate()] });

  checked++;
  if (leftovers.length) {
    problems += leftovers.length;
    console.log("\n" + rel + "  (" + leftovers.length + ")");
    for (const l of [...new Set(leftovers)].slice(0, 12)) console.log("   · " + l);
  }
}

await browser.close();
server.close();
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${checked} pages checked · ${problems} untranslated text nodes`);
process.exit(problems ? 1 : 0);
