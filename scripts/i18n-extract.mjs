#!/usr/bin/env node
/* ============================================================
   FDK · i18n key extractor
   Walks every page in the repo and prints the full set of
   translatable strings, using exactly the same key algorithm
   the browser runtime uses.

     node scripts/i18n-extract.mjs            → report (missing keys per language)
     node scripts/i18n-extract.mjs --json     → all keys as JSON
     node scripts/i18n-extract.mjs --missing es|it  → missing keys as JSON
   ============================================================ */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseHTML, isSkipped, classify, serializeChildren, normWS, resolves,
} from "./i18n-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IGNORE_DIRS = new Set([".git", "node_modules", "assets", "drafts", "data", ".github", "forms"]);

export function htmlFiles() {
  const out = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (IGNORE_DIRS.has(name)) continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".html")) out.push(p);
    }
  })(ROOT);
  return out.sort();
}

const LETTERS = /[A-Za-zÀ-ÿ]/;

/* Strings that are proper nouns / symbols and never get translated. */
export function isTranslatable(s) {
  if (!LETTERS.test(s)) return false;
  if (s.length < 2) return false;
  return true;
}

function addKey(map, key, file, kind) {
  key = normWS(key).trim();
  if (!key || !isTranslatable(key)) return;
  if (!map.has(key)) map.set(key, { files: new Set(), kinds: new Set() });
  const e = map.get(key);
  e.files.add(file); e.kinds.add(kind);
}

/* ---- walk one parsed document ---- */
function walkNode(el, file, map) {
  if (el.type === "el" && isSkipped(el)) return;

  // attributes
  if (el.type === "el") {
    const a = el.attrs;
    if (a.placeholder) addKey(map, a.placeholder, file, "placeholder");
    if (a["aria-label"]) addKey(map, a["aria-label"], file, "aria-label");
    if (a.title && el.tag !== "title") addKey(map, a.title, file, "title-attr");
    if (a.alt) addKey(map, a.alt, file, "alt");
    if (el.tag === "meta") {
      const n = (a.name || a.property || "").toLowerCase();
      if (["description","og:title","og:description","twitter:title","twitter:description"].includes(n) && a.content)
        addKey(map, a.content, file, "meta:" + n);
    }
  }

  if (el.type === "el" && el.tag === "title") {
    addKey(map, serializeChildren(el), file, "title");
    return;
  }
  if (el.type === "el" && el.tag === "head") {
    for (const c of el.children) walkNode(c, file, map);
    return;
  }

  const mode = el.type === "root" ? "recurse" : classify(el);
  if (mode === "unit") {
    addKey(map, serializeChildren(el), file, "unit");
    return;
  }
  for (const c of el.children || []) {
    if (c.type === "text") {
      if (LETTERS.test(c.value)) addKey(map, c.value, file, "text");
    } else if (c.type === "el") {
      walkNode(c, file, map);
    }
  }
}

export function extractAll() {
  const map = new Map();
  for (const f of htmlFiles()) {
    const rel = relative(ROOT, f);
    const doc = parseHTML(readFileSync(f, "utf8"));
    walkNode(doc, rel, map);
  }
  return map;
}

/* ---- JS-side strings (data + hardcoded UI copy) ---- */

/* Fields in gvi-data.js that carry prose or taxonomy a reader sees.
   Scores, dates and ids are left out. */
const GVI_FIELDS = ["label", "name", "country", "sector", "note", "pillar", "k",
  "title", "subtitle", "thesis", "standfirst", "edition", "hypothesis", "latest",
  "reading", "scale", "tagline", "source", "value", "delta", "tag"];

export function extractJS() {
  const map = new Map();

  const g = { window: {} };
  new Function("window", readFileSync(join(ROOT, "posts.js"), "utf8"))(g.window);
  for (const p of g.window.FDK_POSTS || []) {
    for (const k of ["title", "excerpt", "tag", "slot", "date", "read"])
      if (p[k]) addKey(map, p[k], "posts.js", "post:" + k);
  }

  const gv = { window: {} };
  try {
    new Function("window", readFileSync(join(ROOT, "gvi-data.js"), "utf8"))(gv.window);
  } catch { /* the dashboard data is optional */ }
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === "string" && GVI_FIELDS.includes(k)) addKey(map, v, "gvi-data.js", "gvi:" + k);
      else walk(v);
    }
  })(gv.window.GVI_DATA);

  return map;
}

/* Proper nouns — companies, tickers, people, places that stay as they are in
   every language. Listed so the build can tell "deliberately untranslated"
   apart from "not translated yet". */
export function noTranslate() {
  try {
    return new Set(JSON.parse(readFileSync(join(ROOT, "data", "i18n", "no-translate.json"), "utf8")));
  } catch { return new Set(); }
}

function loadDict() {
  const out = {};
  for (const lang of ["es", "it"]) {
    const p = join(ROOT, "data", "i18n", lang + ".json");
    try { out[lang] = JSON.parse(readFileSync(p, "utf8")); } catch { out[lang] = {}; }
  }
  return out;
}

/* ---- CLI ---- */
if (process.argv[1] && process.argv[1].endsWith("i18n-extract.mjs")) {
  const all = extractAll();
  for (const [k, v] of extractJS()) {
    if (!all.has(k)) all.set(k, v);
    else { v.files.forEach((f) => all.get(k).files.add(f)); }
  }
  try {
    for (const k of JSON.parse(readFileSync(join(ROOT, "data", "i18n", "runtime.json"), "utf8")))
      if (!all.has(k)) all.set(k, { files: new Set(["runtime"]), kinds: new Set(["runtime"]) });
  } catch { /* optional */ }
  const dict = loadDict();
  const args = process.argv.slice(2);

  if (args[0] === "--json") {
    console.log(JSON.stringify([...all.keys()], null, 1));
  } else if (args[0] === "--missing") {
    const lang = args[1] || "es";
    const d = dict[lang] || {};
    const keep = noTranslate();
    console.log(JSON.stringify(
      [...all.keys()].filter((k) => !keep.has(k) && !resolves(k, d)), null, 1));
  } else if (args[0] === "--files") {
    for (const [k, v] of all) console.log([...v.files].join(",") + "\t" + k);
  } else {
    const keep = noTranslate();
    const keys = [...all.keys()].filter((k) => !keep.has(k));
    console.log("pages          :", htmlFiles().length);
    console.log("keys total     :", keys.length);
    for (const lang of ["es", "it"]) {
      const d = dict[lang] || {};
      const missing = keys.filter((k) => !resolves(k, d));
      console.log(`missing (${lang})   : ${missing.length}`);
    }
    const stale = Object.keys(dict.es || {}).filter((k) => !all.has(k));
    console.log("stale in dict  :", stale.length);
  }
}
