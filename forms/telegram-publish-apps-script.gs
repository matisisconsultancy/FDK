/**
 * FDK EmpowerNet — Telegram → publish backend (Google Apps Script)
 * ----------------------------------------------------------------
 * Publish a note on the site from TELEGRAM, hands-free and ALWAYS ON.
 * Francesco writes to a bot; seconds later the bot replies IN THE SAME CHAT
 * with the live link, ready to forward.
 *
 *   FDK (Telegram) ──▶ Telegram ──▶ this web app ──▶ GitHub (drafts/)
 *                          ▲                              │
 *                          └──── instant reply w/ link    ▼
 *                                          GitHub Action → AI formats → publishes
 *
 * WHY TELEGRAM: the bot token and the webhook NEVER expire — nothing to
 * re-join every 72h (the flaw that killed the Twilio WhatsApp sandbox). It is
 * free, official, and the link comes back in the same chat instantly, because
 * we pin the title/slug in the draft so the URL is known before the build ends.
 *
 * WAYS TO SUBMIT AN ARTICLE (all supported):
 *   1. Plain text: first line = title, the rest = the article.
 *   2. A document: attach .docx (Word), .pdf or .txt — the caption is the title
 *      (or, with no caption, the first line of the document).
 * Guard = the sender's Telegram id must be on ALLOWED_IDS.
 *
 * SETUP — full walkthrough in ../TELEGRAM-SETUP.md. In short:
 *   1. Talk to @BotFather on Telegram → /newbot → copy the bot TOKEN.
 *   2. New Apps Script project, paste this file.
 *   3. Services (+) → add "Drive API" → version 2   (needed for Word/PDF).
 *   4. ⚙ Project settings → Script properties → add:
 *        GITHUB_TOKEN   = <your GitHub fine-grained token>
 *        TELEGRAM_TOKEN = <the bot token from BotFather>
 *   5. Deploy → New deployment → Web app (Execute as: Me · Access: Anyone).
 *   6. Run setWebhook() once from the editor → connects the bot to this app.
 *   7. In Telegram, send /id to the bot from each phone that will publish and
 *      add those numbers to ALLOWED_IDS below (then redeploy).
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
  DEFAULT_SLOT: "Midday Pulse",
  TIMEZONE: "Europe/Madrid",
};
// ========================================================

/* ============================ WEBHOOK ============================ */

// Telegram POSTs every message here as JSON.
function doPost(e) {
  var update;
  try {
    update = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  } catch (err) {
    return ok_(); // malformed — acknowledge so Telegram doesn't retry forever
  }

  var msg = update.message || update.edited_message;
  if (!msg) return ok_();

  // De-dup — CRITICAL. Telegram re-delivers the same update until it gets a
  // fast 200, and won't deliver the NEXT update until the current one is
  // acknowledged. Without this, a slow request republishes the same note
  // several times AND blocks later messages from ever arriving. Mark each
  // update_id as handled immediately so retries are ignored and the queue
  // advances.
  if (update.update_id != null) {
    var cache = CacheService.getScriptCache();
    var uKey = "tg_u_" + update.update_id;
    if (cache.get(uKey)) return ok_();
    cache.put(uKey, "1", 21600); // remember for 6h
  }

  var chatId = msg.chat && msg.chat.id;
  var fromId = msg.from && msg.from.id;
  var text = String(msg.text || "").trim();

  try {
    // ---- helper commands (never publish) ----
    if (text === "/id" || text === "/id@") {
      tgSend_(chatId, "🆔 Tu Telegram id es: <code>" + fromId + "</code>\n\n" +
        "Pásaselo a quien administra el bot para autorizarte.");
      return ok_();
    }
    if (/^\/(start|help|ayuda)\b/i.test(text)) {
      tgSend_(chatId, helpText_());
      return ok_();
    }

    // ---- allow-list ----
    if (CONFIG.ALLOWED_IDS.length && CONFIG.ALLOWED_IDS.indexOf(fromId) === -1) {
      tgSend_(chatId, "⛔ Este usuario no está autorizado para publicar.\n" +
        "Envía /id y pasa ese número al administrador del bot.");
      return ok_();
    }

    // ---- gather the article (document > text) ----
    var got = extractContent_(msg);      // { text, title, source }
    var article = (got.text || "").trim();
    if (!article) {
      tgSend_(chatId, "⚠️ No encontré texto para publicar.\n\n" + helpText_());
      return ok_();
    }

    // Title: caption / first line; body = the rest.
    var title = got.title;
    if (!title) {
      var lines = article.split(/\r?\n/);
      title = String(lines.shift() || "").trim().slice(0, 120);
      var rest = lines.join("\n").trim();
      if (rest) article = rest; // first line was the title → body is the remainder
    }
    if (!title) { tgSend_(chatId, "⚠️ Falta el título (primera línea del mensaje o pie del documento)."); return ok_(); }

    var slug = kebab_(title);
    if (!slug) { tgSend_(chatId, "⚠️ El título no genera una URL válida. Usa texto con letras."); return ok_(); }

    // ---- build + commit the draft (title/slug pinned; body AI-formatted) ----
    var today = todayParts_();
    var draft =
      "---\n" +
      "title: " + title + "\n" +
      "slug: " + slug + "\n" +
      "date: " + today.pretty + "\n" +
      "slot: " + CONFIG.DEFAULT_SLOT + "\n" +
      "format: ai\n" +
      "---\n\n" +
      article + "\n";

    commitFile_("drafts/" + today.iso + "-" + slug + ".md", draft, "Publish via Telegram: " + title);

    // ---- instant reply with the exact live link + a "Ver nota" button ----
    var url = CONFIG.SITE_BASE + "/" + slug + "/";
    tgSendWithButton_(chatId,
      "✅ <b>Recibido:</b> «" + escapeHtml_(title) + "»\n" +
      "Se está publicando y estará online en 1–2 min:\n" + url + "\n\n" +
      "Reenvía este mensaje para compartirlo.",
      "🔗 Ver nota", url);
    return ok_();
  } catch (err) {
    tgSend_(chatId, "✖ No se pudo publicar: " + String(err));
    return ok_();
  }
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "FDK Telegram publisher", ready: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==================== ONE-TIME SETUP HELPERS ==================== */

// Run ONCE from the editor after deploying → connects the bot to this web app.
function setWebhook() {
  var url = PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL") ||
            ScriptApp.getService().getUrl();
  if (!url) throw new Error("No pude obtener la URL del web app. Despliega primero (Deploy → Web app).");
  var res = tgApi_("setWebhook", { url: url, drop_pending_updates: true });
  Logger.log("setWebhook → " + res);
}

// Optional: disconnect the bot.
function deleteWebhook() { Logger.log("deleteWebhook → " + tgApi_("deleteWebhook", {})); }

// Optional: confirm the bot token works and see the connected webhook.
function getMe() { Logger.log("getMe → " + tgApi_("getMe", {})); }
function getWebhookInfo() { Logger.log("getWebhookInfo → " + tgApi_("getWebhookInfo", {})); }

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
    // document unreadable → fall through to any caption as text
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

function ok_() { return ContentService.createTextOutput("ok"); }

function helpText_() {
  return "👋 <b>" + escapeHtml_(CONFIG.BRAND_NAME) + " — publicador</b>\n\n" +
    "Para publicar una nota, mándame:\n" +
    "• <b>Texto:</b> el <u>título en la 1ª línea</u> y el artículo debajo, o\n" +
    "• <b>Un documento</b> (.docx, .pdf o .txt) con el título como pie de foto (caption).\n\n" +
    "En 1–2 min te respondo aquí mismo con el link listo para compartir.\n\n" +
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
