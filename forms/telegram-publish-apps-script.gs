/**
 * FDK EmpowerNet — Telegram → publish backend (Google Apps Script)
 * ----------------------------------------------------------------
 * Publish a note on the site from TELEGRAM, hands-free and ALWAYS ON.
 * Francesco writes to a bot; within ~1 min the bot replies IN THE SAME CHAT
 * with the live link, ready to forward.
 *
 *   FDK (Telegram) ──▶ Telegram  ◀── this script asks "any new messages?"
 *                          │            every minute (time-driven trigger)
 *                          ▼
 *                   commits a draft to GitHub (drafts/)
 *                          ▼
 *          GitHub Action → AI formats → publishes → live link
 *                          │
 *                          ▼  the bot replies in the chat with the link
 *
 * WHY POLLING (getUpdates) INSTEAD OF A WEBHOOK:
 * A published Apps Script web app always answers an incoming request with an
 * HTTP 302 redirect, never a plain 200. Telegram treats that 302 as a FAILED
 * delivery ("Wrong response from the webhook: 302 Found"), so with a webhook it
 * re-sends the same message (loops) and stops delivering the next ones (the
 * queue stalls). Polling flips it around: OUR script calls Telegram, so there
 * is no 302 to fail on. A time-driven trigger runs on Google's servers forever
 * — nothing to re-join, nothing that expires. Rock solid.
 *
 * WAYS TO SUBMIT AN ARTICLE (all supported):
 *   1. Plain text: first line = title, the rest = the article.
 *   2. A document: attach .docx (Word), .pdf or .txt — the caption is the title
 *      (or, with no caption, the first line of the document).
 * Guard = the sender's Telegram id must be on ALLOWED_IDS.
 *
 * SETUP — full walkthrough in ../TELEGRAM-SETUP.md. In short:
 *   1. Talk to @BotFather → /newbot → copy the bot TOKEN.
 *   2. New Apps Script project, paste this file.
 *   3. Services (+) → add "Drive API" → version 2   (needed for Word/PDF).
 *   4. ⚙ Project settings → Script properties → add:
 *        GITHUB_TOKEN   = <your GitHub fine-grained token>
 *        TELEGRAM_TOKEN = <the bot token from BotFather>
 *   5. Send /id to the bot, add your numeric id(s) to ALLOWED_IDS below, save.
 *   6. Run setupPolling() ONCE from the editor (authorise when asked).
 *      → it removes any webhook and schedules the minute-by-minute poll forever.
 *
 * NOTE: because the poll runs from a time-driven trigger (not a web-app
 * deployment), editing the code + SAVING is enough — no re-deploy needed.
 */

// ======================== CONFIG ========================
var CONFIG = {
  // ---- GitHub ----
  // Store the tokens in Script Properties (⚙ Project settings). Leave "" here.
  GITHUB_TOKEN: "",
  GITHUB_REPO: "matisisconsultancy/FDK",
  GITHUB_BRANCH: "claude/eager-carson-vjorjg", // branch GitHub Pages serves
  SITE_BASE: "https://fdkempowernet.com",

  // ---- Telegram ----
  TELEGRAM_TOKEN: "", // leave "" → read from Script Properties (TELEGRAM_TOKEN)
  // Telegram numeric user ids allowed to publish. Empty = anyone (NOT advised).
  // Get an id by sending /id to the bot. Example: [123456789, 987654321]
  ALLOWED_IDS: [6707632529],

  // ---- Publishing ----
  BRAND_NAME: "FDK EmpowerNet",
  TIMEZONE: "Europe/Madrid",

  // ---- Ediciones por hora ----
  // El bot elige la edición según la hora de publicación (zona TIMEZONE):
  // `from` = hora (0–23) a partir de la cual aplica. `slot` = etiqueta del
  // sitio (debe existir en scripts/publish-note.mjs). `label` = nombre que se
  // muestra en el mensaje para compartir.
  // `label` = slot para que coincida EXACTAMENTE con la etiqueta del sitio.
  EDITIONS: [
    { from: 0,  slot: "Morning View", label: "Morning View" }, // 00:00–11:59
    { from: 12, slot: "Midday Pulse", label: "Midday Pulse" }, // 12:00–17:59
    { from: 18, slot: "The Close",    label: "The Close"    }, // 18:00–23:59
  ],

  // ---- Mensaje para compartir (bilingüe EN–IT) ----
  // Refleja el sello del artículo en el sitio ("The Velocity Edge · {edición}")
  // para que TODO concuerde. Usa {edition}, {title} y {url}.
  SHARE_TEMPLATE:
    "📖 The Velocity Edge · {edition}\n\n«{title}»\n\nRead it · Leggilo 👉 {url}",
};
// ========================================================

/* ==================== ONE-TIME SETUP ==================== */

/**
 * Run this ONCE from the editor. It:
 *   1. Removes any Telegram webhook (webhook + polling are mutually exclusive).
 *   2. Schedules pollUpdates() to run every minute, forever.
 * Re-running it is safe (it de-duplicates the trigger).
 */
function setupPolling() {
  var del = tgApi_("deleteWebhook", { drop_pending_updates: false });
  Logger.log("deleteWebhook → " + del);
  installTrigger();
  Logger.log("✅ Polling activo: pollUpdates cada 1 minuto (siempre activo).");
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "pollUpdates") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("pollUpdates").timeBased().everyMinutes(1).create();
  Logger.log("⏱️ Disparador instalado: pollUpdates cada 1 minuto.");
}

/** Optional: stop the automation. */
function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "pollUpdates") ScriptApp.deleteTrigger(t);
  });
  Logger.log("🛑 Disparador eliminado.");
}

/* ==================== MAIN POLL LOOP ==================== */

// Time-driven entry point. Asks Telegram for new messages and publishes them.
function pollUpdates() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return; // never let two runs overlap
  try {
    var props = PropertiesService.getScriptProperties();
    var offset = Number(props.getProperty("TG_OFFSET") || 0);

    var raw = tgApi_("getUpdates", { offset: offset, timeout: 0, allowed_updates: ["message"] });
    var resp = JSON.parse(raw);
    if (!resp.ok || !resp.result || !resp.result.length) return;

    // Telegram caps a message at 4096 chars and auto-splits a longer paste into
    // several messages. getUpdates drains all pending updates at once, so the
    // split parts always arrive together — stitch them back into one article.
    var items = groupUpdates_(resp.result);

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.msg) {
        if (it.texts && it.texts.length > 1) it.msg.text = it.texts.join(""); // rebuild split text
        try {
          processMessage_(it.msg);
        } catch (e) {
          Logger.log("✖ update " + it.update_id + ": " + e);
          try { tgSend_(it.msg.chat && it.msg.chat.id, "✖ No se pudo publicar: " + String(e)); } catch (e2) {}
        }
      }
      // Confirm through the LAST update in the group so retries never re-process.
      props.setProperty("TG_OFFSET", String(it.update_id + 1));
    }
  } finally {
    lock.releaseLock();
  }
}

// Merge consecutive text messages that are pieces of ONE 4096-split paste.
// Only merges when the previous piece hit the ~4096 limit (a real split), so
// two distinct short notes are never fused together.
function groupUpdates_(updates) {
  var items = [];
  var WINDOW = 60;   // seconds allowed between split pieces
  var SPLIT = 4000;  // a piece at/above this length is a Telegram-split chunk
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    var msg = u.message || u.edited_message;
    if (!msg) { items.push({ update_id: u.update_id, msg: null }); continue; }

    var text = (typeof msg.text === "string") ? msg.text : null;
    var isCmd = text != null && /^\//.test(text.trim());
    var prev = items.length ? items[items.length - 1] : null;

    var canMerge = text != null && !isCmd && prev && prev.canContinue &&
      prev.chatId === (msg.chat && msg.chat.id) &&
      prev.fromId === (msg.from && msg.from.id) &&
      (msg.date - prev.lastDate) <= WINDOW;

    if (canMerge) {
      prev.texts.push(text);
      prev.lastDate = msg.date;
      prev.update_id = u.update_id;
      prev.canContinue = text.length >= SPLIT; // keep merging only while pieces are full-length
    } else {
      items.push({
        update_id: u.update_id,
        msg: msg,
        chatId: msg.chat && msg.chat.id,
        fromId: msg.from && msg.from.id,
        texts: text != null ? [text] : null,
        lastDate: msg.date,
        canContinue: text != null && !isCmd && text.length >= SPLIT,
      });
    }
  }
  return items;
}

// Handle one Telegram message: commands, allow-list, then publish + reply.
function processMessage_(msg) {
  var chatId = msg.chat && msg.chat.id;
  var fromId = msg.from && msg.from.id;
  var text = String(msg.text || "").trim();

  // ---- helper commands (never publish) ----
  if (text === "/id" || text === "/id@") {
    tgSend_(chatId, "🆔 Tu Telegram id es: <code>" + fromId + "</code>\n\n" +
      "Pásaselo a quien administra el bot para autorizarte.");
    return;
  }
  if (/^\/(start|help|ayuda)\b/i.test(text)) { tgSend_(chatId, helpText_()); return; }

  // ---- allow-list ----
  if (CONFIG.ALLOWED_IDS.length && CONFIG.ALLOWED_IDS.indexOf(fromId) === -1) {
    tgSend_(chatId, "⛔ Este usuario no está autorizado para publicar.\n" +
      "Envía /id y pasa ese número al administrador del bot.");
    return;
  }

  // ---- gather the article (document > text) ----
  var got = extractContent_(msg);       // { text, title, source }
  var article = (got.text || "").trim();
  if (!article) { tgSend_(chatId, "⚠️ No encontré texto para publicar.\n\n" + helpText_()); return; }

  // Title: caption / first line; body = the rest.
  var title = got.title;
  if (!title) {
    var lines = article.split(/\r?\n/);
    title = String(lines.shift() || "").trim().slice(0, 120);
    var rest = lines.join("\n").trim();
    if (rest) article = rest;
  }
  if (!title) { tgSend_(chatId, "⚠️ Falta el título (primera línea del mensaje o pie del documento)."); return; }

  var slug = kebab_(title);
  if (!slug) { tgSend_(chatId, "⚠️ El título no genera una URL válida. Usa texto con letras."); return; }

  // ---- pick the edition by publish time (Morning View / Midday Pulse / …) --
  var ed = editionFor_(new Date());

  // ---- build + commit the draft (title/slug pinned; body AI-formatted) ----
  var today = todayParts_();
  var draft =
    "---\n" +
    "title: " + title + "\n" +
    "slug: " + slug + "\n" +
    "date: " + today.pretty + "\n" +
    "slot: " + ed.slot + "\n" +
    "format: ai\n" +
    "---\n\n" +
    article + "\n";

  commitFile_("drafts/" + today.iso + "-" + slug + ".md", draft, "Publish via Telegram: " + title);

  var url = CONFIG.SITE_BASE + "/" + slug + "/";

  // 1) short confirmation for Francesco (with a quick link button)
  tgSendWithButton_(chatId,
    "✅ <b>Publicado</b> · " + escapeHtml_(ed.label) + ": «" + escapeHtml_(title) + "» — online en ~1–2 min.\n" +
    "👇 Copia o reenvía este mensaje para compartirlo:",
    "🔗 Ver nota", url);

  // 2) the clean, ready-to-share message (copy or forward as-is)
  tgSend_(chatId, buildShare_(title, url, ed.label));
}

// Choose the edition for a given time, from CONFIG.EDITIONS (by TIMEZONE hour).
function editionFor_(date) {
  var eds = CONFIG.EDITIONS || [];
  var h = Number(Utilities.formatDate(date || new Date(), CONFIG.TIMEZONE || "Etc/UTC", "H"));
  var pick = eds[0] || { slot: "Midday Pulse", label: "Midday Pulse" };
  for (var i = 0; i < eds.length; i++) { if (h >= eds[i].from) pick = eds[i]; }
  return pick;
}

// The forwardable/copyable message, from CONFIG.SHARE_TEMPLATE.
function buildShare_(title, url, edition) {
  return String(CONFIG.SHARE_TEMPLATE || "«{title}»\n\n{url}")
    .replace(/\{edition\}/g, escapeHtml_(edition || ""))
    .replace(/\{title\}/g, escapeHtml_(title))
    .replace(/\{url\}/g, url);
}

/* ==================== DIAGNOSTICS ==================== */

function getMe() { Logger.log("getMe → " + tgApi_("getMe", {})); }
function getWebhookInfo() { Logger.log("getWebhookInfo → " + tgApi_("getWebhookInfo", {})); }
// Health check if you ever deploy this as a web app (not required for polling).
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "FDK Telegram publisher (polling)", ready: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==================== CONTENT EXTRACTION ==================== */

function extractContent_(msg) {
  // 1) A document attachment (Word / PDF / txt)
  if (msg.document) {
    var d = msg.document;
    var blob = tgDownload_(d.file_id, d.file_name);
    if (blob) {
      var txt = extractFromBlob_(blob, d.file_name || "adjunto", d.mime_type || "");
      if (txt && txt.trim()) {
        var cap = String(msg.caption || "").trim();
        return { text: txt, title: cap || "", source: "documento (" + (d.file_name || "adjunto") + ")" };
      }
    }
    var cap2 = String(msg.caption || "").trim();
    if (cap2) return { text: cap2, title: "", source: "pie del documento" };
  }
  // 2) Plain text message
  return { text: String(msg.text || "").trim(), title: "", source: "mensaje de texto" };
}

function extractFromBlob_(blob, name, mime) {
  var lower = String(name || "").toLowerCase();
  var type = String(mime || "");

  if (lower.match(/\.txt$/) || type.indexOf("text/plain") === 0) {
    try { return blob.getDataAsString(); } catch (e) { return null; }
  }

  var isDoc = lower.match(/\.docx?$/) || type.indexOf("word") !== -1 ||
              type.indexOf("officedocument.wordprocessing") !== -1;
  var isPdf = lower.match(/\.pdf$/) || type === "application/pdf";
  if (!isDoc && !isPdf) return null;

  // Convert to a temporary Google Doc (OCR for PDFs), read its text, delete it.
  // Requires the advanced "Drive API" service (version 2) to be enabled.
  var tmp = null;
  try {
    tmp = Drive.Files.insert(
      { title: "tmp-publish", mimeType: "application/vnd.google-apps.document" },
      blob,
      { convert: true, ocr: !!isPdf, ocrLanguage: "es" }
    );
    return DocumentApp.openById(tmp.id).getBody().getText();
  } catch (e) {
    Logger.log("documento no convertible: " + name + " → " + e);
    return null;
  } finally {
    if (tmp && tmp.id) { try { Drive.Files.remove(tmp.id); } catch (e2) {} }
  }
}

/* ==================== TELEGRAM API ==================== */

function tgToken_() {
  if (CONFIG.TELEGRAM_TOKEN) return CONFIG.TELEGRAM_TOKEN;
  var p = PropertiesService.getScriptProperties().getProperty("TELEGRAM_TOKEN");
  if (!p) throw new Error("TELEGRAM_TOKEN no configurado (CONFIG o Script Properties).");
  return p;
}

function tgApi_(method, params) {
  var res = UrlFetchApp.fetch("https://api.telegram.org/bot" + tgToken_() + "/" + method, {
    method: "post", contentType: "application/json",
    payload: JSON.stringify(params || {}), muteHttpExceptions: true,
  });
  return res.getContentText();
}

function tgSend_(chatId, text) {
  if (!chatId) return;
  tgApi_("sendMessage", { chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: false });
}

function tgSendWithButton_(chatId, text, buttonText, buttonUrl) {
  if (!chatId) return;
  tgApi_("sendMessage", {
    chat_id: chatId, text: text, parse_mode: "HTML", disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [[{ text: buttonText, url: buttonUrl }]] },
  });
}

// Download a Telegram file (getFile → download) as a Blob.
function tgDownload_(fileId, name) {
  try {
    var info = JSON.parse(tgApi_("getFile", { file_id: fileId }));
    var fp = info && info.result && info.result.file_path;
    if (!fp) return null;
    var res = UrlFetchApp.fetch("https://api.telegram.org/file/bot" + tgToken_() + "/" + fp,
      { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var blob = res.getBlob();
    if (name) blob.setName(name);
    return blob;
  } catch (e) { Logger.log("tgDownload_ error: " + e); return null; }
}

/* ==================== GITHUB ==================== */

function readToken_() {
  if (CONFIG.GITHUB_TOKEN) return CONFIG.GITHUB_TOKEN;
  var prop = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!prop) throw new Error("GITHUB_TOKEN no configurado (CONFIG o Script Properties).");
  return prop;
}

function commitFile_(filePath, contentStr, message) {
  var token = readToken_();
  var api = "https://api.github.com/repos/" + CONFIG.GITHUB_REPO + "/contents/" + encodeURI(filePath);
  var headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  var sha = null;
  var getRes = UrlFetchApp.fetch(api + "?ref=" + encodeURIComponent(CONFIG.GITHUB_BRANCH), {
    method: "get", headers: headers, muteHttpExceptions: true,
  });
  if (getRes.getResponseCode() === 200) sha = JSON.parse(getRes.getContentText()).sha;

  var payload = {
    message: message,
    content: Utilities.base64Encode(contentStr, Utilities.Charset.UTF_8),
    branch: CONFIG.GITHUB_BRANCH,
  };
  if (sha) payload.sha = sha;

  var putRes = UrlFetchApp.fetch(api, {
    method: "put", headers: headers, contentType: "application/json",
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  var code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) throw new Error("GitHub " + code + ": " + putRes.getContentText());
}

/* ==================== HELPERS ==================== */

function helpText_() {
  return "👋 <b>" + escapeHtml_(CONFIG.BRAND_NAME) + " — publicador</b>\n\n" +
    "Para publicar una nota, mándame:\n" +
    "• <b>Texto:</b> el <u>título en la 1ª línea</u> y el artículo debajo, o\n" +
    "• <b>Un documento</b> (.docx, .pdf o .txt) con el título como pie de foto (caption).\n\n" +
    "En ~1 min te respondo aquí mismo con el link listo para compartir.\n\n" +
    "Comandos: /id (ver tu id) · /help (esta ayuda)";
}

function kebab_(s) {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’'"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayParts_() {
  var tz = CONFIG.TIMEZONE || "Etc/UTC";
  var now = new Date();
  return {
    iso: Utilities.formatDate(now, tz, "yyyy-MM-dd"),
    pretty: Utilities.formatDate(now, tz, "MMMM d, yyyy"),
  };
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
