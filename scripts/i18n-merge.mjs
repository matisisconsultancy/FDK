#!/usr/bin/env node
/* Merge a translation batch into data/i18n/{es,it}.json.
   A batch is { "<english key>": { "es": "…", "it": "…" }, … }.

     node scripts/i18n-merge.mjs batch.json [more.json …]                */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dicts = {};
for (const lang of ["es", "it"])
  dicts[lang] = JSON.parse(readFileSync(join(ROOT, "data", "i18n", `${lang}.json`), "utf8"));

let added = 0, changed = 0;
for (const file of process.argv.slice(2)) {
  const batch = JSON.parse(readFileSync(file, "utf8"));
  for (const [k, v] of Object.entries(batch)) {
    for (const lang of ["es", "it"]) {
      if (v[lang] === undefined) continue;
      if (dicts[lang][k] === undefined) added++;
      else if (dicts[lang][k] !== v[lang]) changed++;
      dicts[lang][k] = v[lang];
    }
  }
}
for (const lang of ["es", "it"]) {
  const sorted = {};
  for (const k of Object.keys(dicts[lang]).sort()) sorted[k] = dicts[lang][k];
  writeFileSync(join(ROOT, "data", "i18n", `${lang}.json`), JSON.stringify(sorted, null, 1) + "\n");
}
console.log(`merged: +${added} new, ${changed} updated`);
