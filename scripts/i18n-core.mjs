/* ============================================================
   FDK · i18n shared core (Node side)
   Minimal, dependency-free HTML parser + the *canonical key*
   algorithm. The browser runtime (i18n.js) implements exactly
   the same key algorithm on real DOM nodes, so a key produced
   here always matches the key produced there.
   ============================================================ */

/* ---------- entities ---------- */
const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  mdash: "—", ndash: "–", hellip: "…", middot: "·",
  times: "×", deg: "°", euro: "€", pound: "£",
  copy: "©", reg: "®", trade: "™", laquo: "«",
  raquo: "»", bull: "•", dagger: "†", eacute: "é",
  egrave: "è", agrave: "à", ccedil: "ç", ntilde: "ñ",
  uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß",
  aacute: "á", iacute: "í", oacute: "ó", uacute: "ú",
  shy: "­", ensp: " ", emsp: " ", thinsp: " ",
};
export function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, g) => {
    if (g[0] === "#") {
      const n = g[1] === "x" || g[1] === "X"
        ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return Object.prototype.hasOwnProperty.call(NAMED, g) ? NAMED[g] : m;
  });
}

/* ---------- tiny HTML parser ---------- */
const VOID = new Set(["area","base","br","col","embed","hr","img","input","link",
  "meta","param","source","track","wbr"]);
const RAWTEXT = new Set(["script","style"]);
// Elements that auto-close when a sibling of the same kind starts.
const AUTO_CLOSE = { li: ["li"], p: ["p","div","section","ul","ol","h1","h2","h3","h4","h5","h6"],
  option: ["option"], td: ["td","th","tr"], th: ["td","th","tr"], tr: ["tr"] };

function parseAttrs(src) {
  const attrs = {};
  const re = /([^\s"'=<>/]+)(\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1].toLowerCase();
    let val = m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : m[6] !== undefined ? m[6] : "";
    attrs[name] = decodeEntities(val);
  }
  return attrs;
}

export function parseHTML(html) {
  const root = { type: "root", tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root, i = 0;
  const push = (n) => { n.parent = cur; cur.children.push(n); };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) { const t = html.slice(i); if (t) push({ type: "text", value: decodeEntities(t) }); break; }
    if (lt > i) push({ type: "text", value: decodeEntities(html.slice(i, lt)) });

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt); i = end < 0 ? html.length : end + 1; continue;
    }

    // scan the tag, honouring quotes so ">" inside an attribute is safe
    let j = lt + 1, q = null;
    while (j < html.length) {
      const c = html[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === ">") break;
      j++;
    }
    const rawTag = html.slice(lt + 1, j);
    i = j + 1;

    if (rawTag[0] === "/") {
      const name = rawTag.slice(1).trim().toLowerCase();
      let n = cur;
      while (n && n.type !== "root" && n.tag !== name) n = n.parent;
      if (n && n.type !== "root") cur = n.parent;
      continue;
    }

    const sp = rawTag.search(/[\s/]/);
    const tag = (sp < 0 ? rawTag : rawTag.slice(0, sp)).toLowerCase();
    const selfClosed = /\/\s*$/.test(rawTag);
    const attrs = parseAttrs(sp < 0 ? "" : rawTag.slice(sp));

    if (AUTO_CLOSE[cur.tag] && AUTO_CLOSE[cur.tag].includes(tag)) cur = cur.parent;

    const el = { type: "el", tag, attrs, children: [], parent: null };
    push(el);

    if (VOID.has(tag) || selfClosed) continue;

    if (RAWTEXT.has(tag)) {
      const close = new RegExp("</" + tag + "\\s*>", "i");
      const rest = html.slice(i);
      const m = rest.match(close);
      const end = m ? m.index : rest.length;
      el.children.push({ type: "text", value: rest.slice(0, end), raw: true, parent: el });
      i += end + (m ? m[0].length : 0);
      continue;
    }
    cur = el;
  }
  return root;
}

/* ---------- selectors used by the key algorithm ---------- */
export const SKIP_CLASS = ["brand","brand__text","brand__mark","footer__brand","footer__email","jclock","cmedia__count","lang-switch",
  "marquee","mkt","mb-card__px","mb-card__sym","mb-chg","g-delta","g-spark","r-word",
  "r-word__in","r-block__in","hl","art-stat__num","stat__num"];
export const SKIP_TAG = new Set(["script","style","noscript","svg","code","pre","canvas","iframe","template"]);
export const SKIP_ID = new Set(["jClock","cBigNum","year","loaderCount"]);
/* Blocks that line up independent labels (a byline, a stat, an accordion
   head) rather than forming a sentence. Their parts are translated one by
   one, so a new note's date, tag or figure never needs its own entry. */
export const PARTS_CLASS = ["art-meta","art-author","art-stat","signal__head","buystore",
  "jcard__top","jpost__badge","mb-card__top","mb-meta","g-tchip","g-card__head"];

export function classList(el) {
  return String(el.attrs?.class || "").split(/\s+/).filter(Boolean);
}
export function isSkipped(el) {
  if (el.type !== "el") return false;
  if (SKIP_TAG.has(el.tag)) return true;
  if (el.attrs["data-no-i18n"] !== undefined) return true;
  if (el.attrs["aria-hidden"] === "true" && !hasText(el)) return true;
  if (el.attrs["data-count"] !== undefined) return true;   // animated figure
  if (el.attrs.id && SKIP_ID.has(el.attrs.id)) return true;
  const cl = classList(el);
  for (const c of cl) if (SKIP_CLASS.includes(c)) return true;
  return false;
}
function hasText(el) {
  if (el.type === "text") return /[A-Za-zÀ-ÿ]/.test(el.value);
  return (el.children || []).some(hasText);
}
export { hasText };

/* ---------- canonical serialisation (must mirror i18n.js) ---------- */
export function escText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export function escAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
export function normWS(s) {
  return s.replace(/[\s\u00a0]+/g, " ");
}

/* Inline tags allowed inside a translation unit. */
export const INLINE = new Set(["a","b","strong","i","em","span","br","small","sup","sub",
  "mark","u","abbr","q","cite","time","wbr","s","del","ins","kbd","var","bdi","bdo"]);

/* A descendant that must never be re-created from a translation string. */
export function isOpaque(el) {
  if (el.type !== "el") return false;
  if (SKIP_TAG.has(el.tag)) return true;
  if (["img","picture","input","button","select","textarea","video","audio","object","form","label"].includes(el.tag)) return true;
  if (el.attrs.id) return true;
  if (el.attrs["data-cursor"] !== undefined) return true;
  for (const k of Object.keys(el.attrs)) if (k.startsWith("on")) return true;
  return false;
}
export function hasOpaque(el) {
  for (const c of el.children || []) {
    if (c.type !== "el") continue;
    if (isOpaque(c) || hasOpaque(c)) return true;
  }
  return false;
}

export function serializeChildren(el) {
  let out = "";
  for (const c of el.children || []) {
    if (c.type === "text") out += escText(normWS(c.value));
    else if (c.type === "el") out += serializeEl(c);
  }
  return out;
}
export function serializeEl(el) {
  const names = Object.keys(el.attrs).sort();
  let a = "";
  for (const n of names) a += " " + n + '="' + escAttr(el.attrs[n]) + '"';
  if (VOID.has(el.tag)) return "<" + el.tag + a + ">";
  return "<" + el.tag + a + ">" + serializeChildren(el) + "</" + el.tag + ">";
}

/* ---------- unit classification (must mirror i18n.js) ---------- */
/* Returns "text" (translate each direct text node on its own),
   "unit" (translate the whole inner markup as one string),
   or "recurse" (descend into element children). */
export function isParts(el) {
  if (el.type !== "el") return false;
  if (el.attrs["data-i18n-parts"] !== undefined) return true;
  return classList(el).some((c) => PARTS_CLASS.includes(c));
}

export function classify(el) {
  if (isParts(el)) return "recurse";
  const kids = el.children || [];
  let textWithLetters = 0, inlineWithText = 0, blockChild = 0;
  for (const c of kids) {
    if (c.type === "text") { if (/[A-Za-zÀ-ÿ]/.test(c.value)) textWithLetters++; }
    else if (c.type === "el") {
      if (isSkipped(c)) continue;
      if (!INLINE.has(c.tag)) { if (hasText(c)) blockChild++; }
      else if (hasText(c)) inlineWithText++;
    }
  }
  if (blockChild > 0) return "recurse";
  if (inlineWithText === 0) return textWithLetters > 0 ? "text" : "recurse";
  if (hasOpaque(el)) return "text";
  return "unit";
}

/* ============================================================
   Rule coverage — mirrors the pattern rules in i18n.js so the
   build can tell "no translation anywhere" apart from "the
   engine derives this one" (a date, a reading time, a
   "Slot · Section" label, a page title built from an article
   name). Without it every date would be reported as a gap.
   ============================================================ */
const MONTHS = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];
const PREFIX = ["Data as of","Week ending","week ending","As of","as of",
  "Updated","updated","As at","as at","Published"];

function dateRule(k) {
  let m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(k);
  if (m && MONTHS.includes(m[1])) return true;
  m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(k);
  return !!(m && MONTHS.includes(m[2]));
}

function atomResolves(k, dict) {
  if (dict[k] !== undefined) return true;
  if (dateRule(k)) return true;
  if (/^\d+ min read$/.test(k)) return true;
  for (const p of PREFIX)
    if (k.length > p.length + 1 && k.startsWith(p + " ") && dict[p] !== undefined) return true;
  if (!/[A-Za-zÀ-ÿ]/.test(k)) return true;
  return false;
}

export function resolves(k, dict) {
  if (dict[k] !== undefined) return true;
  const q = /^“([\s\S]+)”$/.exec(k);
  if (q && resolves(normWS(q[1]).trim(), dict)) return true;
  const arrow = /^([\s\S]+?)\s*[←-↓»›]$/.exec(k);
  if (arrow && resolves(normWS(arrow[1]).trim(), dict)) return true;
  if (k.includes("·")) {
    for (const raw of k.split("·")) {
      const p = normWS(raw).trim();
      if (!p) continue;
      if (atomResolves(p, dict)) return true;
      const i = p.indexOf(" — ");
      if (i >= 0 && (atomResolves(p.slice(0, i).trim(), dict) ||
                     atomResolves(p.slice(i + 3).trim(), dict))) return true;
    }
    return false;
  }
  return atomResolves(k, dict);
}
