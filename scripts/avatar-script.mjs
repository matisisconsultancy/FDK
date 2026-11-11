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
     node scripts/avatar-script.mjs <slug> --recheck                    # re-check after a hand edit
   Options: --seconds N (target length, default 75; 45–120)

   Uses the Anthropic Messages API directly (no SDK dependency), like the
   other scripts in this folder.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { SCRIPTS_DIR, SITE, WPM, DISCLOSURE, loadPosts, slugOf, noteText, words, review, saveRecord } from "./avatar-lib.mjs";

const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.AVATAR_MODEL || "claude-opus-5-5";
const KEY = process.env.ANTHROPIC_API_KEY;

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DRY = args.includes("--dry-run");
const RECHECK = args.includes("--recheck");
const SECONDS = Math.min(120, Math.max(45, Number(opt("--seconds")) || 75));
// Spoken pace: ~150 words a minute in English; Spanish and Italian run a
// little longer for the same idea, so they get the same time, not the same words.
const WORDS = Math.round((SECONDS / 60) * WPM);
const slugArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--seconds");

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

/* ---- main ---------------------------------------------------------------------- */
const posts = loadPosts();
const post = slugArg ? posts.find((p) => slugOf(p) === slugArg.replace(/^\/+|\/+$/g, "")) : posts[0];
if (!post) { console.error(`✖ No note "${slugArg}" in posts.js`); process.exit(1); }
const slug = slugOf(post);
const note = noteText(slug);
if (!note) { console.error(`✖ Cannot read the text of /${slug}`); process.exit(1); }

if (RECHECK) {
  // After editing a script by hand: re-run the checks and rewrite the .md.
  const f = path.join(SCRIPTS_DIR, `${slug}.json`);
  if (!fs.existsSync(f)) { console.error(`✖ No script yet for /${slug}`); process.exit(1); }
  const rec = JSON.parse(fs.readFileSync(f, "utf8"));
  rec.warnings = review(rec, note, Math.round(((rec.seconds || SECONDS) / 60) * WPM));
  saveRecord(rec);
  console.log(`✔ rechecked data/avatar/scripts/${slug}.md`);
  for (const w of rec.warnings) console.log(`  ⚠ ${w}`);
  process.exit(0);
}
if (DRY) {
  console.log(`Note: ${post.title} (/${slug}) · ${words(note)} words · target ${SECONDS}s ≈ ${WORDS} words/script\n`);
  console.log(note.slice(0, 1500) + (note.length > 1500 ? "\n…" : ""));
  process.exit(0);
}
if (!KEY) { console.error("✖ ANTHROPIC_API_KEY is not set."); process.exit(1); }

const { result, link, model } = await ask(note, post);
const rec = { slug, title: post.title, link, generated: new Date().toISOString(), model,
  seconds: SECONDS, status: "draft", disclosure: DISCLOSURE, ...result };
rec.warnings = review(rec, note, WORDS);
saveRecord(rec);
console.log(`✔ data/avatar/scripts/${slug}.md (+ .json)`);
for (const w of rec.warnings) console.log(`  ⚠ ${w}`);
