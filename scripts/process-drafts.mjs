#!/usr/bin/env node
/* ============================================================================
   THE VELOCITY EDGE — drafts orchestrator (CI entry point)
   Scans drafts/ for pending notes and publishes each one:
     1. If a draft has no --- front-matter and ANTHROPIC_API_KEY is set, run the
        AI formatter (format-draft.mjs --in-place) to structure it.
     2. Publish it (publish-note.mjs): builds /<slug>/index.html, updates posts.js
        and sitemap.xml.
     3. Move the processed draft to drafts/published/.
   Collects the live links into GITHUB_STEP_SUMMARY (when running in Actions).

   Usage:  node scripts/process-drafts.mjs
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const DRAFTS = path.join(ROOT, "drafts");
const PUBLISHED = path.join(DRAFTS, "published");
const SKIP = new Set(["README.md", "TEMPLATE.md"]);
const hasKey = !!process.env.ANTHROPIC_API_KEY;

if (!fs.existsSync(DRAFTS)) { console.log("No drafts/ directory — nothing to do."); process.exit(0); }
fs.mkdirSync(PUBLISHED, { recursive: true });

const pending = fs.readdirSync(DRAFTS)
  .filter((f) => f.endsWith(".md") && !SKIP.has(f))
  .filter((f) => fs.statSync(path.join(DRAFTS, f)).isFile())
  .sort();

if (!pending.length) { console.log("No pending drafts."); process.exit(0); }

const run = (script, extra = []) =>
  execFileSync("node", [path.join("scripts", script), ...extra], { stdio: ["ignore", "inherit", "inherit"], cwd: ROOT });

const published = [];
const failed = [];

// Reject drafts whose title is not a real title — a URL, a bare date, a
// masthead line, or a test note. These are the junk the Telegram pipeline
// produces; they must never reach the live site regardless of which bot sent
// them. Returns a reason string when junk, else null.
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december";
function looksJunkTitle(title) {
  const t = String(title || "").trim();
  if (!t) return "empty title";
  if (/https?:\/\/|chatgpt\.com|libfile_|account_id=/i.test(t)) return "URL as title";
  if (new RegExp("^\\d{1,2}\\s+(" + MONTHS + ")\\s+\\d{4}\\b", "i").test(t)) return "date as title";
  if (new RegExp("^(" + MONTHS + ")\\s+\\d{1,2},?\\s+\\d{4}\\b", "i").test(t)) return "date as title";
  if (/\|\s*fdk\b/i.test(t) || /^the velocity edge\b/i.test(t)) return "masthead as title";
  if (/·.*·.*·/.test(t)) return "section list as title";
  if (/prueba de que est[aá] funcionando|funcionando el publicador/i.test(t)) return "test note";
  return null;
}

for (const file of pending) {
  const rel = path.join("drafts", file);
  console.log(`\n━━━ processing ${rel} ━━━`);
  try {
    const norm = fs.readFileSync(path.join(DRAFTS, file), "utf8").replace(/\r\n/g, "\n");
    const fmMatch = norm.match(/^---\n([\s\S]*?)\n---/);
    const hasFM = !!fmMatch;
    // `format: ai` marks a draft that has pinned front-matter (e.g. a known
    // title/slug from the WhatsApp publisher) but whose body still needs the AI
    // to structure it into the site's blocks. Free-form drafts (no front-matter
    // at all) also go through the formatter.
    const wantsAI = hasFM && /(^|\n)\s*format\s*:\s*ai\b/i.test(fmMatch[1]);

    if (!hasFM || wantsAI) {
      if (!hasKey) {
        if (!hasFM) { console.warn(`⚠ ${file} is free-form but ANTHROPIC_API_KEY is not set — skipping.`); failed.push(file); continue; }
        console.warn(`⚠ ${file} requested 'format: ai' but ANTHROPIC_API_KEY is not set — publishing as plain paragraphs.`);
      } else {
        console.log(hasFM ? "→ pinned draft: running AI formatter (title/slug preserved)…" : "→ free-form draft: running AI formatter…");
        try {
          run("format-draft.mjs", [rel, "--in-place"]);
        } catch (e) {
          // A pinned (format: ai) draft already has valid front-matter + a plain
          // body, so it can still publish as plain paragraphs if the AI step
          // fails — never lose a publish over a transient API error. A free-form
          // draft has no usable front-matter yet, so it must fail here.
          if (!hasFM) throw e;
          console.warn(`⚠ AI formatter failed for ${file}; publishing as plain paragraphs. ${e.message}`);
        }
      }
    }

    // ---- guard: never publish a junk draft ----
    const finalFm = fs.readFileSync(path.join(DRAFTS, file), "utf8").match(/^---\n([\s\S]*?)\n---/);
    const titleLine = finalFm ? ((finalFm[1].match(/(?:^|\n)\s*title\s*:\s*(.+)/) || [])[1] || "").trim() : "";
    const junkReason = looksJunkTitle(titleLine);
    if (junkReason) {
      const REJECTED = path.join(DRAFTS, "rejected");
      fs.mkdirSync(REJECTED, { recursive: true });
      fs.renameSync(path.join(DRAFTS, file), path.join(REJECTED, file));
      console.warn(`⛔ rejected ${file}: ${junkReason} — title ${JSON.stringify(titleLine)} → drafts/rejected/`);
      failed.push(file);
      continue;
    }

    run("publish-note.mjs", [rel]);

    // capture the slug the publisher just added (top entry of posts.js)
    const posts = fs.readFileSync(path.join(ROOT, "posts.js"), "utf8");
    const slug = (posts.match(/url:\s*"\/([^"]+)"/) || [])[1] || "";
    if (slug) published.push({ file, slug, url: `https://fdkempowernet.com/${slug}/` });

    fs.renameSync(path.join(DRAFTS, file), path.join(PUBLISHED, file));
    console.log(`✓ archived → drafts/published/${file}`);
  } catch (e) {
    console.error(`✖ failed on ${file}: ${e.message}`);
    failed.push(file);
  }
}

/* ---- summary (GitHub Actions job summary + stdout) ----------------------- */
const lines = [];
lines.push("## 📰 The Velocity Edge — publish run\n");
if (published.length) {
  lines.push(`Published **${published.length}** note(s):\n`);
  for (const p of published) lines.push(`- [${p.slug}](${p.url}) — from \`${p.file}\``);
} else {
  lines.push("No new notes were published.");
}
if (failed.length) { lines.push(`\n⚠ Skipped/failed: ${failed.map((f) => "`" + f + "`").join(", ")}`); }
const summary = lines.join("\n") + "\n";

console.log("\n" + summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

// signal whether anything changed (for the workflow to decide to commit)
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `published=${published.length}\n`);

process.exit(0);
