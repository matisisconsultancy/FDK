/**
 * FDK EmpowerNet — Briefing form backend (Google Apps Script)
 * ------------------------------------------------------------
 * One free Google account gives you all three things the briefing
 * form needs:
 *   1. CRM      → every lead is appended as a row in a Google Sheet
 *   2. Team ping → you get an email the moment a lead comes in
 *   3. Auto-reply → the client gets an instant confirmation email
 *
 * SETUP (5 minutes) — full walkthrough in ../FORMS-SETUP.md
 *   1. Create a Google Sheet. Copy its ID from the URL:
 *        docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit
 *   2. Extensions → Apps Script. Delete the sample, paste this file.
 *   3. Fill in CONFIG below (SHEET_ID + TEAM_EMAIL).
 *   4. Deploy → New deployment → type "Web app":
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      Copy the /exec URL it gives you.
 *   5. Paste that URL into FDK_FORMS.briefingEndpoint in script.js.
 *
 * NOTE: the site posts the body as text/plain on purpose — that lets
 * the browser skip a CORS preflight that Apps Script can't answer.
 * We parse the JSON manually below.
 */

// ======================== CONFIG ========================
var CONFIG = {
  // Google Sheet ID (from the sheet's URL). Leave "" to auto-use the
  // sheet this script is bound to (Extensions → Apps Script route).
  SHEET_ID: "",
  SHEET_NAME: "Leads",

  // Where lead notifications go.
  TEAM_EMAIL: "fdkempowernet@gmail.com",

  // Shown to the client in the auto-reply. Purely cosmetic.
  BRAND_NAME: "FDK EmpowerNet",
  FROM_NAME: "FDK EmpowerNet",

  // Set to false to turn off the client auto-reply.
  SEND_AUTOREPLY: true,
};
// ========================================================

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); }
      catch (err) { data = (e.parameter || {}); } // fallback for form-encoded
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var lead = {
      name: String(data.name || "").trim(),
      email: String(data.email || "").trim(),
      company: String(data.company || "").trim(),
      sector: String(data.sector || "").trim(),
      message: String(data.message || "").trim(),
      source: String(data.source || "briefingForm").trim(),
      page: String(data.page || "").trim(),
    };

    // Minimal server-side validation.
    if (!lead.name || !isEmail(lead.email)) {
      return json({ ok: false, error: "invalid" });
    }

    appendToSheet_(lead);
    notifyTeam_(lead);
    if (CONFIG.SEND_AUTOREPLY) autoReply_(lead);

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// Health check — open the /exec URL in a browser to see this.
function doGet() {
  return json({ ok: true, service: "FDK briefing form", ready: true });
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function getSheet_() {
  var ss = CONFIG.SHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp", "Name", "Email", "Organisation",
      "Sector", "Decision / message", "Source", "Page",
    ]);
    sheet.getRange(1, 1, 1, 8).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendToSheet_(lead) {
  var sheet = getSheet_();
  sheet.appendRow([
    new Date(), lead.name, lead.email, lead.company,
    lead.sector, lead.message, lead.source, lead.page,
  ]);
}

function notifyTeam_(lead) {
  var subject = "New briefing request — " + lead.name +
    (lead.company ? " (" + lead.company + ")" : "");
  var body =
    "A new briefing request just came in.\n\n" +
    "Name:         " + lead.name + "\n" +
    "Work email:   " + lead.email + "\n" +
    "Organisation: " + (lead.company || "—") + "\n" +
    "Sector:       " + (lead.sector || "—") + "\n\n" +
    "Board-level AI decision:\n" + (lead.message || "—") + "\n\n" +
    "— sent from " + (lead.page || "the website");

  MailApp.sendEmail({
    to: CONFIG.TEAM_EMAIL,
    subject: subject,
    body: body,
    replyTo: lead.email, // hit "Reply" and it goes straight to the lead
    name: CONFIG.FROM_NAME,
  });
}

function autoReply_(lead) {
  var subject = "We've received your briefing request";
  var body =
    "Dear " + lead.name + ",\n\n" +
    "Thank you for reaching out to " + CONFIG.BRAND_NAME + ". " +
    "We've received your request for a board-level AI briefing and " +
    "will be in touch shortly.\n\n" +
    (lead.message
      ? "You told us:\n\"" + lead.message + "\"\n\n"
      : "") +
    "Warm regards,\n" +
    CONFIG.BRAND_NAME + "\n" +
    "Francesco de Leo Kaufmann";

  MailApp.sendEmail({
    to: lead.email,
    subject: subject,
    body: body,
    name: CONFIG.FROM_NAME,
    replyTo: CONFIG.TEAM_EMAIL,
  });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
