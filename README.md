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
index.html    →  Home (hero, concepts, thesis-missing, founder, library, contact)
thesis.html   →  Thesis + Author (split hero, thesis architecture, founder bio,
                 experience table, academic background)
styles.css    →  Styling, animations, responsive (shared)
script.js     →  Preloader, cursor, masked reveals, parallax, sticky, form (shared)
.nojekyll     →  Tells GitHub Pages to serve files as-is (no Jekyll build)
```

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
