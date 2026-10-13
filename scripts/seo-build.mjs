#!/usr/bin/env node
/* Keep the site crawlable for Google Search Console.
   - Every indexable page (no <meta name="robots" content="noindex">) gets a
     self-referencing <link rel="canonical">, inserted after its <title>.
   - sitemap.xml lists exactly the indexable pages: entries whose page is gone
     or noindex are dropped, pages missing from it are appended (lastmod from
     the page's last git commit, else today). Existing entries keep their
     lastmod, changefreq and priority.
   Usage:  node scripts/seo-build.mjs            # write changes
           node scripts/seo-build.mjs --check    # report only, exit 1 if stale */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const BASE = "https://fdkempowernet.com";
const CHECK = process.argv.includes("--check");
const SKIP = new Set(["node_modules", "data", "drafts", "scripts", "i18n", "assets"]);

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!e.name.startsWith(".") && !(dir === ROOT && SKIP.has(e.name))) walk(path.join(dir, e.name));
    } else if (e.name === "index.html") {
      const rel = path.relative(ROOT, dir).split(path.sep).join("/");
      pages.push({ file: path.join(dir, e.name), url: `${BASE}/${rel ? rel + "/" : ""}` });
    }
  }
})(ROOT);

const report = { canonical: [], added: [], removed: [] };
const indexable = new Set();

for (const p of pages) {
  const html = fs.readFileSync(p.file, "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(head)) continue;
  indexable.add(p.url);
  if (/<link[^>]+rel=["']canonical["']/i.test(head)) continue;
  report.canonical.push(p.url);
  if (CHECK) continue;
  const out = html.replace(/^([ \t]*)(<title>[\s\S]*?<\/title>)/m,
    (m, ind, t) => `${ind}${t}\n${ind}<link rel="canonical" href="${p.url}" />`);
  if (out === html) { console.error(`no <title> to anchor canonical: ${p.url}`); process.exit(1); }
  fs.writeFileSync(p.file, out);
}

const lastmod = (url) => {
  const rel = url.slice(BASE.length + 1) + "index.html";
  try {
    const d = execFileSync("git", ["log", "-1", "--format=%cs", "--", rel], { cwd: ROOT, encoding: "utf8" }).trim();
    if (d) return d;
  } catch {}
  return new Date().toISOString().slice(0, 10);
};

const smFile = path.join(ROOT, "sitemap.xml");
const sm = fs.readFileSync(smFile, "utf8");
const listed = new Set();
let body = sm.replace(/[ \t]*<url>[\s\S]*?<\/url>\n?/g, (block) => {
  const loc = (block.match(/<loc>(.*?)<\/loc>/) || [])[1];
  if (loc && indexable.has(loc) && !listed.has(loc)) { listed.add(loc); return block; }
  report.removed.push(loc);
  return "";
});
const fresh = [...indexable].filter((u) => !listed.has(u)).sort();
for (const u of fresh) {
  report.added.push(u);
  body = body.replace("</urlset>",
    `  <url>\n    <loc>${u}</loc>\n    <lastmod>${lastmod(u)}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n</urlset>`);
}
if (!CHECK && body !== sm) fs.writeFileSync(smFile, body);

const n = report.canonical.length + report.added.length + report.removed.length;
for (const [k, v] of Object.entries(report)) for (const u of v) console.log(`${k.padEnd(9)} ${u}`);
console.log(`seo: ${indexable.size} indexable pages · canonical +${report.canonical.length} · sitemap +${report.added.length} −${report.removed.length}`);
if (CHECK && n) process.exit(1);
