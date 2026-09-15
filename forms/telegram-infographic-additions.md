# Telegram bot — add infographics → GVI dashboard

The article publisher bot (`forms/telegram-publish-apps-script.gs`, from the
article-automation work) already turns a Telegram message into a published
article. These two additions make the **same bot** also send any **photo**
(an FDK GVI infographic) to the dashboard: the image is committed to
`data/gvi/inbox/`, where the *GVI daily auto-ingest* Action reads it with a
vision model and refreshes **/gvi**. If the photo carries a caption long enough
to be an edition, that caption is still published as the article — so one FDK
message updates the dashboard **and** the article library.

> Apply this to the running Google Apps Script project (script.google.com) and,
> for the repo record, to `forms/telegram-publish-apps-script.gs` on the branch
> that owns it (the article-automation branch). It is kept here as a patch so
> the two pull requests don't both edit the same file and collide.

Everything reuses functions already in that script (`tgDownload_`, `tgSend_`,
`todayParts_`, `readToken_`, `CONFIG`). Nothing else changes.

---

## 1 · In `processMessage_`, right after the allow-list block

Find:

```js
  // ---- allow-list ----
  if (CONFIG.ALLOWED_IDS.length && CONFIG.ALLOWED_IDS.indexOf(fromId) === -1) {
    tgSend_(chatId, "⛔ Este usuario no está autorizado para publicar.\n" +
      "Envía /id y pasa ese número al administrador del bot.");
    return;
  }
```

Insert immediately below it:

```js
  // ---- infographic? (a photo, or an image sent as a file) → GVI dashboard ----
  // FDK usually sends the daily infographic AND the article in one message. The
  // image goes to data/gvi/inbox/ (a GitHub Action reads it with a vision model
  // and refreshes /gvi); a long-enough caption is ALSO published as the article.
  var infographicId = null, infographicExt = ".jpg";
  if (msg.photo && msg.photo.length) {
    infographicId = msg.photo[msg.photo.length - 1].file_id; // largest rendition
  } else if (msg.document && /^image\/(jpeg|jpg|png|webp)$/i.test(msg.document.mime_type || "")) {
    infographicId = msg.document.file_id;
    var mt = msg.document.mime_type || "";
    infographicExt = mt.indexOf("png") !== -1 ? ".png" : mt.indexOf("webp") !== -1 ? ".webp" : ".jpg";
  }
  if (infographicId) {
    var blob = tgDownload_(infographicId, "infographic");
    if (!blob) { tgSend_(chatId, "⚠️ No pude descargar la imagen. Reenvíala, por favor."); return; }
    var iso = todayParts_().iso;
    var imgPath = "data/gvi/inbox/tg-" + iso + "-" + msg.message_id + infographicExt;
    commitBlob_(imgPath, blob, "GVI infographic via Telegram (" + iso + ")");
    tgSend_(chatId, "📊 <b>Infografía recibida</b> — el dashboard se actualizará en ~1–2 min:\n" +
      CONFIG.SITE_BASE + "/gvi/");

    var cap = String(msg.caption || "").trim();
    if (cap.length >= 40) {
      // also publish the caption as an article — reuse the whole article flow below
      msg.text = cap; msg.caption = ""; msg.photo = null; msg.document = null;
    } else {
      return; // infographic only, no article
    }
  }
```

## 2 · Add this function (next to `commitFile_`)

```js
// Commit a binary file (e.g. an infographic image) to GitHub. Same as
// commitFile_ but base64-encodes raw bytes instead of a UTF-8 string.
function commitBlob_(filePath, blob, message) {
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
    content: Utilities.base64Encode(blob.getBytes()),
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
```

---

## Requirements (already satisfied by the article bot)

- The Apps Script's `GITHUB_TOKEN` needs **Contents: read/write** on the repo —
  the same permission it already uses to commit article drafts, so images work too.
- `CONFIG.GITHUB_BRANCH` must be the branch where the dashboard lives (production,
  `claude/eager-carson-vjorjg`). The `gvi-ingest` workflow is wired to run on a
  push to `data/gvi/inbox/**` on that branch.
- Repo secret `ANTHROPIC_API_KEY` (already set) powers the vision extraction.
