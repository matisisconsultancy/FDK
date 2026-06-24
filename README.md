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
index.html    →  Markup and copy
styles.css    →  Styling, gradient, animations, responsive
script.js     →  Navbar, scroll reveal, mobile menu, form
```

## 🚀 Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

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
