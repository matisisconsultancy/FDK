/**
 * FDK EmpowerNet — WhatsApp → publish backend (Google Apps Script)
 * -----------------------------------------------------------------
 * Turns a WhatsApp message into a published note on the site, hands-free:
 *
 *   FDK (WhatsApp) ──▶ Twilio ──▶ this web app ──▶ GitHub (drafts/)
 *                         ▲                              │
 *                         └──── reply with live link     ▼
 *                                         GitHub Action → AI formats → publishes
 *
 * The message becomes a draft under `drafts/`, which the repo's existing
 * "Publish drafts" GitHub Action formats (AI) and publishes. Because we pin the
 * `title` and `slug` in the draft's front-matter, we can reply with the exact
 * live URL immediately — before the build even finishes.
 *
 * SETUP — full walkthrough in ../WHATSAPP-SETUP.md. In short:
 *   1. Create a GitHub fine-grained token (Contents: Read/Write on the repo).
 *   2. Create a new Apps Script project, paste this file.
 *   3. Fill in CONFIG below (GITHUB_TOKEN via Script Properties + ALLOWED_SENDERS).
 *   4. Deploy → New deployment → Web app (Execute as: Me · Access: Anyone).
 *   5. Paste the /exec URL into Twilio's WhatsApp "When a message comes in".
 *
 * SECURITY: store the token in Script Properties, not in the file (see
 * readToken_). Only numbers in ALLOWED_SENDERS can publish, and the message
 * must start with the KEYWORD — so a stray WhatsApp never goes live.
 *
 * DIAGNOSTICS: doPost + reply_ write to the Apps Script execution log
 * (Logger.log). Run testGitHub() / testDoPost() straight from the editor to
 * check the GitHub commit path and the message handling without WhatsApp.
 */

// ======================== CONFIG ========================
var CONFIG = {
  // ---- GitHub ----
  // Prefer Script Properties (⚙ Project settings ▸ Script properties):
  // add a property named GITHUB_TOKEN. Leaving this "" then reads it from there.
  GITHUB_TOKEN: "",
  GITHUB_REPO: "matisisconsultancy/FDK",
  // The branch GitHub Pages serves (where drafts must land to go live).
  GITHUB_BRANCH: "claude/eager-carson-vjorjg",
  SITE_BASE: "https://fdkempowernet.com",

  // ---- WhatsApp gate ----
  // The message must start with this word (case-insensitive) to publish.
  KEYWORD: "PUBLICAR",
  // Numbers allowed to publish — E.164 with country code, no "whatsapp:" prefix.
  // Leave the array empty to allow any sender (NOT advised in production).
  ALLOWED_SENDERS: ["+34600358822"],

  // Default edition slot (see drafts/README.md for the full list).
  DEFAULT_SLOT: "Midday Pulse",
  // Timezone for the edition date + filename.
  TIMEZONE: "Europe/Madrid",
};
// ========================================================

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};
    var from = String(p.From || "").replace(/^whatsapp:/i, "").trim();
    var body = String(p.Body || "").trim();
    Logger.log("IN from=[" + from + "] body=[" + body + "]");

    // 1 · sender allow-list
    if (CONFIG.ALLOWED_SENDERS.length && CONFIG.ALLOWED_SENDERS.indexOf(from) === -1) {
      return reply_("⛔ Este número no está autorizado para publicar.");
    }

    // 2 · keyword gate
    var kw = String(CONFIG.KEYWORD || "").trim();
    if (kw) {
      var re = new RegExp("^" + escapeRe_(kw) + "\\b[:\\s]*", "i");
      if (!re.test(body)) {
        return reply_("ℹ️ Para publicar, empieza el mensaje con «" + kw +
          "», luego el título en la primera línea y el artículo debajo.");
      }
      body = body.replace(re, "").trim();
    }
    if (!body) return reply_("⚠️ El mensaje está vacío. Título en la 1ª línea y el texto debajo.");

    // 3 · first line = title, the rest = article body
    var lines = body.split(/\r?\n/);
    var title = String(lines.shift() || "").trim();
    var article = lines.join("\n").trim();
    if (!title) return reply_("⚠️ Falta el título en la primera línea.");
    if (!article) article = title; // allow a one-line note

    var slug = kebab_(title);
    if (!slug) return reply_("⚠️ El título no genera una URL válida. Usa algún texto con letras.");
    var today = todayParts_();

    // 4 · build the draft (front-matter pins title/slug so the link is known;
    //     `format: ai` tells the pipeline to still AI-structure the body).
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

    // 5 · commit → triggers the Publish drafts Action
    commitFile_(filename, draft, "Publish via WhatsApp: " + title);

    // 6 · instant reply with the (predicted, exact) live link
    var url = CONFIG.SITE_BASE + "/" + slug + "/";
    return reply_("✅ Recibido: «" + title + "».\n" +
      "Se está publicando y estará online en 1–2 min aquí:\n" + url);
  } catch (err) {
    return reply_("✖ No se pudo publicar: " + String(err));
  }
}

// Health check — open the /exec URL in a browser to see this.
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: "FDK WhatsApp publisher", ready: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- helpers ----

function readToken_() {
  if (CONFIG.GITHUB_TOKEN) return CONFIG.GITHUB_TOKEN;
  var prop = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!prop) throw new Error("GITHUB_TOKEN no configurado (CONFIG o Script Properties).");
  return prop;
}

// Reply to Twilio with TwiML — Twilio relays this back to the sender on WhatsApp.
function reply_(msg) {
  Logger.log("REPLY: " + msg);
  var xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' +
    xmlEscape_(msg) + "</Message></Response>";
  return ContentService.createTextOutput(xml).setMimeType(ContentService.MimeType.XML);
}

// Mirror of the site's slug rule, plus accent-folding for clean URLs.
function kebab_(s) {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents (é → e)
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

function commitFile_(filePath, contentStr, message) {
  var token = readToken_();
  var api = "https://api.github.com/repos/" + CONFIG.GITHUB_REPO +
    "/contents/" + encodeURI(filePath);
  var headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  // If a file with this name already exists we need its sha to overwrite it.
  var sha = null;
  var getRes = UrlFetchApp.fetch(api + "?ref=" + encodeURIComponent(CONFIG.GITHUB_BRANCH), {
    method: "get", headers: headers, muteHttpExceptions: true,
  });
  if (getRes.getResponseCode() === 200) {
    sha = JSON.parse(getRes.getContentText()).sha;
  }

  var payload = {
    message: message,
    content: Utilities.base64Encode(contentStr, Utilities.Charset.UTF_8),
    branch: CONFIG.GITHUB_BRANCH,
  };
  if (sha) payload.sha = sha;

  var putRes = UrlFetchApp.fetch(api, {
    method: "put",
    headers: headers,
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = putRes.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error("GitHub " + code + ": " + putRes.getContentText());
  }
}

function xmlEscape_(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function escapeRe_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ----------------------------------------------------------- diagnostics ----
// Run these straight from the editor (pick the function, press ▷ Run) and read
// the execution log. They are safe manual helpers — Twilio never calls them.

function testGitHub() {
  try {
    var t = todayParts_();
    commitFile_(
      "drafts/" + t.iso + "-test-directo.md",
      "---\ntitle: Test Directo\nslug: test-directo\ndate: " + t.pretty +
        "\nslot: Midday Pulse\nformat: ai\n---\n\nPrueba directa desde Apps Script.\n",
      "Test directo desde Apps Script"
    );
    Logger.log("✅ OK: commit hecho. Revisa GitHub.");
  } catch (e) {
    Logger.log("✖ ERROR: " + e.message);
  }
}

// Simulates the exact POST Twilio sends, against this editor's code.
function testDoPost() {
  var fake = {
    parameter: {
      From: "whatsapp:+34600358822",
      Body: "PUBLICAR\nPrueba Simulada\nCuerpo de prueba enviado como si viniera de WhatsApp.",
    },
  };
  var out = doPost(fake);
  Logger.log("RESPUESTA XML:\n" + out.getContent());
}
