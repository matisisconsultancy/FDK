#!/usr/bin/env node
/* ============================================================
   FDK · i18n dictionary lint

   Checks the translations themselves, which the page audit cannot:
   it only sees whether a string changed language, not whether the
   same idea is worded the same way on every page.

     · markup parity — a translation must carry exactly the tags of
       its source, or the emphasis or the link is lost
     · house terminology — the wording settled on for terms that
       recur across the site, so one page cannot drift from another
     · register — Spanish addresses the reader as "usted" throughout

     node scripts/i18n-lint.mjs
   ============================================================ */
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

/* Wording chosen once, so the same idea reads the same everywhere.
   Left: what must not appear.  Right: what to use instead. */
const HOUSE = {
  es: [
    ["Sigue explorando", "Siga explorando — the site uses usted"],
    ["Consigue tu", "Consiga su — the site uses usted"],
    ["Consigue el", "Consiga el — the site uses usted"],
    [/\bde Velocity\b/, "de velocidad — Velocity stays English only in The Velocity Edge"],
    ["Intelligence Library", "Biblioteca de Inteligencia"],
    ["Leer una muestra", "Leer un extracto"],
  ],
  it: [
    [/\bmodell[oi] nascost[oi]\b/i, "schema/schemi nascosto/i"],
    [/\blibreri[ae]\b/i, "biblioteca — a libreria is a bookshop"],
    ["Ultime notizie", "Ultim’ora"],
    ["Conclusioni chiave", "Punti chiave"],
    [/\bdi Velocity\b/, "di velocità — Velocity stays English only in The Velocity Edge"],
    ["Intelligence Library", "Biblioteca di Intelligence"],
  ],
};

const tags = (s) => (s.match(/<[^>]+>/g) || []).sort().join("");

let bad = 0;
for (const lang of ["es", "it"]) {
  const dict = read(`data/i18n/${lang}.json`);
  const problems = [];
  for (const [k, v] of Object.entries(dict)) {
    if (tags(k) !== tags(v))
      problems.push([`markup`, k, `${tags(k) || "(none)"} → ${tags(v) || "(none)"}`]);
    for (const [pattern, fix] of HOUSE[lang]) {
      const hit = typeof pattern === "string" ? v.includes(pattern) : pattern.test(v);
      if (hit) problems.push([`wording`, k, `use ${fix}`]);
    }
  }
  console.log(`${lang}: ${Object.keys(dict).length} entries · ${problems.length} problem(s)`);
  for (const [kind, k, detail] of problems.slice(0, 20))
    console.log(`   ${kind}  ${k.slice(0, 70)}\n      ${detail}`);
  bad += problems.length;
}
process.exit(bad ? 1 : 0);
