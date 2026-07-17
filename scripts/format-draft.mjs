#!/usr/bin/env node
/* ============================================================================
   THE VELOCITY EDGE — AI draft formatter
   Turns a free-form newsletter text into the deterministic draft format that
   scripts/publish-note.mjs consumes. Uses the Anthropic Messages API directly
   (no SDK dependency) with the Node 20+ built-in fetch.

   Usage:
     ANTHROPIC_API_KEY=sk-... node scripts/format-draft.mjs drafts/raw.md
       → writes the formatted draft to stdout
     ANTHROPIC_API_KEY=sk-... node scripts/format-draft.mjs drafts/raw.md --in-place
       → overwrites drafts/raw.md with the formatted draft

   Requires: ANTHROPIC_API_KEY in the environment.
   ============================================================================ */
import fs from "node:fs";

const MODEL = "claude-opus-4-8";
const API = "https://api.anthropic.com/v1/messages";

const args = process.argv.slice(2);
const inPlace = args.includes("--in-place");
const srcPath = args.find((a) => !a.startsWith("--"));
if (!srcPath) { console.error("Usage: node scripts/format-draft.mjs <raw.md> [--in-place]"); process.exit(1); }

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error("✖ ANTHROPIC_API_KEY is not set — cannot run the AI formatter."); process.exit(1); }

const raw = fs.readFileSync(srcPath, "utf8");

const SYSTEM = `You are the editorial engine for "The Velocity Edge", a daily market-and-capital
newsletter by Francesco de Leo Kaufmann on the FDK EmpowerNet site. You convert a raw
newsletter text into a structured DRAFT that the site's build script turns into a styled
article page. Output ONLY the draft — no explanation, no code fences, no commentary.

The draft is front-matter (between --- lines) followed by a body of blocks.

FRONT-MATTER (required keys: title, date, slot, dek):
  title:   a short, editorial headline (Title Case). Reuse the newsletter's headline if it has one.
  date:    the edition date as "Month D, YYYY" (e.g. July 18, 2026).
  slot:    one of exactly — Morning View, Morning Note, Today's Edition, The Week Ahead,
           Breaking News, Night Briefing, Evening Note, The Close. Infer from the text; default "Morning View".
  dek:     one-sentence standfirst; you may use **bold** and ==green== inline emphasis.
  tag:     OPTIONAL single topical word/phrase appended after the slot (e.g. "Macro", "Capital", "Energy").
  epigraph: OPTIONAL one-line quotable epigraph.
  excerpt: OPTIONAL plain one-line card summary (no markup). Defaults to the dek.
  DO NOT set an "image" key — the build assigns a cover automatically.

BODY BLOCKS (all optional, use only what the material supports, keep the author's meaning):
  - Leading paragraphs (before any :: block): the first becomes the article lead; write 1–3.
  - ::stats  → up to 4 lines of "VALUE :: caption" (a data strip). Use real figures from the text.
  - ::pull LABEL  → one punchy pull-quote paragraph.
  - ::signals Heading | hint  → a numbered accordion. Repeat per item:
        # Signal title
        one or two paragraphs of explanation
        signal: one-line takeaway
  - ::patterns Heading | hint  → card grid. Repeat per card:  "# Card title" then a paragraph.
        Use "# [45%] Title" to show a badge/number.
  - ::section Heading | hint  → a numbered section header, followed by paragraphs.
  - ::takeaways Key takeaways | subhead  → bullet lines starting with "- ".
  - ::close  → the final closing line (may use ==green==).

INLINE: **bold**, *italic*, ==green highlight==. Keep it tasteful — a few highlights, not many.

STYLE: authoritative, calm, board-level. Preserve every concrete fact, figure and name from
the source. Do not invent statistics. Structure the piece so it reads like the site's existing
notes: a lead, a data strip, a few signals or a section or two, key takeaways, a close.`;

const body = {
  model: MODEL,
  max_tokens: 8000,
  thinking: { type: "adaptive" },
  system: SYSTEM,
  messages: [
    { role: "user", content: `Convert this newsletter text into the draft format:\n\n${raw}` },
  ],
};

const res = await fetch(API, {
  method: "POST",
  headers: {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`✖ Anthropic API error ${res.status}: ${text}`);
  process.exit(1);
}

const data = await res.json();
const out = (data.content || [])
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("")
  .trim()
  .replace(/^```[a-z]*\n?/i, "")
  .replace(/\n?```$/i, "")
  .trim();

if (!out.startsWith("---")) {
  console.error("✖ Model did not return a valid front-matter draft. Got:\n" + out.slice(0, 400));
  process.exit(1);
}

if (inPlace) {
  fs.writeFileSync(srcPath, out + "\n");
  console.error(`✓ formatted draft written in place: ${srcPath}`);
} else {
  process.stdout.write(out + "\n");
}
