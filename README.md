# FDK EmpowerNet · Modern rebuild

A modern, dynamic rebuild of **fdkempowernet.com** — the strategic AI thesis
practice for CSOs and CEOs in mobility, energy and telecom facing board-level
AI decisions.

Built as a dependency-free static site (HTML + CSS + vanilla JS) so it loads
fast and deploys anywhere (GitHub Pages, Netlify, Vercel, S3, …).

## ✨ What's inside

- **Brand-accurate design** — FDK navy (`#141a4e`) + green (`#2ee06a`), animated
  green→teal→blue→purple hero gradient, light-weight display typography.
- **Sections** (matching the source site):
  - Hero — *"The strategic thesis your board doesn't have yet."*
  - Four concepts — Velocity Capitalism, Structural Bifurcation, The Repricing,
    The Civic Platform.
  - *"The board is moving but the thesis is missing"* — three insight cards.
  - Founder — Francesco de Leo Kaufmann.
  - Intelligence Library — briefing cards.
  - Contact — *Request an Executive Briefing* form.
- **Dynamic touches** — animated hero gradient, scroll-reveal (IntersectionObserver),
  reading-progress bar, smart sticky navbar + mobile menu, hover micro-interactions.
- **Responsive** and accessible (respects `prefers-reduced-motion`).

## 📁 Structure

```
index.html    →  Home (animated-canvas hero, statement, concepts, manifesto band,
                 the-gap, founder teaser, BOOK LAUNCH, library, contact)
thesis.html   →  Thesis + Author (split hero, thesis architecture, founder bio,
                 experience table, academic background)
book.html     →  The Book — Velocity Capitalism (3D cover, chapters, excerpt with
                 sample download, buy links: Amazon / Apple / Google Play / Kobo)
styles.css    →  Styling, animations, responsive (shared)
script.js     →  Hero canvas, cursor ring, masked reveals, parallax, sticky,
                 book sample download, form (shared)
.nojekyll     →  Tells GitHub Pages to serve files as-is (no Jekyll build)
```

> **The book** (`Velocity Capitalism`) is placeholder content built on FDK's own
> thesis — swap the title, cover text and the four buy-link URLs (`book.html`,
> search for `#buy`) for the real listings when they're live. "Download a sample"
> generates a `.txt` excerpt client-side; replace with a real PDF if preferred.

## 🌍 Languages (EN · ES · IT)

Four checks. **`i18n-audit.mjs` is the one that decides** — two of the
others have a blind spot that let real mixing through:

- `node scripts/i18n-audit.mjs` — renders every URL with the real built
  dictionaries and searches the visible text for the source strings
  themselves, so nothing upstream can hide a failure downstream. It
  covers both ways a visitor gets a language — opening the page in it
  (`i18n-boot.js`) and picking it from the switcher (`i18n.js`) — and
  walks the whole matrix, `en→es→it→en→it`, including returning to
  English and switching twice. It reads text, `<title>`, the meta cards
  and the translatable attributes, and reports four faults: English left
  in `es`/`it`, Spanish on an Italian page or the reverse, `es`/`it` text
  left behind after returning to English, and any dictionary requested
  with a stale `?v=`. Strings under four words are compared as whole
  values rather than searched for, so a nav label is covered without
  "Home" matching inside a sentence.
- `node scripts/i18n-lint.mjs` — checks the translations themselves,
  which the audit cannot: it only sees whether a string changed
  language, not whether the same idea is worded the same way on every
  page. Markup parity (a translation must carry exactly its source's
  tags), the house wording for recurring terms, and the Spanish
  register — the site addresses the reader as *usted* throughout.
- `node scripts/i18n-verify.mjs` — asks whether the key the browser
  requests is the key the extractor produced. Blind spot: it answers
  every `/i18n/*` request with one pseudo-dictionary, so it never
  proves a string reached the page file the browser actually asks for.
- `node scripts/i18n-diff.mjs` — renders every URL in all three
  languages and reports text that did **not** change. Brand names,
  book titles and tickers are expected in its output; prose is not.
  Blind spot: it pairs text nodes across languages by index, and
  `script.js` splits headings into one span per word — a heading whose
  word count changes when translated shifts every later index, hiding
  the rest of that page.

The `?v=` cache key lives in **one** place, `i18n-boot.js`, stamped by
`i18n-build.mjs` from a hash of the built dictionaries and published to
`window.FDK_IV`. `i18n.js` reads it from there when the switcher loads a
language. A second hand-written copy of that key once went stale and made
every language switch serve a months-old dictionary from cache, so the
build now refuses to run if one reappears.

Animated text (`[data-reveal-text]`, `[data-reveal-block]`,
`[data-highlight]`) is rebuilt into one span per word by `script.js`, and
the engine skips those spans. `i18n.js` therefore records each such
block's pristine English markup before its first pass — on **every**
language, English included, since an English visitor may switch later —
and `script.js` restores it, asks for a refresh and re-splits whenever the
language changes.

The site picks its language from the visitor's browser and offers a switcher in
the navigation that remembers the choice. English lives in the HTML, so an
English reader downloads no dictionary at all; Spanish and Italian readers get
two small files — the shared copy plus the copy of the page they opened.

```
i18n-boot.js        in <head>: picks the language, loads its dictionaries
i18n.js             the engine, first script at the end of <body>
data/i18n/es.json   the editable Spanish source          ← edit these
data/i18n/it.json   the editable Italian source          ← edit these
data/i18n/runtime.json     strings that only ever reach the DOM through JS
data/i18n/no-translate.json  proper nouns that stay as they are
i18n/*.js           generated — never edit by hand
```

The engine translates a **block at a time**, so a sentence broken by `<strong>`
or a highlight span is still translated as one sentence and keeps its emphasis.
Dates, reading times, `Slot · Section` labels and page titles are derived by
rule, so a newly published note reads correctly before anyone touches a
dictionary.

```bash
node scripts/i18n-extract.mjs            # what is translatable, and what is missing
node scripts/i18n-extract.mjs --missing es > gaps.json
node scripts/i18n-merge.mjs batch.json   # merge {"english": {"es": "…", "it": "…"}}
node scripts/i18n-build.mjs              # rebuild i18n/*.js   ← after every edit
node scripts/i18n-build.mjs --check      # CI: fail if anything is untranslated
node scripts/i18n-audit.mjs              # load AND switch, in Chromium — the decisive check
node scripts/i18n-lint.mjs               # wording, markup parity and register
node scripts/i18n-verify.mjs             # key-shape check (see blind spot above)
```

After editing `data/i18n/*.json`, always run `i18n-build.mjs` — the browser reads
the generated files, not the JSON.

To keep a name in English everywhere (a company, a book title, an FDK concept),
add it to `data/i18n/no-translate.json` rather than mapping it to itself.

## 🚀 Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## 🌐 Publish on GitHub Pages

Pages must be enabled once from the repo settings (an automated token can't turn
it on for the first time):

1. GitHub → repo **Settings** → **Pages**
2. **Build and deployment → Source:** `Deploy from a branch`
3. **Branch:** `claude/eager-carson-vjorjg` · **Folder:** `/ (root)` → **Save**
4. Wait ~1 min. Site goes live at **https://matisisconsultancy.github.io/FDK/**

(When this branch is merged to `main`, switch the branch selector to `main`.)

## 🖼 Images

The concept and founder photos load from Unsplash with a graceful gradient
fallback (`onerror`). Drop in the real FDK assets by replacing the two `<img src>`
URLs in `index.html` (search for `unsplash.com`), or point them at local files
under an `assets/` folder.

## 🔌 Connect the form

In `script.js`, inside the `#briefingForm` handler, replace the `setTimeout(...)`
block with a real `fetch()` to your endpoint (Formspree, a Worker, your CRM/API).

## 🎨 Customisation

Brand colours live as CSS variables in `:root` (`styles.css`):
`--navy`, `--green`, `--green-deep`, plus the hero gradient in `.hero__bg`.
