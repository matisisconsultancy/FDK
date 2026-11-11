/* ============================================================================
   FDK · Avatar — shared helpers for scripts/avatar-script.mjs and
   scripts/avatar-heygen.mjs: reading notes, checking scripts, writing the
   human-readable .md next to each script's JSON.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPTS_DIR = path.join(ROOT, "data", "avatar", "scripts");
export const SITE = "fdkempowernet.com";
export const LANGS = ["en", "es", "it"];
export const WPM = 150; // spoken words a minute (English)
const POSTS = path.join(ROOT, "posts.js");
const DRAFTS = path.join(ROOT, "drafts", "published");

export const DISCLOSURE = {
  en: "AI avatar of Francesco De Leo Kaufmann · script reviewed by FDK EmpowerNet",
  es: "Avatar IA de Francesco De Leo Kaufmann · guion revisado por FDK EmpowerNet",
  it: "Avatar IA di Francesco De Leo Kaufmann · testo rivisto da FDK EmpowerNet",
};

export function loadPosts() {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(POSTS, "utf8"), ctx);
  return ctx.window.FDK_POSTS || [];
}
export const slugOf = (p) => String(p.url || "").replace(/^\/+|\/+$/g, "");

export function noteText(slug) {
  if (fs.existsSync(DRAFTS)) {
    const f = fs.readdirSync(DRAFTS).filter((x) => x.endsWith(`-${slug}.md`)).sort().pop();
    if (f) return fs.readFileSync(path.join(DRAFTS, f), "utf8");
  }
  const page = path.join(ROOT, slug, "index.html");
  if (!fs.existsSync(page)) return null;
  let h = fs.readFileSync(page, "utf8");
  const a = h.indexOf("<article"), b = h.lastIndexOf("</article>");
  if (a >= 0 && b > a) h = h.slice(a, b);
  return h.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<(p|li|h\d|br|div|tr)[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "’").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;

/* Numbers as values, so "$132.5B" in the note matches "132.500 millones" (es)
   and "132,5 miliardi" (it): English uses "," for thousands and "." for
   decimals, Spanish and Italian the reverse. A spoken figure may also be the
   note's figure times or divided by 1,000 (billions said as "thousand millions"). */
function parseNum(s, lang) {
  let t = s;
  if (lang === "en") t = t.replace(/,/g, "");
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /,/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  return Number(t);
}
const NUM = /\d+(?:[.,]\d+)*/g;

export function review(r, note, targetWords) {
  const warn = [];
  for (const l of LANGS) {
    const n = words(r.scripts?.[l]);
    if (!n) warn.push(`${l}: script missing`);
    else if (targetWords && (n < targetWords * 0.75 || n > targetWords * 1.35)) warn.push(`${l}: ${n} words (target ≈${targetWords})`);
  }
  if (/\btú\b|\btienes\b|\bpuedes\b|\bdebes\b|\bte\s+(?:pregunto|invito)\b/i.test(r.scripts?.es || "")) {
    warn.push("es: looks like 'tú' — the house register is 'usted'");
  }
  // Every number said aloud must be in the note.
  const known = (note.match(NUM) || []).map((x) => parseNum(x, "en")).filter(Number.isFinite);
  const same = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
  for (const l of LANGS) {
    for (const raw of String(r.scripts?.[l] || "").match(NUM) || []) {
      const x = parseNum(raw, l);
      if (!known.some((v) => same(x, v) || same(x, v * 1000) || same(x * 1000, v))) {
        warn.push(`${l}: figure "${raw}" not found in the note — check it`);
      }
    }
  }
  return warn;
}

export function toMarkdown(rec) {
  const L = { en: "English", es: "Español", it: "Italiano" };
  const est = (l) => Math.round((words(rec.scripts?.[l]) / WPM) * 60);
  const status = rec.status === "approved" ? `**approved** by ${rec.approved?.by} (${rec.approved?.at})`
    : `**${rec.status}**${rec.status === "draft" ? " — awaiting Francesco's approval" : ""}`;
  let md = `# Avatar script · ${rec.title}\n\n`;
  md += `- Note: ${rec.link}\n- Generated: ${rec.generated} · ${rec.model}\n- Status: ${status}\n\n`;
  if (rec.warnings?.length) md += `## ⚠ Check before recording\n\n${rec.warnings.map((w) => `- ${w}`).join("\n")}\n\n`;
  for (const l of LANGS) {
    if (!rec.scripts?.[l]) continue;
    md += `## ${L[l]} (~${est(l)} s)\n\n${rec.scripts[l]}\n\n`;
    md += `**On screen:** ${(rec.on_screen?.[l] || []).join(" · ")}\n\n`;
    md += `**Disclosure (always on screen):** ${DISCLOSURE[l]}\n\n`;
    md += `**Caption:**\n\n> ${String(rec.captions?.[l] || "").replace(/\n/g, "\n> ")}\n>\n> ${DISCLOSURE[l]}\n\n`;
  }
  md += `**Hashtags:** ${(rec.hashtags || []).join(" ")}\n\n`;
  md += `## Facts the scripts rely on\n\n${(rec.facts_used || []).map((f) => `- ${f}`).join("\n")}\n`;
  if (rec.videos && Object.keys(rec.videos).length) {
    md += `\n## Videos\n\n${Object.entries(rec.videos).map(([l, v]) =>
      `- ${l}: ${v.status}${v.duration ? ` · ${Math.round(v.duration)} s` : ""}${v.video_page_url ? ` · ${v.video_page_url}` : ""}${v.failure ? ` · ${v.failure}` : ""}`).join("\n")}\n`;
  }
  return md;
}

export function saveRecord(rec) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  // Presigned download URLs expire and are not worth versioning.
  const clean = JSON.parse(JSON.stringify(rec, (k, v) => (k === "urls" ? undefined : v)));
  fs.writeFileSync(path.join(SCRIPTS_DIR, `${rec.slug}.json`), JSON.stringify(clean, null, 2) + "\n");
  fs.writeFileSync(path.join(SCRIPTS_DIR, `${rec.slug}.md`), toMarkdown(rec));
}
