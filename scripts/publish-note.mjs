#!/usr/bin/env node
/* ============================================================================
   THE VELOCITY EDGE — note publisher
   Turns a draft (drafts/<name>.md) into a live note: builds the styled page
   at /<slug>/index.html, prepends the entry to posts.js and adds it to
   sitemap.xml — matching the site's current asset version, GA4 tag and i18n.

   Usage:
     node scripts/publish-note.mjs drafts/my-note.md            # publish
     node scripts/publish-note.mjs drafts/my-note.md --dry-run  # validate only

   Draft format: see drafts/README.md
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const draftPath = args.find((a) => !a.startsWith("--"));
if (!draftPath) { console.error("Usage: node scripts/publish-note.mjs <draft.md> [--dry-run]"); process.exit(1); }

const die = (m) => { console.error("✖ " + m); process.exit(1); };
const warn = (m) => console.warn("⚠ " + m);
const ok = (m) => console.log("✓ " + m);

/* ---- inline markdown -> html (trusted author input) --------------------- */
function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/==(.+?)==/g, '<span class="hl-green">$1</span>')
    .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const kebab = (s) => s.toLowerCase().replace(/[’'"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ---- read current site conventions (robust to version bumps) ------------ */
function reference() {
  // pick any existing note folder from posts.js to copy conventions from
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const ver = (src.match(/styles\.css\?v=(\d+)/) || [])[1] || "98";
  const ga = (src.match(/G-[A-Z0-9]{6,}/) || [])[0] || "";
  return { ver, ga };
}

/* ---- slot -> kind / time / default tag ---------------------------------- */
const SLOTS = {
  "Morning View":   { kind: "day",   time: "08:00" },
  "Morning Note":   { kind: "day",   time: "07:15" },
  "Today’s Edition":{ kind: "day",   time: "08:00" },
  "Today's Edition":{ kind: "day",   time: "08:00" },
  "The Week Ahead": { kind: "day",   time: "08:00" },
  "Breaking News":  { kind: "day",   time: "13:30" },
  "Night Briefing": { kind: "night", time: "21:30" },
  "Evening Note":   { kind: "night", time: "21:00" },
  "The Close":      { kind: "night", time: "21:00" },
};

/* ---- parse front-matter + body ------------------------------------------ */
const raw = fs.readFileSync(draftPath, "utf8").replace(/\r\n/g, "\n");
const fm = {};
let body = raw;
const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
if (m) {
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (kv) fm[kv[1].trim()] = kv[2].trim();
  }
  body = m[2];
} else die("Draft is missing the --- front-matter block (see drafts/README.md).");

const title = fm.title || die("front-matter: 'title' is required");
const date = fm.date || die("front-matter: 'date' is required (e.g. July 18, 2026)");
const slot = fm.slot || die("front-matter: 'slot' is required (e.g. Morning View)");
const dek = fm.dek || "";
const image = fm.image || pickCover();
const slotCfg = SLOTS[slot] || { kind: "day", time: "08:00" };

/* ---- auto cover: first pool URL not yet used in posts.js ----------------- */
function pickCover() {
  const poolPath = path.join(ROOT, "scripts", "cover-pool.json");
  if (!fs.existsSync(poolPath)) return "";
  let pool;
  try { pool = JSON.parse(fs.readFileSync(poolPath, "utf8")).covers || []; }
  catch { return ""; }
  const used = fs.readFileSync(path.join(ROOT, "posts.js"), "utf8");
  const free = pool.find((u) => !used.includes(u.split("?")[0]));
  if (!free) { warn("cover-pool exhausted — add more URLs to scripts/cover-pool.json; publishing without a unique cover."); return pool[0] || ""; }
  return free;
}
const kind = fm.kind || slotCfg.kind;
const time = fm.time || slotCfg.time;
const tag = fm.tag ? `${slot} · ${fm.tag}` : slot;
const slug = fm.slug || kebab(title);
const excerpt = (fm.excerpt || dek).replace(/<[^>]+>/g, "").replace(/\*\*|==|(?<![*])\*(?![*])/g, "");
const read = fm.read || estimateRead(body);

function estimateRead(text) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return `${Math.max(2, Math.round(words / 200))} min read`;
}

/* ---- block parser -------------------------------------------------------- */
const lines = body.split("\n");
const blocks = [];
let i = 0;
function collectUntilBlock() {
  const buf = [];
  while (i < lines.length && !/^::/.test(lines[i])) { buf.push(lines[i]); i++; }
  return buf;
}
function paras(buf) {
  return buf.join("\n").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
}
// leading paragraphs (before first ::) — first becomes the lead
const leadBuf = collectUntilBlock();
const leadParas = paras(leadBuf);

while (i < lines.length) {
  const line = lines[i]; i++;
  const b = line.match(/^::(\w+)\s*(.*)$/);
  if (!b) continue;
  const name = b[1].toLowerCase();
  const arg = b[2].trim();
  const buf = collectUntilBlock();
  blocks.push({ name, arg, buf });
}

/* ---- article html builders ---------------------------------------------- */
let secNum = 0;
const nextNum = () => String(++secNum).padStart(2, "0");

function statsHTML(buf) {
  const rows = buf.map((l) => l.trim()).filter(Boolean).slice(0, 4);
  const cells = rows.map((r) => {
    const [val, cap = ""] = r.split("::").map((s) => s.trim());
    return `        <div class="art-stat reveal-up"><b>${inline(val)}</b><span>${inline(cap)}</span></div>`;
  }).join("\n");
  return `    <section class="art-stats">\n      <div class="container art-stats__grid">\n${cells}\n      </div>\n    </section>\n`;
}
function pullHTML(label, buf) {
  const q = paras(buf).map(inline).join(" ");
  return `        <aside class="art-pull reveal-up">\n          <span class="art-pull__label">${inline(label || "")}</span>\n          <p>${q}</p>\n        </aside>\n`;
}
function sectionHead(arg) {
  // arg: "Heading | hint"   (auto-numbered)
  const [h, hint] = arg.split("|").map((s) => (s || "").trim());
  const hintHTML = hint ? `\n          <p class="art-section-head__hint">${inline(hint)}</p>` : "";
  return `        <div class="art-section-head reveal-up">\n          <span class="art-section-head__num">${nextNum()}</span>\n          <h2 class="art-h2">${inline(h)}</h2>${hintHTML}\n        </div>\n`;
}
function itemsFrom(buf) {
  // split on lines beginning with "# "
  const items = [];
  let cur = null;
  for (const l of buf) {
    const t = l.match(/^#\s+(.*)$/);
    if (t) { cur = { title: t[1].trim(), lines: [] }; items.push(cur); }
    else if (cur) cur.lines.push(l);
  }
  return items;
}
function signalsHTML(arg, buf) {
  const head = sectionHead(arg || "Five signals | Tap each signal to expand the read.");
  const items = itemsFrom(buf);
  const lis = items.map((it, idx) => {
    const ps = paras(it.lines);
    let readLine = "";
    const body = [];
    for (const p of ps) {
      const r = p.match(/^signal:\s*(.*)$/i);
      if (r) readLine = r[1].trim(); else body.push(p);
    }
    const open = idx === 0;
    const bodyHTML = body.map((p) => `                <p>${inline(p)}</p>`).join("\n");
    const readHTML = readLine ? `\n                <p class="signal__read"><span class="signal__read-label">Signal</span> ${inline(readLine)}</p>` : "";
    return `          <li class="signal${open ? " is-open" : ""} reveal-up">\n            <button class="signal__head" type="button" aria-expanded="${open}" data-cursor>\n              <span class="signal__num">${String(idx + 1).padStart(2, "0")}</span>\n              <span class="signal__title">${inline(it.title)}</span>\n              <span class="signal__chev" aria-hidden="true"></span>\n            </button>\n            <div class="signal__panel">\n              <div class="signal__panel-in">\n${bodyHTML}${readHTML}\n              </div>\n            </div>\n          </li>`;
  }).join("\n\n");
  return head + `        <ol class="signals" id="signals">\n${lis}\n        </ol>\n`;
}
function patternsHTML(arg, buf) {
  const head = arg ? sectionHead(arg) : "";
  const items = itemsFrom(buf);
  const cards = items.map((it, idx) => {
    const p = paras(it.lines).map(inline).join(" ");
    const ghost = it.title.match(/^\[(.+?)\]\s*(.*)$/); // optional [45%] Title
    const label = ghost ? ghost[1] : String(idx + 1).padStart(2, "0");
    const ttl = ghost ? ghost[2] : it.title;
    return `          <article class="pattern reveal-up"><span class="pattern__ghost" aria-hidden="true">${inline(label)}</span><h3 class="pattern__title">${inline(ttl)}</h3><p>${p}</p></article>`;
  }).join("\n");
  return head + `        <div class="patterns">\n${cards}\n        </div>\n`;
}
function takeawaysHTML(arg, buf) {
  const [label, sub] = (arg || "Key takeaways").split("|").map((s) => (s || "").trim());
  const items = buf.map((l) => l.match(/^[-*]\s+(.*)$/)).filter(Boolean).map((x) => `            <li>${inline(x[1])}</li>`).join("\n");
  const subHTML = sub ? `\n            <h3>${inline(sub)}</h3>` : "";
  return `        <section class="takeaways reveal-up">\n          <div class="takeaways__head">\n            <span class="takeaways__label">${inline(label)}</span>${subHTML}\n          </div>\n          <ul class="takeaways__list">\n${items}\n          </ul>\n        </section>\n`;
}

let art = "";
if (fm.epigraph) art += `        <p class="art-epigraph reveal-up">“${inline(fm.epigraph)}”</p>\n\n`;
leadParas.forEach((p, idx) => {
  const cls = idx === 0 ? "art-lead reveal-up" : "reveal-up";
  art += `        <p class="${cls}">${inline(p)}</p>\n\n`;
});
let statsBlock = "";
for (const bl of blocks) {
  if (bl.name === "stats") statsBlock = statsHTML(bl.buf);
  else if (bl.name === "pull") art += pullHTML(bl.arg, bl.buf) + "\n";
  else if (bl.name === "signals") art += signalsHTML(bl.arg, bl.buf) + "\n";
  else if (bl.name === "patterns") art += patternsHTML(bl.arg, bl.buf) + "\n";
  else if (bl.name === "section") art += sectionHead(bl.arg) + "\n";
  else if (bl.name === "takeaways") art += takeawaysHTML(bl.arg, bl.buf) + "\n";
  else if (bl.name === "para") paras(bl.buf).forEach((p) => art += `        <p class="reveal-up">${inline(p)}</p>\n\n`);
  else if (bl.name === "close") art += `        <p class="art-close reveal-up">${paras(bl.buf).map(inline).join(" ")}</p>\n\n`;
}

/* ---- assemble full page -------------------------------------------------- */
const { ver, ga } = reference();
const gaHead = ga ? `  <!-- Google tag (gtag.js) -->\n  <script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>\n  <script>\n    window.dataLayer = window.dataLayer || [];\n    function gtag(){dataLayer.push(arguments);}\n    gtag('js', new Date());\n    gtag('config', '${ga}');\n  </script>\n\n` : "";

const NAV = `  <header class="nav nav--solid" id="nav">
    <div class="container nav__inner">
      <a href="/" class="brand magnetic" aria-label="FDK EmpowerNet home" data-cursor>
        <span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" width="30" height="30"><path d="M16 18H96L110 7"/><path d="M16 18V104"/><path d="M16 53H40"/><path d="M40 18V104"/><path d="M40 18A44 43 0 0 1 40 104"/><path d="M16 104H96L110 115"/><path d="M40 61L82 22"/><path d="M40 61L88 101"/></svg></span>
        <span class="brand__text"><b>fdk</b><i>EmpowerNet</i></span>
      </a>
      <nav class="nav__links" id="navLinks" aria-label="Primary">
        <a href="/" data-cursor>Home</a>
        <a href="/thesis" data-cursor>Thesis + Author</a>
        <div class="nav__has-sub">
          <a href="/library" class="nav__sub-toggle" data-cursor>Library <span class="nav__caret" aria-hidden="true"></span></a>
          <div class="nav__submenu">
            <a href="/the-european-pivot" data-cursor>The European Pivot</a>
            <a href="/the-age-of-intelligent-motion" data-cursor>The Age of Intelligent Motion</a>
            <a href="/the-rise-of-velocity" data-cursor>The Rise of Velocity</a>
          </div>
        </div>
        <a href="/#contact" data-cursor>Contact</a>
        <a href="/intelligence-library" class="nav__cta magnetic" data-cursor>The Velocity Edge <span aria-hidden="true">→</span></a>
      </nav>
      <button class="nav__toggle" id="navToggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </header>`;

const FOOTER = `  <footer class="footer">
    <div class="container footer__main">
      <div class="footer__lead">
        <span class="footer__label">Get in touch</span>
        <a class="footer__email" href="mailto:info@fdkempowernet.com" data-cursor>info@fdkempowernet.com<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg></a>
        <a class="social-link footer__social" href="https://www.linkedin.com/in/fdeleokaufmann/" target="_blank" rel="noopener" data-cursor aria-label="Francesco de Leo Kaufmann on LinkedIn"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.73v20.54C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .78 23.2 0 22.22 0z"/></svg> Connect on LinkedIn</a>
      </div>
      <nav class="footer__nav" aria-label="Footer">
        <a href="/" data-cursor>Home</a>
        <a href="/thesis" data-cursor>Thesis + Author</a>
        <a href="/library" data-cursor>Library</a>
        <a href="/intelligence-library" data-cursor>The Velocity Edge</a>
        <a href="/#contact" data-cursor>Contact</a>
      </nav>
    </div>
    <div class="container footer__base">
      <span class="footer__brand"><span class="brand__mark" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" width="26" height="26"><path d="M16 18H96L110 7"/><path d="M16 18V104"/><path d="M16 53H40"/><path d="M40 18V104"/><path d="M40 18A44 43 0 0 1 40 104"/><path d="M16 104H96L110 115"/><path d="M40 61L82 22"/><path d="M40 61L88 101"/></svg></span><span class="brand__text"><b>fdk</b><i>EmpowerNet</i></span></span>
      <span class="footer__meta">© <span id="year">2026</span> FDK EmpowerNet · Mobility · Energy · Telecom</span>
      <button type="button" class="footer__top-link" id="toTop" data-cursor>Back to top <span class="footer__top-ic" aria-hidden="true">↑</span></button>
    </div>
  </footer>`;

const heroTag = fm.tag || `${slotCfg.kind === "night" ? "Night" : "Macro"} · Capital`;
const page = `<!DOCTYPE html>
<html lang="en">
<head>
${gaHead}  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${esc(excerpt)} The Velocity Edge, by Francesco de Leo Kaufmann." />
  <meta name="theme-color" content="#ffffff" />
  <title>${esc(title)} · The Velocity Edge · FDK EmpowerNet</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=${ver}" />
</head>
<body class="article-page">
  <div class="grain" aria-hidden="true"></div>
  <div class="cursor-ring" id="cursorRing" aria-hidden="true"></div>
  <div class="scroll-progress" id="scrollProgress" aria-hidden="true"></div>

${NAV}

  <main class="art art--${kind}">
    <header class="art-hero">
      <div class="art-hero__grid" aria-hidden="true"></div>
      <div class="art-hero__glow" aria-hidden="true"></div>
      <div class="container art-hero__inner">
        <a class="art-back reveal-up" href="/intelligence-library" data-cursor><span aria-hidden="true">←</span> The Velocity Edge</a>
        <div class="art-kicker reveal-up">
          <span class="art-kicker__pulse" aria-hidden="true"></span>
          The Velocity Edge · ${esc(slot)}
        </div>
        <h1 class="art-title" data-reveal-text>${inline(title)}</h1>
        <p class="art-dek reveal-up">${inline(dek)}</p>
        <div class="art-meta reveal-up">
          <span class="art-author"><span class="art-author__badge" aria-hidden="true">FdK</span> Francesco de Leo Kaufmann</span>
          <span class="art-meta__dot" aria-hidden="true"></span>
          <span class="art-meta__mono">${esc(date)}</span>
          <span class="art-meta__dot" aria-hidden="true"></span>
          <span class="art-meta__mono">${esc(read)}</span>
          <span class="art-meta__tag">${esc(heroTag)}</span>
        </div>
      </div>
    </header>

${statsBlock}
    <article class="art-body">
      <div class="container art-body__inner">

${art}        <div class="art-sign reveal-up">
          <span class="art-sign__mark" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M16 18H96L110 7"/><path d="M16 18V104"/><path d="M16 53H40"/><path d="M40 18V104"/><path d="M40 18A44 43 0 0 1 40 104"/><path d="M16 104H96L110 115"/><path d="M40 61L82 22"/><path d="M40 61L88 101"/></svg></span>
          <span>Francesco de Leo Kaufmann · The Velocity Edge</span>
        </div>
      </div>
    </article>

    <section class="art-more">
      <div class="container">
        <div class="art-more__head reveal-up">
          <h2 class="art-h2">More from The Velocity Edge</h2>
          <p class="art-section-head__hint">Jump straight into another note — no need to head back.</p>
        </div>
        <div class="library__grid art-more__grid" id="artMoreGrid"></div>
      </div>
    </section>

    <section class="art-next">
      <div class="container art-next__inner reveal-up">
        <div>
          <span class="eyebrow eyebrow--light">Keep reading</span>
          <h2>More field notes, from dawn to close.</h2>
          <p>Day signals and night briefings, published like a journal for board-level AI decisions.</p>
        </div>
        <a href="/intelligence-library" class="btn btn--brief magnetic" data-cursor>Back to The Velocity Edge <span aria-hidden="true">→</span></a>
      </div>
    </section>
  </main>

${FOOTER}

  <script src="/posts.js?v=${ver}"></script>
  <script src="/script.js?v=${ver}"></script>
  <script src="/i18n-data.js?v=${ver}"></script>
  <script src="/i18n.js?v=${ver}"></script>
</body>
</html>
`;

/* ---- validations against existing content -------------------------------- */
const postsRaw = fs.readFileSync(path.join(ROOT, "posts.js"), "utf8");
if (fs.existsSync(path.join(ROOT, slug))) die(`slug '/${slug}' already exists — pick a different title or set 'slug:'.`);
if (postsRaw.includes(`"/${slug}"`)) die(`posts.js already has an entry for '/${slug}'.`);
if (image && postsRaw.includes(image.split("?")[0])) warn(`cover image is already used by another note (not unique).`);

const entry = `  {
    url: "/${slug}",
    title: ${JSON.stringify(title)},
    excerpt: ${JSON.stringify(excerpt)},
    tag: ${JSON.stringify(tag)},
    slot: ${JSON.stringify(slot)},
    image: ${JSON.stringify(image)},
    date: ${JSON.stringify(date)},
    read: ${JSON.stringify(read)},
    time: ${JSON.stringify(time)},
    kind: ${JSON.stringify(kind)}
  },`;

const isoDate = toISO(date);
function toISO(d) {
  const dt = new Date(d + " UTC");
  if (isNaN(dt)) return "2026-01-01";
  return dt.toISOString().slice(0, 10);
}
const sitemapEntry = `  <url>\n    <loc>https://fdkempowernet.com/${slug}/</loc>\n    <lastmod>${isoDate}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;

console.log(`\n── ${title} ──`);
console.log(`slug:   /${slug}`);
console.log(`slot:   ${slot}  (kind=${kind}, time=${time})`);
console.log(`date:   ${date}  → sitemap lastmod ${isoDate}`);
console.log(`read:   ${read}`);
console.log(`image:  ${image}`);
console.log(`assets: v=${ver}${ga ? `, GA ${ga}` : ""}`);
console.log(`link:   https://fdkempowernet.com/${slug}/`);

if (DRY) { ok("dry-run: no files written"); process.exit(0); }

/* ---- write --------------------------------------------------------------- */
fs.mkdirSync(path.join(ROOT, slug), { recursive: true });
fs.writeFileSync(path.join(ROOT, slug, "index.html"), page);
ok(`wrote ${slug}/index.html`);

const newPosts = postsRaw.replace(/window\.FDK_POSTS\s*=\s*\[\n/, (mm) => mm + entry + "\n");
fs.writeFileSync(path.join(ROOT, "posts.js"), newPosts);
ok("prepended entry to posts.js");

if (fs.existsSync(path.join(ROOT, "sitemap.xml"))) {
  let sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  if (!sm.includes(`/${slug}/`)) { sm = sm.replace("</urlset>", sitemapEntry + "</urlset>"); fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sm); ok("added to sitemap.xml"); }
}

// sanity: posts.js still valid
try { const g = {}; new Function("window", newPosts)(g); if (!Array.isArray(g.FDK_POSTS)) throw new Error("not array"); ok(`posts.js valid (${g.FDK_POSTS.length} entries)`); }
catch (e) { die("posts.js became invalid: " + e.message); }

console.log(`\n✅ Published: https://fdkempowernet.com/${slug}/\n`);
