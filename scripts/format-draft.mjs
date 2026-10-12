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

/* ---- optional pre-set front-matter -------------------------------------------
   A draft may arrive with a small front-matter block that pins editorial fields
   the pipeline must NOT let the model reinvent — most importantly `title` and
   `slug`, so the published link is known up-front (e.g. the WhatsApp publisher
   replies with the live URL before the build runs). We strip that block before
   sending the prose to the model, then force the pinned keys back onto the
   model's output. `format: ai` is just the marker that routed us here — it is
   consumed, not preserved. */
function parseFrontMatter(text) {
  const m = text.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (kv) fm[kv[1].trim()] = kv[2].trim();
  }
  return { fm, body: m[2] };
}

function forceFrontMatter(draft, forced) {
  const m = draft.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return draft;
  const fmLines = m[1].split("\n");
  const body = m[2];
  for (const [k, v] of Object.entries(forced)) {
    if (v == null || v === "") continue;
    const line = `${k}: ${v}`;
    const idx = fmLines.findIndex((l) => new RegExp(`^${k}\\s*:`).test(l));
    if (idx >= 0) { fmLines[idx] = line; continue; }
    const ti = fmLines.findIndex((l) => /^title\s*:/.test(l));
    if (ti >= 0) fmLines.splice(ti + 1, 0, line);
    else fmLines.unshift(line);
  }
  return `---\n${fmLines.join("\n")}\n---\n\n${body.replace(/^\n+/, "")}`;
}

const { fm: preFM, body: preBody } = parseFrontMatter(raw);
const PRESERVE_KEYS = ["title", "slug", "date", "slot", "time", "tag", "dek", "epigraph", "excerpt"];
const preserve = {};
for (const k of PRESERVE_KEYS) if (preFM[k]) preserve[k] = preFM[k];
// The prose the model formats: the body only (never the pinned front-matter).
const prose = preBody.trim() || raw;

/* ---- reading-time limit ("Istruzioni per le note") ----------------------------
   No note goes over 5 minutes of reading (≈1,000 words at 200 words a minute);
   In Focus and The Week Ahead may reach 10 (≈2,000), never more. A longer text
   is condensed by the model to fit. */
const WPM = 200;
const slotName = String(preserve.slot || preFM.slot || "").toLowerCase();
const maxMin = /in focus|week ahead/.test(slotName) ? 10 : 5;
const maxWords = maxMin * WPM;
const srcWords = prose.split(/\s+/).filter(Boolean).length;
const LENGTH_RULE = srcWords > maxWords
  ? `LENGTH: the source is ${srcWords} words; the published note must read in ${maxMin} minutes or less — at most ${maxWords} words of body text. Condense to fit: cut background, repetition and secondary examples first; keep the thesis, every key number and the close.`
  : `LENGTH: the source is ${srcWords} words, within the ${maxMin}-minute limit (${maxWords} words). Keep its length.`;

const SYSTEM = `You are the editorial engine for "The Velocity Edge", a daily market-and-capital
newsletter by Francesco de Leo Kaufmann on the FDK EmpowerNet site. You convert a raw
newsletter text into a structured DRAFT that the site's build script turns into a styled
article page. Output ONLY the draft — no explanation, no code fences, no commentary.

The draft is front-matter (between --- lines) followed by a body of blocks.

FRONT-MATTER (required keys: title, date, slot, dek):
  title:   a short, editorial headline (Title Case). Reuse the newsletter's headline if it has one.
  date:    the edition date as "Month D, YYYY" (e.g. July 18, 2026).
  slot:    one of exactly — Morning Brief, Midday Pulse, The Close, The Week Ahead, In Focus, GVI.
           Use the label on the masthead line ("The Velocity Edge — <Label> | <date> | FDK") if there is one;
           a title starting with "GVI" means GVI. Otherwise infer from the text; default "Morning Brief".
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

THE AUTHOR'S FORMAT (notes are written to "Istruzioni per le note"; map it, never rewrite it):
  - A masthead line "The Velocity Edge — <Label> | <date> | FDK" is metadata: use it for slot/date, never as text.
  - The first 2–3 sentences (the thesis) → the leading paragraphs.
  - Lines "VALUE :: what it is" → the ::stats block, unchanged (at most 4).
  - A short line on its own followed by paragraphs is a section heading → ::section Heading, then its paragraphs.
  - The last line "Velocity Insight: …" → ::close (drop the "Velocity Insight:" prefix).
  - GVI notes: keep the data date and "verified"/"provisional" line in a paragraph, and copy every ranking line
    ("Rank. Name — score (change)", "N/V" included) exactly, as "- " lines in a ::takeaways block per ranking,
    headed with the index name. Never round, re-rank or drop a row.
  - Keep the author's length unless the LENGTH line says to condense: do not add sections, background or
    takeaways the text does not contain. A short note stays short. Never exceed the LENGTH limit. If the text refers to an earlier note of the day, keep that reference as written.

INLINE: **bold**, *italic*, ==green highlight==. Keep it tasteful — a few highlights, not many.

STYLE: authoritative, calm, board-level. Preserve every concrete fact, figure and name from
the source. Do not invent statistics. Structure the piece so it reads like the site's existing
notes: a lead, a data strip, a section or two, a close — using only the blocks the author's text supports.`;

async function ask(messages) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, thinking: { type: "adaptive" }, system: SYSTEM, messages }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`✖ Anthropic API error ${res.status}: ${text}`);
    process.exit(1);
  }
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}
// Words of the draft body — what scripts/publish-note.mjs counts for "N min read".
const bodyWords = (draft) => (draft.replace(/^---\n[\s\S]*?\n---\n?/, "").match(/\S+/g) || []).length;

const ask1 = `${LENGTH_RULE}\n\nConvert this newsletter text into the draft format:\n\n${prose}`;
let out = await ask([{ role: "user", content: ask1 }]);

// The limit is enforced, not just requested: a draft still over it goes back
// to the model to be condensed (twice at most), so no note exceeds its minutes.
for (let round = 1; round <= 2 && out.startsWith("---") && bodyWords(out) > maxWords; round++) {
  const n = bodyWords(out), target = Math.floor(maxWords * 0.9);
  console.error(`… draft is ${n} words, over the ${maxMin}-minute limit (${maxWords}) — condensing (round ${round})`);
  out = await ask([
    { role: "user", content: ask1 },
    { role: "assistant", content: out },
    { role: "user", content: `This draft is ${n} words; the limit is ${maxWords}. Return the same draft condensed to about ${target} words of body text: same front-matter and block format, keep the thesis, every key number and the close; cut background, repetition and secondary examples.` },
  ]);
}
if (out.startsWith("---")) console.error(`✓ body ${bodyWords(out)} words (limit ${maxWords}, ${maxMin} min)`);

if (!out.startsWith("---")) {
  console.error("✖ Model did not return a valid front-matter draft. Got:\n" + out.slice(0, 400));
  process.exit(1);
}

// Pin the pre-set editorial fields (title/slug/date/…) over the model's guesses
// so the published slug/link matches what was promised up-front.
if (Object.keys(preserve).length) {
  out = forceFrontMatter(out, preserve);
  console.error(`✓ preserved front-matter keys: ${Object.keys(preserve).join(", ")}`);
}

if (inPlace) {
  fs.writeFileSync(srcPath, out + "\n");
  console.error(`✓ formatted draft written in place: ${srcPath}`);
} else {
  process.stdout.write(out + "\n");
}
