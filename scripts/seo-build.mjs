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

/* ---- sharing cards + structured data -----------------------------------
   Each indexable page carries one generated block between SEO-META markers:
   the Open Graph / Twitter tags its head does not already declare, and a
   JSON-LD description (Article for notes, Book for the book pages, the
   Organization and its author on the home). Rebuilt on every run, so a
   changed title, description or cover follows on the next publish. */
const META_BLOCK = /\n?[ \t]*<!-- SEO-META[\s\S]*?<!-- \/SEO-META -->/;
const posts = (() => { const w = {}; try { new Function("window", fs.readFileSync(path.join(ROOT, "posts.js"), "utf8"))(w); } catch {} return w.FDK_POSTS || []; })();
const postByUrl = new Map(posts.map((p) => [`${BASE}${p.url.replace(/\/?$/, "/")}`, p]));
const BOOKS = {
  "the-rise-of-velocity": "the-rise-of-velocity-cover.jpg",
  "the-age-of-intelligent-motion": "the-age-of-intelligent-motion-cover.jpg",
  "the-european-pivot": "european-pivot-cover.jpg",
};
const AUTHOR = { "@type": "Person", name: "Francesco De Leo Kaufmann", url: `${BASE}/thesis/` };
const ORG = { "@type": "Organization", name: "FDK EmpowerNet", url: `${BASE}/`, logo: `${BASE}/assets/fdk-lobby.jpg` };
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const unattr = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const madridIso = (dateStr, time) => {
  const d = new Date(`${dateStr} 12:00 UTC`); if (isNaN(d)) return null;
  const ymd = d.toISOString().slice(0, 10), hm = /^\d{1,2}:\d{2}$/.test(time || "") ? time.padStart(5, "0") : "08:00";
  // Europe/Madrid offset on that day (CET +01:00 / CEST +02:00)
  const off = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", timeZoneName: "shortOffset" }).formatToParts(d).find((x) => x.type === "timeZoneName")?.value || "GMT+1";
  const h = Number((off.match(/[+-]\d+/) || ["+1"])[0]);
  return `${ymd}T${hm}:00${h < 0 ? "-" : "+"}${String(Math.abs(h)).padStart(2, "0")}:00`;
};
function metaBlock(url, head) {
  const title = unattr((head.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "FDK EmpowerNet").trim();
  const desc = unattr((head.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "").trim();
  const slug = url.slice(BASE.length + 1).replace(/\/$/, "");
  const post = postByUrl.get(url);
  let image = `${BASE}/assets/fdk-lobby.jpg`, type = "website", ld = null;
  const extra = [];
  if (post) {
    type = "article";
    if (/^https?:\/\//.test(post.image || "")) image = post.image.replace(/([?&])w=\d+/, "$1w=1200");
    else if (post.image) image = BASE + post.image;
    const when = madridIso(post.date, post.time);
    if (when) extra.push(["property", "article:published_time", when]);
    extra.push(["property", "article:author", AUTHOR.name], ["property", "article:section", post.slot || "The Velocity Edge"]);
    ld = { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: desc || post.excerpt, image: [image],
      datePublished: when || undefined, author: AUTHOR, publisher: ORG, mainEntityOfPage: url, inLanguage: "en",
      isPartOf: { "@type": "Periodical", name: "The Velocity Edge", url: `${BASE}/velocityedge/` } };
  } else if (BOOKS[slug]) {
    type = "book"; image = `${BASE}/assets/${BOOKS[slug]}`;
    ld = { "@context": "https://schema.org", "@type": "Book", name: title.split(" · ")[0], description: desc, image, author: AUTHOR, url, inLanguage: "en" };
  } else if (slug === "") {
    ld = { "@context": "https://schema.org", "@graph": [
      { ...ORG, "@id": `${BASE}/#org`, founder: AUTHOR, description: desc },
      { "@type": "WebSite", "@id": `${BASE}/#site`, name: "FDK EmpowerNet", url: `${BASE}/`, publisher: { "@id": `${BASE}/#org` } }] };
  } else if (slug === "thesis") {
    ld = { "@context": "https://schema.org", "@type": "ProfilePage", url, mainEntity: { ...AUTHOR, image: `${BASE}/assets/fdk-founder.jpg`, worksFor: ORG } };
  }
  const tags = [
    ["property", "og:site_name", "FDK EmpowerNet"], ["property", "og:type", type], ["property", "og:title", post ? post.title : title],
    ["property", "og:description", desc], ["property", "og:url", url], ["property", "og:image", image],
    ...extra,
    ["name", "twitter:card", "summary_large_image"], ["name", "twitter:title", post ? post.title : title],
    ["name", "twitter:description", desc], ["name", "twitter:image", image],
  ].filter(([k, n, v]) => v && !new RegExp(`${k}=["']${n.replace(/[:.]/g, "\\$&")}["']`).test(head));
  const lines = tags.map(([k, n, v]) => `  <meta ${k}="${n}" content="${attr(v)}" />`);
  if (ld) lines.push(`  <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`);
  return lines.length ? `\n  <!-- SEO-META · generated by scripts/seo-build.mjs -->\n${lines.join("\n")}\n  <!-- /SEO-META -->` : "";
}
report.meta = [];
for (const p of pages) {
  if (!indexable.has(p.url)) continue;
  const html = fs.readFileSync(p.file, "utf8");
  const bare = html.replace(META_BLOCK, "");
  const head = bare.slice(0, bare.indexOf("</head>"));
  const block = metaBlock(p.url, head);
  const out = bare.replace(/(<link rel="canonical"[^>]*>)/, (m) => m + block);
  if (out === html) continue;
  report.meta.push(p.url);
  if (!CHECK) fs.writeFileSync(p.file, out);
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
