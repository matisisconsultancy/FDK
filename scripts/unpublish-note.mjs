#!/usr/bin/env node
/* Remove published notes cleanly: the <slug>/ page, the posts.js entry, the
   sitemap.xml <url> block, and the archived drafts/published/*-<slug>.md file.
   Usage:  node scripts/unpublish-note.mjs <slug> [<slug> ...]                */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const slugs = process.argv.slice(2).map((s) => s.replace(/^\/|\/$/g, "").trim()).filter(Boolean);
if (!slugs.length) { console.error("No slugs given."); process.exit(1); }
const slugSet = new Set(slugs);
const report = { dir: [], posts: [], sitemap: [], draft: [], missing: [] };

for (const slug of slugs) {
  const dir = path.join(ROOT, slug);
  if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); report.dir.push(slug); }
  else report.missing.push(slug);
}

// posts.js — drop each object whose url is exactly "/<slug>"
{
  const file = path.join(ROOT, "posts.js");
  let src = fs.readFileSync(file, "utf8");
  const open = src.indexOf("["), close = src.lastIndexOf("]");
  const head = src.slice(0, open + 1), tail = src.slice(close), body = src.slice(open + 1, close);
  const blocks = body.match(/\{[\s\S]*?\n\s*\}/g) || [];
  const kept = blocks.filter((b) => {
    const m = b.match(/url:\s*"\/([^"]+)"/);
    const slug = m ? m[1].replace(/\/$/, "") : null;
    if (slug && slugSet.has(slug)) { report.posts.push(slug); return false; }
    return true;
  });
  fs.writeFileSync(file, head + "\n" + kept.map((b) => "  " + b.trim()).join(",\n") + "\n" + tail + "\n");
}

// sitemap.xml — drop each <url> block for /<slug>/
{
  const file = path.join(ROOT, "sitemap.xml");
  if (fs.existsSync(file)) {
    let src = fs.readFileSync(file, "utf8");
    src = src.replace(/[ \t]*<url>[\s\S]*?<\/url>\n?/g, (block) => {
      const m = block.match(/<loc>https?:\/\/[^<]*?\/([^<\/]+)\/<\/loc>/);
      if (m && slugSet.has(m[1])) { report.sitemap.push(m[1]); return ""; }
      return block;
    });
    fs.writeFileSync(file, src);
  }
}

// drafts/published/*-<slug>.md
{
  const dir = path.join(ROOT, "drafts", "published");
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md")) continue;
      const slug = f.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
      if (slugSet.has(slug)) { fs.rmSync(path.join(dir, f)); report.draft.push(slug); }
    }
  }
}

console.log(`unpublished: dirs=${report.dir.length} posts=${report.posts.length} sitemap=${report.sitemap.length} drafts=${report.draft.length}`);
if (report.missing.length) console.log(`(no page dir for: ${report.missing.join(", ")})`);
