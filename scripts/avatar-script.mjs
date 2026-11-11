#!/usr/bin/env node
/* ============================================================================
   FDK · Avatar script writer (pilot, phase 1 of AVATAR-PLAN.md)
   ----------------------------------------------------------------------------
   Turns a published note into a short video script for Francesco's declared
   AI avatar: one ~75-second script per language (EN / ES / IT), on-screen
   titles, and a LinkedIn caption, ready to paste into the avatar tool
   (HeyGen, Synthesia, …) during the pilot.

   Nothing is published from here. The output is a draft for Francesco to
   approve: data/avatar/scripts/<slug>.json (machine-readable, for the later
   automated pipeline) and <slug>.md (for a human to read and edit).

   Usage:
     ANTHROPIC_API_KEY=… node scripts/avatar-script.mjs                 # newest note
     ANTHROPIC_API_KEY=… node scripts/avatar-script.mjs <slug>          # a given note
     node scripts/avatar-script.mjs <slug> --dry-run                    # show the input only
   Options: --seconds N (target length, default 75; 45–120)

   Uses the Anthropic Messages API directly (no SDK dependency), like the
   other scripts in this folder.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS = path.join(ROOT, "posts.js");
const DRAFTS = path.join(ROOT, "drafts", "published");
const OUT = path.join(ROOT, "data", "avatar", "scripts");
const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AVATAR_MODEL || "claude-opus-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;
const SITE = "fdkempowernet.com";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const SECONDS = Math.min(120, Math.max(45, Number(opt("--seconds")) || 75));
// Spoken pace: ~150 words a minute in English; Spanish and Italian run a
// little longer for the same idea, so they get the same time, not the same words.
const WORDS = Math.round((SECONDS / 60) * 150);
const slugArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--seconds");

/* ---- the note ----------------------------------------------------------------- */
function loadPosts() {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(POSTS, "utf8"), ctx);
  return ctx.window.FDK_POSTS || [];
}
const slugOf = (p) => String(p.url || "").replace(/^\/+|\/+$/g, "");

function noteText(slug) {
  if (fs.existsSync(DRAFTS)) {
    const f = fs.readdirSync(DRAFTS).filter((x) => x.endsWith(`-${slug}.md`)).sort().pop();
    if (f) return fs.readFileSync(path.join(DRAFTS, f), "utf8");
  }
  const page = path.join(ROOT, slug, "index.html");
  if (!fs.existsSync(page)) return null;
  let h = fs.readFileSync(page, "utf8");
  const a = h.indexOf("<article"), b = h.lastIndexOf("</article>");
  if (a >= 0 && b > a) h = h.slice(a, b);
  return h.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<(p|li|h\d|br|div|tr)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "’").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

/* ---- the brief to the model ---------------------------------------------------- */
const SYSTEM = `You write short video scripts for the declared AI avatar of Francesco De Leo Kaufmann, founder of FDK EmpowerNet — a strategic AI thesis practice for CSOs and CEOs in mobility, energy and telecom. The avatar speaks in Francesco's first person, to senior executives and board members.

Voice: calm, precise, analytical, confident without hype. Short spoken sentences. No jargon the viewer cannot hear at once; no lists read aloud; no emojis. The FDK concepts (Velocity Capitalism, Structural Bifurcation, The Repricing, The Civic Platform, the AI Supercycle) keep their English names in every language.

Structure of each script:
1. Hook — one sentence, at most 15 words, that states the tension of the note.
2. Three beats — what happened, why it matters for capital and strategy, what it changes.
3. The board question — one sentence a CEO should take into the next board meeting.
4. Close — invite the viewer to read the full note on ${SITE}.

Hard rules:
- Use only facts, figures, names and dates that appear in the note. Never add a number, a forecast or a quote of your own. If the note has no figure for something, say it without one.
- No investment advice and no buy/sell language.
- Spanish addresses the viewer as "usted" (never "tú"). Italian uses the formal register. Both must read as native speech written for the ear, not as translations.
- Each language script is about ${WORDS} words in English and the same spoken length in Spanish and Italian (about ${SECONDS} seconds).
- Do not mention that you are an AI inside the script: the disclosure is added on screen and in the caption separately.

Reply with JSON only, no prose and no code fence, in exactly this shape:
{
  "hook_en": "…",
  "scripts": { "en": "…", "es": "…", "it": "…" },
  "on_screen": { "en": ["title 1", "title 2", "title 3"], "es": [ … ], "it": [ … ] },
  "captions": { "en": "…", "es": "…", "it": "…" },
  "hashtags": ["…"],
  "facts_used": ["each figure or named fact the scripts rely on, copied from the note"]
}
on_screen: three short titles (at most 6 words each) shown during the three beats.
captions: a LinkedIn post of 40–80 words that ends with the note's link, which the user message gives you.
hashtags: 3 to 5, no spaces.`;

const DISCLOSURE = {
  en: "AI avatar of Francesco De Leo Kaufmann · script reviewed by FDK EmpowerNet",
  es: "Avatar IA de Francesco De Leo Kaufmann · guion revisado por FDK EmpowerNet",
  it: "Avatar IA di Francesco De Leo Kaufmann · testo rivisto da FDK EmpowerNet",
};

async function ask(note, post) {
  const link = `https://${SITE}/${slugOf(post)}`;
  const body = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    // On a safety decline the API re-runs the request on a fallback model.
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content:
      `Note title: ${post.title}\nSection: ${post.tag || post.slot || ""}\nPublished: ${post.date || ""}\nLink: ${link}\n\n<note>\n${note}\n</note>` }],
  };
  const res = await fetch(API, { method: "POST", headers: {
    "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json",
    "anthropic-beta": "server-side-fallback-2026-07-01",
  }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.stop_reason === "refusal") throw new Error("The model declined this note; write the script by hand.");
  if (data.stop_reason === "max_tokens") throw new Error("The reply was cut off (max_tokens).");
  let out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  return { result: JSON.parse(out), link, model: data.model };
}

/* ---- checks a reviewer should not have to do by eye --------------------------- */
const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
function review(r, note) {
  const warn = [];
  for (const l of ["en", "es", "it"]) {
    const n = words(r.scripts?.[l]);
    if (!n) warn.push(`${l}: script missing`);
    else if (n < WORDS * 0.75 || n > WORDS * 1.35) warn.push(`${l}: ${n} words (target ≈${WORDS})`);
  }
  if (/\btú\b|\btienes\b|\bpuedes\b|\bdebes\b/i.test(r.scripts?.es || "")) warn.push("es: looks like 'tú' — the house register is 'usted'");
  // Every number the scripts say aloud must be in the note.
  const plain = note.replace(/[,\s]/g, "");
  for (const l of ["en", "es", "it"]) {
    for (const num of String(r.scripts?.[l] || "").match(/\d+(?:[.,]\d+)?/g) || []) {
      const bare = num.replace(/,/g, "");
      if (!plain.includes(bare) && !plain.includes(bare.replace(".", ","))) warn.push(`${l}: figure "${num}" not found in the note — check it`);
    }
  }
  return warn;
}

function toMarkdown(post, link, r, warn, model) {
  const L = { en: "English", es: "Español", it: "Italiano" };
  const est = (l) => Math.round((words(r.scripts[l]) / 150) * 60);
  let md = `# Avatar script · ${post.title}\n\n`;
  md += `- Note: ${link}\n- Generated: ${new Date().toISOString()} · ${model}\n- Status: **draft — awaiting Francesco's approval**\n\n`;
  if (warn.length) md += `## ⚠ Check before recording\n\n${warn.map((w) => `- ${w}`).join("\n")}\n\n`;
  for (const l of ["en", "es", "it"]) {
    md += `## ${L[l]} (~${est(l)} s)\n\n${r.scripts[l]}\n\n`;
    md += `**On screen:** ${(r.on_screen?.[l] || []).join(" · ")}\n\n`;
    md += `**Disclosure (always on screen):** ${DISCLOSURE[l]}\n\n`;
    md += `**Caption:**\n\n> ${String(r.captions?.[l] || "").replace(/\n/g, "\n> ")}\n>\n> ${DISCLOSURE[l]}\n\n`;
  }
  md += `**Hashtags:** ${(r.hashtags || []).join(" ")}\n\n`;
  md += `## Facts the scripts rely on\n\n${(r.facts_used || []).map((f) => `- ${f}`).join("\n")}\n`;
  return md;
}

/* ---- main ---------------------------------------------------------------------- */
const posts = loadPosts();
const post = slugArg ? posts.find((p) => slugOf(p) === slugArg.replace(/^\/+|\/+$/g, "")) : posts[0];
if (!post) { console.error(`✖ No note "${slugArg}" in posts.js`); process.exit(1); }
const slug = slugOf(post);
const note = noteText(slug);
if (!note) { console.error(`✖ Cannot read the text of /${slug}`); process.exit(1); }

if (DRY) {
  console.log(`Note: ${post.title} (/${slug}) · ${words(note)} words · target ${SECONDS}s ≈ ${WORDS} words/script\n`);
  console.log(note.slice(0, 1500) + (note.length > 1500 ? "\n…" : ""));
  process.exit(0);
}
if (!KEY) { console.error("✖ ANTHROPIC_API_KEY is not set."); process.exit(1); }

const { result, link, model } = await ask(note, post);
const warn = review(result, note);
fs.mkdirSync(OUT, { recursive: true });
const record = { slug, title: post.title, link, generated: new Date().toISOString(), model,
  seconds: SECONDS, status: "draft", disclosure: DISCLOSURE, warnings: warn, ...result };
fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(record, null, 2) + "\n");
fs.writeFileSync(path.join(OUT, `${slug}.md`), toMarkdown(post, link, result, warn, model));
console.log(`✔ data/avatar/scripts/${slug}.md (+ .json)`);
for (const w of warn) console.log(`  ⚠ ${w}`);
