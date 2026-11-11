#!/usr/bin/env node
/* ============================================================================
   FDK · Avatar video renderer — HeyGen API v3 (phase 1–2 of AVATAR-PLAN.md)
   ----------------------------------------------------------------------------
   Takes an APPROVED script from data/avatar/scripts/<slug>.json (written by
   scripts/avatar-script.mjs) and renders one vertical avatar video per
   language with HeyGen, then records the result back into the same JSON.

   Commands:
     node scripts/avatar-heygen.mjs me                       # account / credit check
     node scripts/avatar-heygen.mjs avatars [--public]       # avatar looks (yours: digital twins)
     node scripts/avatar-heygen.mjs voices [--public --language es]
     node scripts/avatar-heygen.mjs approve <slug> --by "Name"
     node scripts/avatar-heygen.mjs render <slug> [--lang es,en] [--wait]
     node scripts/avatar-heygen.mjs status <slug> [--wait] [--download dir]

   Requires HEYGEN_API_KEY (an API-plan key from platform.heygen.com).
   Avatar and voices come from data/avatar/config.json, overridable with
   HEYGEN_AVATAR_ID and HEYGEN_VOICE_EN / _ES / _IT.

   Rule (AVATAR-PLAN.md): nothing is rendered unless the script's status is
   "approved" — Francesco signs off every script before it becomes video.
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, SCRIPTS_DIR as SCRIPTS, LANGS, WPM, noteText, review, saveRecord } from "./avatar-lib.mjs";

const CONFIG = path.join(ROOT, "data", "avatar", "config.json");
const API = "https://api.heygen.com";
const KEY = process.env.HEYGEN_API_KEY;

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const flag = (k) => args.includes(k);
const positional = args.filter((a, i) => i > 0 && !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

/* ---- HTTP ---------------------------------------------------------------------- */
async function api(method, p, body, headers = {}) {
  if (!KEY) throw new Error("HEYGEN_API_KEY is not set.");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + p, { method, headers: {
      "x-api-key": KEY, "accept": "application/json",
      ...(body ? { "content-type": "application/json" } : {}), ...headers,
    }, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get("retry-after")) || 2 ** (attempt + 1);
      await sleep(wait * 1000); continue;
    }
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) {
      const e = json?.error;
      throw new Error(`HeyGen ${res.status} ${e?.code || ""}: ${e?.message || text.slice(0, 300)}${e?.request_id ? ` (request ${e.request_id})` : ""}`);
    }
    return json;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function* pages(p, params) {
  let token = null;
  do {
    const q = new URLSearchParams({ ...params, ...(token ? { token } : {}) });
    const r = await api("GET", `${p}?${q}`);
    for (const x of r.data || []) yield x;
    token = r.has_more ? r.next_token : null;
  } while (token);
}

/* ---- config and script files ---------------------------------------------------- */
function config() {
  const c = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, "utf8")) : {};
  const voices = { ...(c.voices || {}) };
  for (const l of LANGS) if (process.env[`HEYGEN_VOICE_${l.toUpperCase()}`]) voices[l] = process.env[`HEYGEN_VOICE_${l.toUpperCase()}`];
  return { ...c, avatar_id: process.env.HEYGEN_AVATAR_ID || c.avatar_id, voices };
}
const scriptFile = (slug) => path.join(SCRIPTS, `${slug}.json`);
function loadScript(slug) {
  const f = scriptFile(slug);
  if (!fs.existsSync(f)) throw new Error(`No script for "${slug}". Run scripts/avatar-script.mjs ${slug} first.`);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
const saveScript = saveRecord;
function needSlug() {
  const s = positional[0];
  if (!s) { console.error(`✖ Usage: node scripts/avatar-heygen.mjs ${cmd} <slug>`); process.exit(1); }
  return s.replace(/^\/+|\/+$/g, "");
}

/* ---- commands ------------------------------------------------------------------- */
async function me() {
  const r = await api("GET", "/v3/users/me");
  console.log(JSON.stringify(r.data ?? r, null, 2));
}

async function avatars() {
  const params = { ownership: flag("--public") ? "public" : "private", limit: "50" };
  if (!flag("--public")) params.avatar_type = opt("--type") || "digital_twin";
  let n = 0;
  for await (const a of pages("/v3/avatars/looks", params)) {
    n++;
    console.log(`${a.id}\t${a.name}\t${a.avatar_type}\t${a.status || ""}\tvoice:${a.default_voice_id || "-"}\t${a.preferred_orientation || ""}`);
    if (flag("--public") && n >= Number(opt("--max") || 50)) break;
  }
  if (!n) console.log(flag("--public") ? "No public avatars returned." :
    "No digital twin yet. Create Francesco's in HeyGen (Avatars → Create → Digital Twin), then run this again.");
}

async function voices() {
  const params = { type: flag("--public") ? "public" : "private", limit: "100" };
  if (flag("--public") && opt("--language")) params.language = opt("--language");
  let n = 0;
  for await (const v of pages("/v3/models/audio/voices", params)) {
    n++;
    console.log(`${v.voice_id}\t${v.name}\t${v.language || "-"}\t${v.gender || ""}\t${v.mode || ""}\t${v.status || ""}`);
    if (flag("--public") && n >= Number(opt("--max") || 100)) break;
  }
  if (!n) console.log("No voices returned.");
}

function approve() {
  const s = loadScript(needSlug());
  const by = opt("--by");
  if (!by) { console.error('✖ Say who approves: --by "Francesco De Leo Kaufmann"'); process.exit(1); }
  // Re-check now: the script may have been edited by hand since it was written.
  const note = noteText(s.slug);
  if (note) s.warnings = review(s, note, Math.round(((s.seconds || 75) / 60) * WPM));
  if (s.warnings?.length && !flag("--despite-warnings")) {
    saveScript(s);
    console.error(`✖ The script still has warnings:\n${s.warnings.map((w) => `  - ${w}`).join("\n")}\n  Fix them in the JSON, or pass --despite-warnings.`);
    process.exit(1);
  }
  s.status = "approved";
  s.approved = { by, at: new Date().toISOString(), hash: scriptHash(s) };
  saveScript(s);
  console.log(`✔ ${s.slug} approved by ${by}`);
}

// The approval covers these exact words: editing a script after approval
// invalidates it, so nothing unreviewed can slip into a video.
function scriptHash(s) {
  return crypto.createHash("sha256").update(JSON.stringify(LANGS.map((l) => s.scripts?.[l] || ""))).digest("hex").slice(0, 16);
}

async function render() {
  const s = loadScript(needSlug());
  if (s.status !== "approved" || s.approved?.hash !== scriptHash(s)) {
    console.error(`✖ "${s.slug}" is not approved (or was edited after approval). Run: node scripts/avatar-heygen.mjs approve ${s.slug} --by "…"`);
    process.exit(1);
  }
  const c = config();
  if (!c.avatar_id) { console.error("✖ No avatar_id. Set it in data/avatar/config.json or HEYGEN_AVATAR_ID (see: avatars)."); process.exit(1); }
  const langs = (opt("--lang") || (c.languages || LANGS).join(",")).split(",").map((x) => x.trim()).filter(Boolean);
  s.videos = s.videos || {};
  for (const l of langs) {
    const text = s.scripts?.[l];
    if (!text) { console.log(`  · ${l}: no script, skipped`); continue; }
    if (s.videos[l]?.status === "completed" && !flag("--again")) { console.log(`  · ${l}: already rendered (use --again)`); continue; }
    const voice = c.voices[l];
    if (!voice && !c.allow_default_voice) { console.error(`✖ No voice for "${l}" in config (voices.${l}).`); process.exit(1); }
    const body = {
      type: "avatar",
      avatar_id: c.avatar_id,
      script: text,
      ...(voice ? { voice_id: voice } : {}),
      title: `FDK avatar · ${s.title} · ${l.toUpperCase()}`,
      aspect_ratio: c.aspect_ratio || "9:16",
      ...(c.resolution ? { resolution: c.resolution } : {}),
      ...(c.background ? { background: c.background } : {}),
      caption: { file_format: "srt", ...(c.burn_captions === false ? {} : { style: "default" }) },
      callback_id: `${s.slug}:${l}`,
    };
    // Same script, same language → same key, so a retried run never pays twice.
    const idem = `fdk-${crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 40)}`;
    const r = await api("POST", "/v3/videos", body, { "Idempotency-Key": idem });
    s.videos[l] = { video_id: r.data.video_id, status: r.data.status, requested: new Date().toISOString(),
      avatar_id: c.avatar_id, voice_id: voice || null, resolution_note: r.data.resolution_note || undefined };
    console.log(`  ✔ ${l}: ${r.data.video_id} (${r.data.status})`);
  }
  s.status = "rendering";
  saveScript(s);
  if (flag("--wait")) await status(s.slug);
}

async function status(slugArg) {
  const s = loadScript(slugArg || needSlug());
  const wait = flag("--wait");
  const deadline = Date.now() + Number(opt("--timeout") || 1800) * 1000;
  for (;;) {
    let pending = 0;
    for (const [l, v] of Object.entries(s.videos || {})) {
      if (["completed", "failed"].includes(v.status) && !flag("--refresh")) continue;
      const d = (await api("GET", `/v3/videos/${encodeURIComponent(v.video_id)}`)).data;
      Object.assign(v, {
        status: d.status, duration: d.duration ?? v.duration, thumbnail_url: d.thumbnail_url,
        video_page_url: d.video_page_url, checked: new Date().toISOString(),
        failure: d.status === "failed" ? `${d.failure_code || ""} ${d.failure_message || ""}`.trim() : undefined,
      });
      // Presigned URLs expire: kept only for the download step, never as the archive.
      v.urls = { video: d.video_url, captioned: d.captioned_video_url, subtitles: d.subtitle_url };
      if (!["completed", "failed"].includes(d.status)) pending++;
      console.log(`  ${l}: ${d.status}${d.duration ? ` · ${Math.round(d.duration)} s` : ""}${v.failure ? ` · ${v.failure}` : ""}`);
    }
    const all = Object.values(s.videos || {});
    if (all.length && all.every((v) => v.status === "completed")) s.status = "rendered";
    else if (all.some((v) => v.status === "failed") && !pending) s.status = "render_failed";
    saveScript(s);
    if (!wait || !pending) break;
    if (Date.now() > deadline) { console.error("✖ Timed out waiting for HeyGen."); process.exit(1); }
    await sleep(20000);
  }
  const dir = opt("--download");
  if (dir) await download(s, path.resolve(dir));
}

async function download(s, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [l, v] of Object.entries(s.videos || {})) {
    if (v.status !== "completed") continue;
    for (const [kind, url] of Object.entries(v.urls || {})) {
      if (!url) continue;
      const ext = kind === "subtitles" ? "srt" : "mp4";
      const f = path.join(dir, `${s.slug}-${l}${kind === "captioned" ? "-captioned" : ""}.${ext}`);
      const res = await fetch(url);
      if (!res.ok) { console.error(`  ⚠ ${l} ${kind}: download ${res.status}`); continue; }
      fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      console.log(`  ↓ ${path.relative(process.cwd(), f)}`);
    }
  }
}

/* ---- dispatch ------------------------------------------------------------------- */
const COMMANDS = { me, avatars, voices, approve, render, status: () => status() };
if (!COMMANDS[cmd]) {
  console.error("Usage: node scripts/avatar-heygen.mjs <me|avatars|voices|approve|render|status> …  (see header)");
  process.exit(1);
}
try { await COMMANDS[cmd](); } catch (e) { console.error(`✖ ${e.message}`); process.exit(1); }
