# FDK EmpowerNet — Forms setup (free plan)

The site has **three** forms. The code is already wired; you only need to
paste **three values** into the config block at the top of `script.js`
(look for `const FDK_FORMS = { … }`), plus do a little dashboard setup.

Until a value is filled in, that form stays in **demo mode** — it looks like
it works but sends nothing — so the live site never breaks mid-setup.

| Form | Where | Config key | Backend |
|------|-------|-----------|---------|
| Book demo (Sample reader) | home page `#downloadSample` | `kitBookFormId` | Kit / ConvertKit |
| Newsletter | intelligence-library `#subForm` | `kitNewsletterFormId` | Kit / ConvertKit |
| Briefing request | home page `#briefingForm` | `briefingEndpoint` | Google Apps Script |

---

## 1 · Book demo + Newsletter → Kit (ConvertKit), free plan

Kit's free plan includes the **incentive email**, which is what auto-sends
the demo the moment someone submits their email.

1. Create a free account at **https://kit.com** (formerly ConvertKit).
2. **Grow → Landing Pages & Forms → Create → Form → Inline.** Design doesn't
   matter (the site uses its own UI); you only need the form to exist.
3. Open the form → **Settings → Incentive email** → turn **ON**
   "Send incentive email". This is the email the visitor receives:
   - **Attach the demo** as a PDF, **or**
   - add a **button/link** that opens the demo online (e.g. a link to the
     sample chapter already on the site, or a Google Drive "anyone with the
     link" PDF).
   - Turn **off** "Auto-confirm new subscribers" only if you want
     double-opt-in; leave default for instant delivery.
4. Find the **form ID**: open the form, look at the URL
   `app.kit.com/forms/**1234567**/edit` — the number is the ID.
5. Paste it into `script.js`:
   ```js
   kitBookFormId: "1234567",
   kitNewsletterFormId: "1234567",   // same form, or a second one
   ```
   Use the **same** ID for both if you want one list, or create a second
   form for pure newsletter sign-ups and use its ID for the newsletter.

That's it — the site posts to `https://app.kit.com/forms/<id>/subscriptions`,
Kit stores the subscriber and fires the incentive email.

---

## 2 · Briefing form → Google Apps Script (Sheet + team email + auto-reply)

One free Google account covers the CRM, the team notification, and the
client auto-reply. Files: `forms/briefing-apps-script.gs`.

1. Create a new **Google Sheet** (this becomes your CRM). You can rename it
   "FDK Leads".
2. In the sheet: **Extensions → Apps Script.**
3. Delete the sample `myFunction`, then **paste the entire contents of
   `forms/briefing-apps-script.gs`.**
4. Edit the `CONFIG` block near the top:
   - `SHEET_ID`: leave `""` (the script is bound to this sheet), **or**
     paste the ID from the sheet URL
     `docs.google.com/spreadsheets/d/**<ID>**/edit`.
   - `TEAM_EMAIL`: where lead alerts go — already set to
     `fdkempowernet@gmail.com`.
5. **Deploy → New deployment → ⚙ → Web app:**
   - **Execute as:** Me
   - **Who has access:** **Anyone**
   - Click **Deploy**, approve the permissions prompt (needed to write the
     sheet and send email), then **copy the Web app URL** — it ends in
     `/exec`.
6. Paste that URL into `script.js`:
   ```js
   briefingEndpoint: "https://script.google.com/macros/s/AKfy…/exec",
   ```
7. Test: open the `/exec` URL in a browser — you should see
   `{"ok":true,"service":"FDK briefing form","ready":true}`. Then submit the
   real form on the site; a row appears in the sheet, you get an email, and
   the client gets an auto-reply.

**Updating the script later:** after editing the `.gs`, you must
**Deploy → Manage deployments → edit (pencil) → Version: New version →
Deploy**. The `/exec` URL stays the same, so you don't touch `script.js`
again.

---

## 3 · Go live

`script.js` is served from the production branch `claude/eager-carson-vjorjg`
(GitHub Pages). Commit the edited `script.js` and it's live in 1–2 minutes.

### Quick checklist
- [ ] Kit form created + incentive email ON with the demo attached/linked
- [ ] `kitBookFormId` filled in
- [ ] `kitNewsletterFormId` filled in
- [ ] Apps Script deployed as Web app (Anyone), `/exec` URL copied
- [ ] `briefingEndpoint` filled in
- [ ] Submitted each form once and confirmed delivery
