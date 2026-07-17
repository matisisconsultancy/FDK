# 📥 Drafts inbox — The Velocity Edge

Drop a note here and it gets published automatically to
**https://fdkempowernet.com/&lt;slug&gt;/**.

- **Author, free-form way:** just add a file with the raw newsletter text
  (e.g. `2026-07-18-my-note.md`). The AI publisher reads it, formats it into
  the site's style, assigns a cover, and publishes it. You don't need the
  structure below.
- **Deterministic way (no AI):** write the file in the format below and the
  build script turns it into the page exactly. Use this when you want full
  control and zero cost.

Processed drafts are moved to `drafts/published/` automatically.

> **Fully automated:** pushing a `.md` file into `drafts/` triggers the
> `Publish drafts` GitHub Action, which formats it (AI if free-form), builds
> the page, updates `posts.js` + `sitemap.xml`, archives the draft, and pushes
> — GitHub Pages then redeploys with the note live. The free-form (AI) path
> needs an `ANTHROPIC_API_KEY` repository secret.

---

## Format (deterministic)

A draft is a `.md` file with a front-matter block and a body.

```
---
title: The New Alpha
date: July 17, 2026
slot: Morning View
dek: The next trillion dollars will not be created by better technology. They will be created by **higher productivity**.
image: https://images.unsplash.com/photo-XXXXXXXX?auto=format&fit=crop&w=800&q=80   # optional — auto-assigned from scripts/cover-pool.json if omitted
tag: Macro · Productivity          # optional (appended after the slot)
epigraph: Technology is no longer the scarce resource. Productivity is.   # optional
excerpt: One-line summary for the card.   # optional (defaults to the dek)
read: 8 min read                   # optional (auto-estimated)
---

The first paragraph here becomes the article **lead**. Write it like the
opening of the newsletter.

Any following plain paragraphs render as normal body text.

::stats
$650B+ :: global AI infrastructure investment cycle
$60B :: new SoftBank financing for the next cycle
450M :: consumers in Europe's single market
Invent → ==Industrialize== :: the shift that defines the winners

::pull The fundamental question
Which economy converts intelligence into productivity — and productivity into earnings — ==the fastest?==

::signals Five signals | Tap each signal to expand the read.
# AI is becoming economic infrastructure
China is competing to make AI the operating system of its economy...
signal: The AI race is quietly becoming a productivity race.
# Energy has become the hidden valuation multiple
Every AI factory needs electricity...
signal: Energy is no longer an input — it is a valuation premium.

::patterns The hidden pattern | The structure underneath.
# The cost of intelligence keeps falling
Inference costs decline, compute efficiency improves...
# Its value rises faster than its cost
Deploying intelligence across the real economy creates rising value...

::section Pricing an economic separation | From value to productivity.
Markets still believe they are pricing an AI revolution...

::takeaways Key takeaways | What to carry into the next session
- The next AI winners will be countries, not simply companies.
- Europe is evolving from a value story into a productivity story.

::close
Technology is no longer the scarce resource. Productivity is. ==That is the new alpha.==
```

### Inline formatting
- `**bold**` → **bold**
- `*italic*` → *italic*
- `==green==` → brand-green highlight

### Blocks (all optional, any order)
| Block | Renders as |
|---|---|
| leading paragraphs | lead + body text |
| `::stats` | the 4-tile data strip (`value :: caption`) |
| `::pull LABEL` | pull-quote |
| `::signals HEADING \| hint` | numbered accordion (`# Title` + text + `signal:`) |
| `::patterns HEADING \| hint` | card grid (`# Title` + text; `# [45%] Title` for a badge) |
| `::section HEADING \| hint` | a numbered section header |
| `::takeaways LABEL \| subhead` | bulleted list |
| `::para` | plain paragraphs |
| `::close` | the closing line |

### Slots (set day/night + time automatically)
`Morning View`, `Morning Note`, `Today's Edition`, `The Week Ahead`,
`Breaking News` → **day** · `Night Briefing`, `Evening Note`, `The Close` → **night**

---

## Publish manually (from the repo)
```bash
node scripts/publish-note.mjs drafts/2026-07-18-my-note.md --dry-run   # check
node scripts/publish-note.mjs drafts/2026-07-18-my-note.md             # publish
```
