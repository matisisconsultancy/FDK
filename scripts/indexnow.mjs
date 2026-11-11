#!/usr/bin/env node
/* ============================================================
   IndexNow submitter · fdkempowernet.com
   Pings participating search engines (Bing, Yandex, Seznam,
   Naver, …) the instant a page is published or changed, so they
   crawl it within minutes instead of waiting for the next sweep.
   Google does NOT use IndexNow — it is covered by sitemap.xml.

   The key is PUBLIC by design: it is also served at
   https://fdkempowernet.com/<KEY>.txt so the engines can verify
   ownership. It is not a secret.

   Usage:
     node scripts/indexnow.mjs --sitemap              submit every URL in sitemap.xml
     node scripts/indexnow.mjs --changed <files...>   map changed index.html paths → URLs
     node scripts/indexnow.mjs --urls <url...>         submit explicit URLs
   Only URLs present in sitemap.xml are ever submitted, so noindex
   / internal pages are skipped automatically.
   ============================================================ */
import { readFile } from "node:fs/promises";

const HOST = "fdkempowernet.com";
const ORIGIN = `https://${HOST}`;
const KEY = process.env.INDEXNOW_KEY || "f246d5a2a1e70070b904042b178dd3b6";
const KEY_LOCATION = `${ORIGIN}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Map a repo file path to its canonical site URL (null if not a page). */
function fileToUrl(p) {
  const s = p.replace(/^\.?\/+/, "").trim();
  if (s === "index.html") return `${ORIGIN}/`;
  if (s.endsWith("/index.html")) return `${ORIGIN}/${s.slice(0, -"index.html".length)}`;
  return null;
}

async function sitemapUrls() {
  try {
    const xml = await readFile("sitemap.xml", "utf8");
    return new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()));
  } catch {
    return new Set();
  }
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  const inSitemap = await sitemapUrls();

  let urls = [];
  if (mode === "--sitemap") {
    urls = [...inSitemap];
  } else if (mode === "--urls") {
    urls = rest.filter((u) => inSitemap.has(u));
  } else if (mode === "--changed") {
    urls = rest.map(fileToUrl).filter((u) => u && inSitemap.has(u));
  } else {
    console.error("usage: --sitemap | --changed <files...> | --urls <urls...>");
    process.exit(2);
  }

  urls = [...new Set(urls)].filter((u) => u.startsWith(ORIGIN)).slice(0, 10000);
  if (!urls.length) {
    console.log("IndexNow: no indexable URLs to submit.");
    return;
  }
  if (!KEY) {
    console.error("IndexNow: key is empty.");
    process.exit(1);
  }

  const body = { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const txt = (await res.text().catch(() => "")).slice(0, 300);
  console.log(`IndexNow: submitted ${urls.length} URL(s) → HTTP ${res.status} ${res.statusText} ${txt}`.trim());
  // 200 = accepted, 202 = accepted/validation pending. Anything else is a failure.
  if (![200, 202].includes(res.status)) process.exit(1);
}

main().catch((e) => {
  console.error("IndexNow error:", e);
  process.exit(1);
});
