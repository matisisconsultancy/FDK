#!/usr/bin/env node
/* ============================================================================
   FDK · Telegram intake collector
   ----------------------------------------------------------------------------
   ONE Telegram bot is the central inbox for the site. Send the bot:
     • a photo (an FDK infographic) → saved to data/gvi/inbox/ → the GVI
       dashboard updates (via scripts/gvi-ingest.mjs).
     • a text message (a note/edition) → saved to drafts/ → published to the
       article library (via scripts/process-drafts.mjs, which AI-formats it).

   This script only COLLECTS and ROUTES messages (polling getUpdates). The
   workflow then runs the existing ingest/publish pipelines on what it dropped.

   State (last processed update id) is kept in data/telegram/state.json so each
   run only picks up new messages.

   Env:
     TELEGRAM_BOT_TOKEN         (required)  — from @BotFather
     TELEGRAM_ALLOWED_CHAT_IDS  (optional)  — comma list; if set, only these
                                              chats/users are accepted
   ============================================================================ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GVI_INBOX = path.join(ROOT, "data", "gvi", "inbox");
const DRAFTS = path.join(ROOT, "drafts");
const STATE = path.join(ROOT, "data", "telegram", "state.json");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;
const FILEAPI = TOKEN ? `https://api.telegram.org/file/bot${TOKEN}` : null;

const IMG_MIME = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

function loadState() { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return { lastUpdateId: 0 }; } }
function saveState(s) { fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); }
function dateOf(unix) { return new Date((unix || Date.now() / 1000) * 1000).toISOString().slice(0, 10); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "note"; }

async function tg(method, params) {
  const u = new URL(`${API}/${method}`);
  Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u);
  const d = await r.json();
  if (!d.ok) throw new Error(`${method}: ${d.description || r.status}`);
  return d.result;
}

async function downloadFile(fileId, destBase) {
  const info = await tg("getFile", { file_id: fileId });
  const fp = info.file_path;
  const ext = path.extname(fp) || ".jpg";
  const res = await fetch(`${FILEAPI}/${fp}`);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = destBase + ext;
  fs.writeFileSync(dest, buf);
  return dest;
}

function allowed(msg) {
  if (!ALLOWED.length) return true;
  const chat = String(msg.chat?.id || ""), from = String(msg.from?.id || "");
  return ALLOWED.includes(chat) || ALLOWED.includes(from);
}

async function main() {
  if (!TOKEN) { console.error("✖ TELEGRAM_BOT_TOKEN not set."); process.exit(1); }
  fs.mkdirSync(GVI_INBOX, { recursive: true });
  fs.mkdirSync(DRAFTS, { recursive: true });

  const state = loadState();
  const updates = await tg("getUpdates", {
    offset: state.lastUpdateId + 1, timeout: 0, allowed_updates: JSON.stringify(["message", "channel_post"])
  });

  let photos = 0, drafts = 0, skipped = 0, maxId = state.lastUpdateId;
  for (const up of updates) {
    maxId = Math.max(maxId, up.update_id);
    const msg = up.message || up.channel_post;
    if (!msg) continue;
    if (!allowed(msg)) { skipped++; console.log(`  · skip (not allow-listed) from ${msg.chat?.id}`); continue; }
    const date = dateOf(msg.date);
    try {
      // 1) photo → GVI infographic
      if (Array.isArray(msg.photo) && msg.photo.length) {
        const largest = msg.photo[msg.photo.length - 1];
        const base = path.join(GVI_INBOX, `tg-${date}-${msg.message_id}`);
        const saved = await downloadFile(largest.file_id, base);
        console.log(`  📷 infographic → ${path.relative(ROOT, saved)}`);
        photos++;
        continue;
      }
      // 2) image sent as a document/file → GVI infographic
      if (msg.document && IMG_MIME[msg.document.mime_type]) {
        const base = path.join(GVI_INBOX, `tg-${date}-${msg.message_id}`);
        const saved = await downloadFile(msg.document.file_id, base);
        console.log(`  📎 infographic (file) → ${path.relative(ROOT, saved)}`);
        photos++;
        continue;
      }
      // 3) text → article draft (the publish pipeline AI-formats free-form text)
      const text = (msg.text || "").trim();
      if (text) {
        if (/^\/(start|help|skip|id)\b/i.test(text)) {
          console.log(`  · command "${text.split(/\s/)[0]}" — not published`);
          skipped++;
          continue;
        }
        const firstLine = text.split("\n")[0];
        const file = path.join(DRAFTS, `${date}-tg-${msg.message_id}-${slugify(firstLine)}.md`);
        fs.writeFileSync(file, text + "\n");
        console.log(`  ✍️  article draft → ${path.relative(ROOT, file)}`);
        drafts++;
        continue;
      }
      console.log(`  · nothing actionable in message ${msg.message_id}`);
    } catch (e) {
      console.error(`  ✖ message ${msg.message_id}: ${e.message}`);
    }
  }

  saveState({ lastUpdateId: maxId, updatedAt: new Date().toISOString() });
  console.log(`\n✓ Telegram intake: ${photos} infographic(s), ${drafts} draft(s), ${skipped} skipped.`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `photos=${photos}\ndrafts=${drafts}\n`);
  }
}
main().catch((e) => { console.error("✖ telegram-collector failed:", e); process.exit(1); });
