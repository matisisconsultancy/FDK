/**
 * FDK EmpowerNet — Email → publish backend (Google Apps Script)
 * -------------------------------------------------------------
 * Publish a note on the site by EMAIL, hands-free and ALWAYS ON.
 *
 *   FDK sends an email ──▶ this script (time-driven, every 5 min, forever)
 *                              │  extracts the article (body / attachment / Google Doc)
 *                              │  commits a draft to GitHub (drafts/)
 *                              ▼
 *                   GitHub Action → AI formats → publishes → live link
 *                              │
 *                              ▼
 *          FDK gets a confirmation email with the link + a
 *          "Share on WhatsApp" button (wa.me) ready to forward.
 *
 * WHY EMAIL: a time-driven trigger runs on Google's servers on a fixed
 * schedule forever — nothing to re-join, nothing that expires (unlike the
 * Twilio WhatsApp sandbox). This is the "always active" part.
 *
 * WAYS TO SUBMIT AN ARTICLE (all supported):
 *   1. Text in the email body.
 *   2. An attachment: .docx (Word), .pdf or .txt.
 *   3. A Google Doc: paste its link in the body.
 * Title = the email Subject (minus the keyword). Guard = the sender must be
 * on ALLOWED_SENDERS and the Subject must start with KEYWORD.
 *
 * SETUP — full walkthrough in ../EMAIL-SETUP.md. In short:
 *   1. New Apps Script project, paste this file.
 *   2. Services (+) → add "Drive API" → choose version 2  (needed for Word/PDF).
 *   3. ⚙ Project settings → Script properties → add GITHUB_TOKEN.
 *   4. Fill CONFIG below (ALLOWED_SENDERS, NOTIFY_EMAIL).
 *   5. Run installTrigger() once (authorise) → it schedules processInbox
 *      every 5 minutes, forever.
 */

// ======================== CONFIG ========================
var CONFIG = {
  // ---- GitHub ----
  // Store the token in Script Properties (⚙ Project settings). Leave "" here.
  GITHUB_TOKEN: "",
  GITHUB_REPO: "matisisconsultancy/FDK",
  GITHUB_BRANCH: "claude/eager-carson-vjorjg", // branch GitHub Pages serves
  SITE_BASE: "https://fdkempowernet.com",

  // ---- Who may publish, and how ----
  // Emails allowed to publish. The article's author address(es).
  ALLOWED_SENDERS: ["team@fdkempowernet.com", "fdeleo@kaufmannpartners.com", "carolinaortegaicao@gmail.com"],
  // The Subject must start with this word to publish (a stray email never goes
  // live). Set to "" to publish ANY email from an allowed sender (not advised).
  KEYWORD: "PUBLISH",

  // ---- Notifications ----
  // Where FDK gets the "published" email with the link + share button.
  NOTIFY_EMAIL: "team@fdkempowernet.com",
  // Phase 2b — email the contact list on publish. Off by default.
  NOTIFY_CONTACTS: false,
  NOTIFY_CONTACTS_TO: [], // e.g. ["a@x.com","b@y.com"] — used only if NOTIFY_CONTACTS is true
  BRAND_NAME: "FDK EmpowerNet",

  // ---- Misc ----
  DEFAULT_SLOT: "Midday Pulse",
  TIMEZONE: "Europe/Madrid",
  PROCESSED_LABEL: "Publicado", // Gmail label applied once an email is published
  MAX_PER_RUN: 5,               // safety cap per run
};
// ========================================================

/**
 * Run this ONCE from the editor to make the automation always-on.
 * It schedules processInbox() to run every 5 minutes, forever.
 */
function installTrigger() {
  // Remove any existing trigger for processInbox to avoid duplicates.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processInbox") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("processInbox").timeBased().everyMinutes(5).create();
  Logger.log("✅ Disparador instalado: processInbox cada 5 minutos (siempre activo).");
}

/** Optional: run once to stop the automation. */
function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processInbox") ScriptApp.deleteTrigger(t);
  });
  Logger.log("🛑 Disparador eliminado.");
}

/** Main entry point — scans Gmail and publishes matching emails. */
function processInbox() {
  var label = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);
  var kw = String(CONFIG.KEYWORD || "").trim();

  var query = "is:unread -label:" + CONFIG.PROCESSED_LABEL;
  if (kw) query += ' subject:("' + kw + '")';
  if (CONFIG.ALLOWED_SENDERS.length) {
    query += " (" + CONFIG.ALLOWED_SENDERS.map(function (a) { return "from:" + a; }).join(" OR ") + ")";
  }

  var threads = GmailApp.search(query, 0, CONFIG.MAX_PER_RUN);
  if (!threads.length) return;

  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    var msg = thread.getMessages()[thread.getMessageCount() - 1]; // latest message
    try {
      publishFromMessage_(msg);
      thread.addLabel(label);
      thread.markRead();
    } catch (err) {
      Logger.log("✖ " + msg.getSubject() + " → " + err);
      notifyError_(msg, String(err));
      thread.addLabel(label); // avoid reprocessing a broken one every 5 min
      thread.markRead();
    }
  }
}

function publishFromMessage_(msg) {
  var fromEmail = extractEmail_(msg.getFrom());
  if (CONFIG.ALLOWED_SENDERS.length &&
      CONFIG.ALLOWED_SENDERS.map(lc_).indexOf(lc_(fromEmail)) === -1) {
    throw new Error("Remitente no autorizado: " + fromEmail);
  }

  // Title = subject minus keyword
  var subject = String(msg.getSubject() || "").trim();
  var kw = String(CONFIG.KEYWORD || "").trim();
  if (kw) {
    var re = new RegExp("^" + escapeRe_(kw) + "\\b[:\\s-]*", "i");
    subject = subject.replace(re, "").trim();
  }

  // Article text: attachment > Google Doc link > body
  var extracted = extractContent_(msg);
  var article = (extracted.text || "").trim();
  if (!article) throw new Error("No encontré texto del artículo (cuerpo vacío, adjunto ilegible y sin Google Doc).");

  // If the subject had no title, take the first non-empty line of the article.
  var title = subject;
  if (!title) {
    var firstLine = article.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)[0] || "";
    title = firstLine.slice(0, 90);
  }
  if (!title) throw new Error("No pude determinar un título (asunto y cuerpo vacíos).");

  var slug = kebab_(title);
  if (!slug) throw new Error("El título no genera una URL válida: " + title);
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

  var filename = "drafts/" + today.iso + "-" + slug + ".md";
  commitFile_(filename, draft, "Publish via email: " + title);

  var url = CONFIG.SITE_BASE + "/" + slug + "/";
  notifyPublished_(title, url, extracted.source);
  if (CONFIG.NOTIFY_CONTACTS) notifyContacts_(title, url);
}

/* -------------------------------------------------- content extraction ---- */

function extractContent_(msg) {
  // 1) Attachments (skip inline images / tiny logos)
  var atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true }) || [];
  for (var i = 0; i < atts.length; i++) {
    var t = extractFromAttachment_(atts[i]);
    if (t && t.trim()) return { text: t, source: "adjunto (" + atts[i].getName() + ")" };
  }
  // 2) Google Doc link in the body
  var body = msg.getPlainBody() || "";
  var docId = (body.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/) || [])[1];
  if (docId) {
    try {
      var docText = DocumentApp.openById(docId).getBody().getText();
      if (docText && docText.trim()) return { text: docText, source: "Google Doc" };
    } catch (e) { /* fall through to body */ }
  }
  // 3) Plain body
  return { text: cleanBody_(body), source: "cuerpo del email" };
}

function extractFromAttachment_(att) {
  var name = (att.getName() || "adjunto").toLowerCase();
  var type = att.getContentType() || "";

  if (name.match(/\.txt$/) || type.indexOf("text/plain") === 0) {
    try { return att.getDataAsString(); } catch (e) { return null; }
  }

  var isDoc = name.match(/\.docx?$/) || type.indexOf("word") !== -1 ||
              type.indexOf("officedocument.wordprocessing") !== -1;
  var isPdf = name.match(/\.pdf$/) || type === "application/pdf";
  if (!isDoc && !isPdf) return null; // unsupported type — ignore

  // Convert to a temporary Google Doc (OCR for PDFs), read its text, delete it.
  // Requires the advanced "Drive API" service (version 2) to be enabled.
  var tmp = null;
  try {
    tmp = Drive.Files.insert(
      { title: "tmp-publish", mimeType: "application/vnd.google-apps.document" },
      att.copyBlob(),
      { convert: true, ocr: !!isPdf, ocrLanguage: "es" }
    );
    return DocumentApp.openById(tmp.id).getBody().getText();
  } catch (e) {
    Logger.log("adjunto no convertible: " + name + " → " + e);
    return null;
  } finally {
    if (tmp && tmp.id) { try { Drive.Files.remove(tmp.id); } catch (e2) {} }
  }
}

// Trim quoted replies / forwarded tails from a plain-text body.
function cleanBody_(body) {
  var lines = String(body || "").replace(/\r\n/g, "\n").split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l)) break;
    if (/^\s*(On|El) .+ (wrote|escribió):\s*$/.test(l)) break;
    if (/^\s*De:\s.+\bPara:\s/i.test(l)) break;
    if (/^\s*>/.test(l)) continue; // quoted line
    out.push(l);
  }
  return out.join("\n").trim();
}

/* --------------------------------------------------------- notifications -- */

function notifyPublished_(title, url, source) {
  if (!CONFIG.NOTIFY_EMAIL) return;
  var shareText = "📰 " + title + " — nueva publicación de " + CONFIG.BRAND_NAME + ":\n" + url;
  var waLink = "https://wa.me/?text=" + encodeURIComponent(shareText);

  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#141a4e;line-height:1.5">' +
    '<p>✅ <b>Publicado:</b> «' + escapeHtml_(title) + '»</p>' +
    '<p>Ya está online:<br><a href="' + url + '">' + url + '</a></p>' +
    '<p style="margin:18px 0">' +
    '<a href="' + waLink + '" style="background:#25D366;color:#fff;text-decoration:none;' +
    'padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">📲 Compartir por WhatsApp</a>' +
    '</p>' +
    '<p style="color:#556">Texto listo para compartir:</p>' +
    '<pre style="background:#f3f4f8;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:inherit">' +
    escapeHtml_(shareText) + '</pre>' +
    '<p style="color:#889;font-size:12px">Fuente del artículo: ' + escapeHtml_(source) + '</p>' +
    '</div>';

  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: "✅ Publicado: " + title,
    htmlBody: html,
    name: CONFIG.BRAND_NAME,
  });
}

function notifyContacts_(title, url) {
  var to = (CONFIG.NOTIFY_CONTACTS_TO || []).filter(Boolean);
  if (!to.length) return;
  var html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#141a4e;line-height:1.6">' +
    '<p>Nueva publicación de ' + escapeHtml_(CONFIG.BRAND_NAME) + ':</p>' +
    '<h2 style="margin:6px 0"><a href="' + url + '" style="color:#141a4e">' + escapeHtml_(title) + '</a></h2>' +
    '<p><a href="' + url + '">Leer la nota →</a></p>' +
    '</div>';
  // BCC so recipients don't see each other.
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL || to[0],
    bcc: to.join(","),
    subject: "📰 " + title + " — " + CONFIG.BRAND_NAME,
    htmlBody: html,
    name: CONFIG.BRAND_NAME,
  });
}

function notifyError_(msg, err) {
  if (!CONFIG.NOTIFY_EMAIL) return;
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAIL,
    subject: "⚠️ No se pudo publicar: " + (msg.getSubject() || "(sin asunto)"),
    body: "El email no se pudo publicar.\n\nMotivo: " + err +
      "\n\nAsunto: " + (msg.getSubject() || "") +
      "\nDe: " + msg.getFrom() +
      "\n\nRevisa que el asunto empiece por «" + CONFIG.KEYWORD + "» y que el artículo venga en el cuerpo, " +
      "en un adjunto (.docx/.pdf/.txt) o como enlace de Google Doc.",
    name: CONFIG.BRAND_NAME,
  });
}

/* ------------------------------------------------------------- helpers ---- */

function readToken_() {
  if (CONFIG.GITHUB_TOKEN) return CONFIG.GITHUB_TOKEN;
  var prop = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!prop) throw new Error("GITHUB_TOKEN no configurado (CONFIG o Script Properties).");
  return prop;
}

function commitFile_(filePath, contentStr, message) {
  var token = readToken_();
  var api = "https://api.github.com/repos/" + CONFIG.GITHUB_REPO +
    "/contents/" + encodeURI(filePath);
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

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function extractEmail_(from) {
  var m = String(from || "").match(/<([^>]+)>/);
  return (m ? m[1] : String(from || "")).trim();
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

function lc_(s) { return String(s || "").toLowerCase().trim(); }
function escapeRe_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml_(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
