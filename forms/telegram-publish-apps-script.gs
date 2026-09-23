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
  ALLOWED_IDS: [6707632529, 1503851907, 153052893],

  // ---- Publishing ----
  BRAND_NAME: "FDK EmpowerNet",
  TIMEZONE: "Europe/Madrid",

  // Idioma de los mensajes de estado que ve quien publica: "it" o "en".
  LANG: "it",

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

// ===== Mensajes de estado para quien publica (idioma en CONFIG.LANG) =====
var TXT = {
  received:   { it: function (ed, t) { return "✅ <b>Ricevuto</b> · " + ed + ": «" + t + "»\nStiamo pubblicando — ti avviso qui appena è online (~1–2 min)."; },
                en: function (ed, t) { return "✅ <b>Received</b> · " + ed + ": «" + t + "»\nPublishing — I'll notify you here as soon as it's online (~1–2 min)."; } },
  seeStatus:  { it: "🔗 Stato", en: "🔗 Status" },
  online:     { it: function (t) { return "🟢 <b>È online:</b> «" + t + "»\n👇 Copia o inoltra questo messaggio per condividerlo:"; },
                en: function (t) { return "🟢 <b>It's live:</b> «" + t + "»\n👇 Copy or forward this message to share it:"; } },
  delReq:     { it: function (s) { return "🗑️ <b>Eliminazione richiesta:</b> «" + s + "»\nTi confermo qui appena non sarà più online (~1–2 min)."; },
                en: function (s) { return "🗑️ <b>Deletion requested:</b> «" + s + "»\nI'll confirm here as soon as it's offline (~1–2 min)."; } },
  deleted:    { it: function (s) { return "🗑️ <b>Eliminato:</b> «" + s + "» non è più online."; },
                en: function (s) { return "🗑️ <b>Deleted:</b> «" + s + "» is no longer online."; } },
  slow:       { it: function (k, s, u) { return "ℹ️ La " + (k === "publish" ? "pubblicazione" : "eliminazione") + " di «" + s + "» sta impiegando più del solito. Ricontrolla tra poco:\n" + u; },
                en: function (k, s, u) { return "ℹ️ The " + (k === "publish" ? "publishing" : "deletion") + " of «" + s + "» is taking longer than usual. Check again shortly:\n" + u; } },
  delUsage:   { it: "ℹ️ Per eliminare una nota scrivi:\n<code>borrar nota: &lt;url o slug&gt;</code>\nEsempio: <code>borrar nota: the-underwriting-test</code>\noppure incolla il link completo della nota.",
                en: "ℹ️ To delete a note, send:\n<code>borrar nota: &lt;url or slug&gt;</code>\nExample: <code>borrar nota: the-underwriting-test</code>\nor paste the note's full link." },
  delErr:     { it: function (e) { return "✖ Impossibile richiedere l'eliminazione: " + e; },
                en: function (e) { return "✖ Could not request the deletion: " + e; } },
  notAllowed: { it: "⛔ Questo utente non è autorizzato a pubblicare.\nInvia /id e passa quel numero all'amministratore del bot.",
                en: "⛔ This user is not authorized to publish.\nSend /id and give that number to the bot admin." },
  idMsg:      { it: function (id) { return "🆔 Il tuo id Telegram è: <code>" + id + "</code>\n\nPassalo a chi amministra il bot per autorizzarti."; },
                en: function (id) { return "🆔 Your Telegram id is: <code>" + id + "</code>\n\nGive it to the bot admin to authorize you."; } },
  noText:     { it: "⚠️ Non ho trovato testo da pubblicare.\n\n", en: "⚠️ I couldn't find any text to publish.\n\n" },
  noTitle:    { it: "⚠️ Non sono riuscito a leggere un titolo pulito. Invia il titolo su una riga a parte (senza la data).",
                en: "⚠️ I couldn't read a clean title. Send the title on its own line (without the date)." },
  badSlug:    { it: "⚠️ Il titolo non genera un URL valido. Usa del testo con lettere.",
                en: "⚠️ The title doesn't make a valid URL. Use text with letters." },
  pubErr:     { it: function (e) { return "✖ Impossibile pubblicare: " + e; }, en: function (e) { return "✖ Could not publish: " + e; } },
  delConfirm: { it: function (s) { return "🗑️ Vuoi eliminare «" + s + "»?\nRispondi <b>SÍ</b> per confermare, oppure <b>NO</b> per annullare."; },
                en: function (s) { return "🗑️ Delete «" + s + "»?\nReply <b>YES</b> to confirm, or <b>NO</b> to cancel."; } },
  delWhich:   { it: "🗑️ Quale nota vuoi eliminare? Incolla il link della nota, oppure scrivi:\n<code>borrar nota: &lt;url o slug&gt;</code>",
                en: "🗑️ Which note do you want to delete? Paste the note's link, or send:\n<code>borrar nota: &lt;url or slug&gt;</code>" },
  delCancelled: { it: "✖ Eliminazione annullata.", en: "✖ Deletion cancelled." },
};
function L(key) { var m = TXT[key]; return m ? (m[CONFIG.LANG] || m.it) : ""; }
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
    // Runs every minute: notify when a pending publish is actually live, or a
    // pending deletion is actually gone. Must be BEFORE the early return below.
    processPendingConfirms_();

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
          try { tgSend_(it.msg.chat && it.msg.chat.id, L("pubErr")(String(e))); } catch (e2) {}
        }
      }
      // Confirm through the LAST update in the group so retries never re-process.
      props.setProperty("TG_OFFSET", String(it.update_id + 1));
    }
  } finally {
    lock.releaseLock();
  }
}

// Merge consecutive text messages that are pieces of ONE long paste that
// Telegram split at its 4096-char limit. Telegram breaks at the nearest space/
// newline, so a piece can land below 4096 — length alone is unreliable. The
// dependable signal is TIME: split (or hand-continued) pieces arrive from the
// same user within a few seconds, while two distinct articles are always far
// apart. So we merge same-user text that arrives within WINDOW seconds of a
// prior SUBSTANTIAL piece (MIN_PREV guards against fusing two short notes).
function groupUpdates_(updates) {
  var items = [];
  var WINDOW = 20;      // seconds allowed between pieces of the same article
  var MIN_PREV = 1000;  // the running piece must be this big to accept a continuation
  for (var i = 0; i < updates.length; i++) {
    var u = updates[i];
    var msg = u.message || u.edited_message;
    if (!msg) { items.push({ update_id: u.update_id, msg: null }); continue; }

    var text = (typeof msg.text === "string") ? msg.text : null;
    var isCmd = text != null && /^\//.test(text.trim());
    var prev = items.length ? items[items.length - 1] : null;

    var canMerge = text != null && !isCmd && prev && prev.mergeable &&
      prev.chatId === (msg.chat && msg.chat.id) &&
      prev.fromId === (msg.from && msg.from.id) &&
      prev.len >= MIN_PREV &&
      (msg.date - prev.lastDate) <= WINDOW;

    if (canMerge) {
      prev.texts.push(text);
      prev.len += text.length;
      prev.lastDate = msg.date;
      prev.update_id = u.update_id; // still mergeable, so 3+ pieces also join
    } else {
      items.push({
        update_id: u.update_id,
        msg: msg,
        chatId: msg.chat && msg.chat.id,
        fromId: msg.from && msg.from.id,
        texts: text != null ? [text] : null,
        len: text != null ? text.length : 0,
        lastDate: msg.date,
        mergeable: text != null && !isCmd,
      });
    }
  }
  return items;
}

/* ============ PENDING CONFIRMATIONS (publish live / delete gone) ============ */

// Queue an item to confirm on a later poll once its URL state actually changes.
function addPendingConfirm_(entry) {
  var props = PropertiesService.getScriptProperties();
  var list = [];
  try { var raw = props.getProperty("PENDING_CONFIRMS"); if (raw) list = JSON.parse(raw); } catch (e) {}
  entry.since = Date.now();
  list.push(entry);
  props.setProperty("PENDING_CONFIRMS", JSON.stringify(list));
}

// Each poll: for each pending item, check the real URL and notify when ready.
function processPendingConfirms_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("PENDING_CONFIRMS");
  if (!raw) return;
  var list;
  try { list = JSON.parse(raw); } catch (e) { props.deleteProperty("PENDING_CONFIRMS"); return; }
  if (!list || !list.length) return;

  var now = Date.now();
  var keep = [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    var live = urlIsLive_(e.url);
    if (e.type === "publish" && live) {
      // Now visible → send the clean, shareable message (link is safe to forward).
      tgSend_(e.chatId, L("online")(escapeHtml_(e.title || e.slug)));
      tgSend_(e.chatId, buildShare_(e.title || e.slug, e.url, e.edition || ""));
      continue;
    }
    if (e.type === "delete" && !live) {
      tgSend_(e.chatId, L("deleted")(escapeHtml_(e.slug)));
      continue;
    }
    // Not ready yet — give up after 25 min so nothing lingers forever.
    if (now - (e.since || now) > 25 * 60 * 1000) {
      tgSend_(e.chatId, L("slow")(e.type, escapeHtml_(e.slug), e.url));
      continue;
    }
    keep.push(e);
  }
  if (keep.length) props.setProperty("PENDING_CONFIRMS", JSON.stringify(keep));
  else props.deleteProperty("PENDING_CONFIRMS");
}

// Commit an unpublish marker and start watching for the note to go offline.
// Shared by the explicit command and the confirmed loose-intent path.
function doUnpublish_(chatId, slug) {
  try {
    commitFile_("drafts/unpublish/" + slug + ".txt", slug + "\n", "Unpublish via Telegram: " + slug);
    var durl = CONFIG.SITE_BASE + "/" + slug + "/";
    tgSend_(chatId, L("delReq")(escapeHtml_(slug)));
    addPendingConfirm_({ type: "delete", slug: slug, chatId: chatId, url: durl });
  } catch (err) {
    tgSend_(chatId, L("delErr")(String(err)));
  }
}

// A short-lived "delete X?" question, per chat, awaiting a SÍ/NO answer.
function pendingDeleteKey_(chatId) { return "PENDING_DELETE_" + chatId; }
function setPendingDelete_(chatId, slug) {
  PropertiesService.getScriptProperties()
    .setProperty(pendingDeleteKey_(chatId), JSON.stringify({ slug: slug, since: Date.now() }));
}
function getPendingDelete_(chatId) {
  var raw = PropertiesService.getScriptProperties().getProperty(pendingDeleteKey_(chatId));
  if (!raw) return null;
  try {
    var p = JSON.parse(raw);
    if (Date.now() - (p.since || 0) > 10 * 60 * 1000) { clearPendingDelete_(chatId); return null; } // expire after 10 min
    return p;
  } catch (e) { clearPendingDelete_(chatId); return null; }
}
function clearPendingDelete_(chatId) {
  PropertiesService.getScriptProperties().deleteProperty(pendingDeleteKey_(chatId));
}

// True when the URL responds 200 (the page is actually served).
function urlIsLive_(url) {
  try {
    var res = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true, followRedirects: true });
    return res.getResponseCode() === 200;
  } catch (e) { return false; }
}

// Handle one Telegram message: commands, allow-list, then publish + reply.
function processMessage_(msg) {
  var chatId = msg.chat && msg.chat.id;
  var fromId = msg.from && msg.from.id;
  var text = String(msg.text || "").trim();

  // ---- helper commands (never publish) ----
  if (text === "/id" || text === "/id@") {
    tgSend_(chatId, L("idMsg")(fromId));
    return;
  }
  if (/^\/(start|help|ayuda)\b/i.test(text)) { tgSend_(chatId, helpText_()); return; }

  // ---- allow-list ----
  if (CONFIG.ALLOWED_IDS.length && CONFIG.ALLOWED_IDS.indexOf(fromId) === -1) {
    tgSend_(chatId, L("notAllowed"));
    return;
  }

  // ---- delete flow ------------------------------------------------------
  // The bot must NEVER publish a delete request as a new note. Three layers:
  //   1. a pending confirmation (the user answered SÍ/NO to "delete X?");
  //   2. an explicit command "borrar nota: <url|slug>" → delete immediately;
  //   3. a *loose* delete intent — one of our own links pasted, or a short
  //      message with a delete verb ("bórrala", "elimina la de prueba",
  //      "borrado", …). These are confirmed (or we ask which note), and are
  //      intercepted BEFORE the publish path so they can't become junk notes.

  // 1) answer to a pending "delete X?" question -------------------------------
  var pend = getPendingDelete_(chatId);
  if (pend) {
    if (/^\s*(?:s[íìi]|yes|ok(?:ay)?|va bene|conferm[oa]|d(?:'|’)accordo|dai|certo|s[íì]\s*b[óo]rra|b[óo]rrala|elimina(?:la)?|adelante)\b/i.test(text)) {
      clearPendingDelete_(chatId);
      doUnpublish_(chatId, pend.slug);
      return;
    }
    if (/^\s*(?:no|annulla|cancell?a|cancel(?:ar)?|stop|ferma|lascia)\b/i.test(text)) {
      clearPendingDelete_(chatId);
      tgSend_(chatId, L("delCancelled"));
      return;
    }
    // Any other message abandons the pending delete and is handled normally.
    clearPendingDelete_(chatId);
  }

  // 2) explicit command → delete immediately (trusted, one step) ---------------
  var del = text.match(/^\s*(?:\/(?:borrar|eliminar|delete)\b\s*|(?:borrar|eliminar|delete)\s+(?:la\s+)?(?:nota|note)\b\s*[:：]?\s*|(?:borrar|eliminar|delete)\s*[:：]\s*)([\s\S]*)$/i);
  if (del) {
    var slugCmd = slugFromArg_(del[1]);
    if (!slugCmd) { tgSend_(chatId, L("delUsage")); return; }
    doUnpublish_(chatId, slugCmd);
    return;
  }

  // 3) loose delete intent (plain text only; documents are always articles) ----
  if (msg.text && !msg.document) {
    var host = String(CONFIG.SITE_BASE || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    var siteRe = new RegExp(host.replace(/[.]/g, "\\.") + "\\/([a-z0-9][a-z0-9-]*)", "i");
    var mUrl = host ? text.match(siteRe) : null;
    var deleteVerb = /\b(?:borra(?:r|do|la)?|b[óo]rrala|elimina(?:r|la|re)?|cancell?a(?:re)?|delete|remove|unpublish|quita(?:r|la)?)\b/i.test(text);
    var words = text.trim().split(/\s+/).filter(Boolean).length;
    var isShort = words <= 15 && (text.match(/\n/g) || []).length <= 1;

    // A) one of our own note links pasted → confirm deleting that slug.
    if (mUrl && mUrl[1]) {
      setPendingDelete_(chatId, mUrl[1].toLowerCase());
      tgSend_(chatId, L("delConfirm")(escapeHtml_(mUrl[1].toLowerCase())));
      return;
    }
    // B) short message with a delete verb but no link.
    if (deleteVerb && isShort) {
      // Try "borrar <slug>" style where the slug is a single hyphenated token.
      var mSlug = text.match(/\b([a-z0-9]+(?:-[a-z0-9]+){1,})\b/i);
      if (mSlug) {
        setPendingDelete_(chatId, mSlug[1].toLowerCase());
        tgSend_(chatId, L("delConfirm")(escapeHtml_(mSlug[1].toLowerCase())));
      } else {
        tgSend_(chatId, L("delWhich"));   // delete intent, but we don't know which note
      }
      return;
    }
  }

  // ---- gather the article (document > text) ----
  var got = extractContent_(msg);       // { text, title, source }
  var raw = (got.text || "").trim();
  if (!raw) { tgSend_(chatId, L("noText") + helpText_()); return; }

  // A masthead line ("The Velocity Edge — In Focus | August 4, 2026 | FDK")
  // NEVER becomes the title: we only lift the DATE and the EDITION from it.
  // The real (chapter) title is the next line.
  var parsed = parseHeader_(raw);

  var title, article;
  if (got.title && got.title.trim()) {
    // A document caption is the explicit title; strip a masthead from the body.
    title = got.title.trim();
    article = parsed.hadMasthead ? parsed.body : raw;
  } else {
    title = parsed.title;
    article = parsed.body;
  }
  var rawTitle = String(title || "").trim().slice(0, 200);
  // A date written in the title becomes the note's DATE — never part of the title.
  var titleDate = parsed.dateObj ? null : dateFromText_(rawTitle);
  title = cleanTitle_(rawTitle); // strip date / FDK / brand / dashes → Title Case
  if (!title) { tgSend_(chatId, L("noTitle")); return; }
  if (!article) article = title;

  var slug = kebab_(title);
  if (!slug) { tgSend_(chatId, L("badSlug")); return; }

  // ---- date + edition: masthead > date-in-title > today / by-time -----------
  var when = (parsed.dateObj || titleDate) ? dateParts_(parsed.dateObj || titleDate) : todayParts_();
  var ed = parsed.edition ? { slot: parsed.edition, label: parsed.edition } : editionFor_(new Date());

  // ---- build + commit the draft (title/slug pinned; body AI-formatted) ----
  var draft =
    "---\n" +
    "title: " + title + "\n" +
    "slug: " + slug + "\n" +
    "date: " + when.pretty + "\n" +
    "slot: " + ed.slot + "\n" +
    "format: ai\n" +
    "---\n\n" +
    article + "\n";

  commitFile_("drafts/" + when.iso + "-" + slug + ".md", draft, "Publish via Telegram: " + title);

  var url = CONFIG.SITE_BASE + "/" + slug + "/";

  // Instant receipt only — NOT the shareable link yet: the note is not visible
  // until the build + Pages deploy finish. The shareable message is sent later,
  // once we've verified the URL is actually live (see processPendingConfirms_).
  // Receipt only — no link at all. The link arrives when the note is live.
  tgSend_(chatId, L("received")(escapeHtml_(ed.label), escapeHtml_(title)));

  addPendingConfirm_({ type: "publish", slug: slug, chatId: chatId, url: url, title: title, edition: ed.label });
}

// Split the incoming text into { title, body, dateObj, edition, hadMasthead }.
// If the first line is a masthead ("The Velocity Edge — In Focus | August 4,
// 2026 | FDK") it is removed from the title and only used to lift the date and
// the edition; the real title is the next non-empty line.
function parseHeader_(text) {
  var lines = String(text || "").split(/\r?\n/);
  var i = 0;
  while (i < lines.length && !lines[i].trim()) i++;   // first non-empty line
  var first = (lines[i] || "").trim();

  var mast = detectMasthead_(first);
  if (mast) {
    var j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++; // title = next non-empty
    var title = (lines[j] || "").trim();
    var body;
    if (title) body = lines.slice(j + 1).join("\n").trim();
    else       body = lines.slice(i + 1).join("\n").trim();
    return { title: title, body: body, dateObj: mast.dateObj, edition: mast.edition, hadMasthead: true };
  }
  return {
    title: first,
    body: lines.slice(i + 1).join("\n").trim(),
    dateObj: null, edition: null, hadMasthead: false,
  };
}

// Detect a masthead line and pull its date + edition. Handles both "|" and
// em/en-dash separators, e.g. "The Velocity Edge — Closing of the Day |
// August 12, 2026 | FDK". Returns null if the line is just a normal title.
function detectMasthead_(line) {
  if (!line) return null;
  // Dates in BOTH orders: "August 4, 2026" and "22 September 2026".
  var DATE = "(?:[A-Z][a-z]+\\s+\\d{1,2},?\\s*\\d{4}|\\d{1,2}\\s+[A-Z][a-z]+\\s+\\d{4})";
  var hasDate = new RegExp(DATE).test(line);
  // The line minus any date/FDK/brand/separators (incl. ":") — is what's left
  // JUST an edition name? (so a bare "Closing of the Day" or "22 September
  // 2026: Provisional Nowcast" is read as the edition, not the title).
  var bare = line.replace(new RegExp(DATE, "g"), "").replace(/\bfdk\b/gi, "")
                 .replace(/the\s+velocity\s+edge/gi, "").replace(/[|—–:]/g, " ")
                 .replace(/\s{2,}/g, " ").trim();
  var editionOnly = /^(the\s+)?(closing(\s+of\s+the\s+day)?|the\s+close|morning\s+view|morning\s+note|midday(\s+pulse)?|in\s+focus|night\s+briefing|evening(\s+note)?|market\s+watch|breaking\s+news|(daily\s+|provisional\s+)?nowcast|executive\s+synthesis|sunday\s+edition|today'?s?\s+edition|the\s+week\s+ahead)$/i.test(bare);
  var looks = /the velocity edge/i.test(line) || /\bFDK\b/i.test(line) ||
              (/[|—–:]/.test(line) && hasDate) || editionOnly || (hasDate && bare === "");
  if (!looks) return null;

  var dateObj = null;
  var dm = line.match(new RegExp(DATE));
  if (dm) { var d = new Date(dm[0]); if (!isNaN(d.getTime())) dateObj = d; }

  // Split on | — – : and pick the segment that is the edition (not the brand,
  // not the date, not "FDK").
  var segs = line.split(/\s*[|—–:]\s*/);
  var edition = null;
  for (var i = 0; i < segs.length; i++) {
    var seg = String(segs[i] || "").trim();
    if (!seg) continue;
    if (/^the\s+velocity\s+edge$/i.test(seg)) continue;
    if (/^fdk$/i.test(seg)) continue;
    if (new RegExp("^" + DATE + "$").test(seg)) continue; // the date segment
    edition = seg; break;
  }
  return { dateObj: dateObj, edition: edition ? normalizeEdition_(edition) : null };
}

// Map whatever edition wording the note uses to a canonical site slot, so the
// note is classified and time-stamped correctly (Morning View / Midday Pulse /
// The Close…). Unknown editions are kept (tidied) as-is.
function normalizeEdition_(ed) {
  var e = String(ed || "").toLowerCase();
  if (/clos/.test(e)) return "The Close";              // The Close / Closing of the Day
  if (/morning/.test(e)) return "Morning View";
  if (/midday|mid-day|midday pulse/.test(e)) return "Midday Pulse";
  if (/in\s*focus/.test(e)) return "In Focus";
  if (/night|evening|midnight/.test(e)) return "The Close";
  return toTitleCase_(ed);
}

// Pull a "Month D, YYYY" date out of free text (title or masthead), if present.
function dateFromText_(t) {
  t = String(t || "");
  var m = t.match(/([A-Z][a-z]+\s+\d{1,2},?\s*\d{4})/) || // "August 4, 2026"
          t.match(/(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/);      // "22 September 2026"
  if (m) { var d = new Date(m[1]); if (!isNaN(d.getTime())) return d; }
  return null;
}

// Clean a title into a publishable one: remove any date, weekday prefix, "FDK"
// and the brand, turn masthead separators (| — –) into a colon, and apply Title
// Case. Dates and cruft never belong in the title — the date goes to the note.
function cleanTitle_(t) {
  t = String(t || "");
  t = t.replace(/^\s*(mon|tues|wednes|thurs|fri|satur|sun)day\b\s*,?\s*/i, ""); // weekday prefix
  t = t.replace(/[A-Za-z]+\s+\d{1,2},?\s*\d{4}/g, "");     // dates "Month D, YYYY"
  t = t.replace(/\d{1,2}\s+[A-Za-z]+\s+\d{4}/g, "");       // dates "DD Month YYYY"
  t = t.replace(/\bfdk\b/gi, "");
  t = t.replace(/the\s+velocity\s+edge/gi, "");
  var parts = t.split(/\s*[|—–]\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
  t = parts.join(": ");
  t = t.replace(/\s{2,}/g, " ").replace(/^[\s:,\-]+|[\s:,\-]+$/g, "").trim();
  return toTitleCase_(t);
}

// Normalize a title to natural Title Case, whatever case it arrives in
// (ALL CAPS, all-lowercase, or mixed). Minor words (the, of, and, to…) stay
// lowercase unless first/last. Preserves acronyms and proper nouns that carry
// internal capitals (AI, GVI, FDK, SoftBank, OpenAI…).
function toTitleCase_(s) {
  s = String(s || "").trim();
  if (!s) return s;
  var letters = s.replace(/[^A-Za-z]/g, "");
  var allCaps = letters && letters === letters.toUpperCase();
  var MINOR = { a:1,an:1,and:1,as:1,at:1,but:1,by:1,"for":1,"if":1,"in":1,nor:1,of:1,on:1,or:1,per:1,the:1,to:1,up:1,via:1,vs:1 };
  var KNOWN = { ai:"AI",gvi:"GVI",fdk:"FDK",us:"US",usa:"USA",uk:"UK",eu:"EU",gdp:"GDP",ceo:"CEO",cfo:"CFO",gpu:"GPU",cpu:"CPU",amd:"AMD",ipo:"IPO",ii:"II",iii:"III",iv:"IV",vi:"VI",vii:"VII",viii:"VIII",ix:"IX",q1:"Q1",q2:"Q2",q3:"Q3",q4:"Q4" };
  var tokens = s.split(/(\s+)/);
  var n = s.trim().split(/\s+/).length;
  var idx = 0;
  var breaker = false; // a colon or dash just before → capitalize the next word
  return tokens.map(function (tok) {
    if (tok === "" || /^\s+$/.test(tok)) return tok;
    idx++;
    var m = tok.match(/^([^A-Za-z0-9]*)([\s\S]*?)([^A-Za-z0-9]*)$/);
    var pre = m[1], core = m[2], post = m[3];
    if (!core) { if (/[:—–]/.test(tok)) breaker = true; return tok; }
    var forceCap = breaker || /[:—–]/.test(pre);
    breaker = /[:—–]/.test(post);
    var lower = core.toLowerCase();
    if (KNOWN[lower]) return pre + KNOWN[lower] + post;
    if (!allCaps && /[A-Z]/.test(core.slice(1))) return pre + core + post; // proper noun / acronym
    var isEdge = (idx === 1 || idx === n || forceCap);
    if (!isEdge && MINOR[lower]) return pre + lower + post;
    return pre + lower.charAt(0).toUpperCase() + lower.slice(1) + post;
  }).join("");
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
  var b = escapeHtml_(CONFIG.BRAND_NAME);
  if (CONFIG.LANG === "en") {
    return "👋 <b>" + b + " — publisher</b>\n\n" +
      "To publish a note, send me:\n" +
      "• <b>Text:</b> the <u>title on the 1st line</u> and the article below, or\n" +
      "• <b>A document</b> (.docx, .pdf or .txt) with the title as the caption.\n\n" +
      "In ~1–2 min I'll message you here with the link, ready to share.\n\n" +
      "🗑️ <b>Delete a note:</b> <code>borrar nota: &lt;url or slug&gt;</code>\n\n" +
      "Commands: /id (your id) · /help (this help)";
  }
  return "👋 <b>" + b + " — publisher</b>\n\n" +
    "Per pubblicare una nota, inviami:\n" +
    "• <b>Testo:</b> il <u>titolo nella 1ª riga</u> e l'articolo sotto, oppure\n" +
    "• <b>Un documento</b> (.docx, .pdf o .txt) con il titolo come didascalia.\n\n" +
    "In ~1–2 min ti scrivo qui con il link, pronto da condividere.\n\n" +
    "🗑️ <b>Eliminare una nota:</b> <code>borrar nota: &lt;url o slug&gt;</code>\n\n" +
    "Comandi: /id (il tuo id) · /help (questo aiuto)";
}

// Extract a slug from a /borrar argument: a full note URL or a bare slug.
function slugFromArg_(arg) {
  arg = String(arg || "").trim();
  if (!arg) return "";
  arg = arg.replace(/^https?:\/\/[^\/]+/i, "");   // drop scheme + host if a URL
  var seg = arg.split(/[\/?#]/).filter(Boolean).pop() || arg; // last path segment
  return String(seg).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function kebab_(s) {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’'"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function todayParts_() { return dateParts_(new Date()); }

function dateParts_(d) {
  var tz = CONFIG.TIMEZONE || "Etc/UTC";
  return {
    iso: Utilities.formatDate(d, tz, "yyyy-MM-dd"),
    pretty: Utilities.formatDate(d, tz, "MMMM d, yyyy"),
  };
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
