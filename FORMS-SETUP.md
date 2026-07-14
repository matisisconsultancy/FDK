# FDK EmpowerNet — Forms setup (free plan)

The site has **three** forms. The code is already wired; you only need to
paste **three values** into the config block at the top of `script.js`
(look for `const FDK_FORMS = { … }`), plus do a little dashboard setup.

Until a value is filled in, that form stays in **demo mode** — it looks like
it works but sends nothing — so the live site never breaks mid-setup.

| Form | Where | Config key | Backend |
|------|-------|-----------|---------|
| Book demos (Sample reader) | each book page `#downloadSample` | `kitBookForms` (one per book) | Kit / ConvertKit |
| Newsletter | intelligence-library `#subForm` | `kitNewsletterFormId` | Kit / ConvertKit |
| Briefing request | home page `#briefingForm` | `briefingEndpoint` | Google Apps Script |

---

## 1 · Book demos → Kit (ConvertKit), free plan — ONE FORM PER BOOK

Each book has its own page (`/the-rise-of-velocity/`, `/the-european-pivot/`,
`/the-age-of-intelligent-motion/`, …) and should have its **own Kit form**, so
each book emails **its own sample PDF**. Kit's free plan includes the
**confirmation email**, which is what auto-sends the sample.

For **each** book you want to offer:

1. Create a free account at **https://kit.com** (formerly ConvertKit).
2. **Grow → Landing Pages & Forms → Create New → Form → Inline.** Design
   doesn't matter (the site uses its own UI); you only need the form to exist.
   Name it after the book (e.g. "The Rise of Velocity").
3. Open the form → **Settings → Confirmation email**:
   - Keep **"Send confirmation email"** ON.
   - Leave **"Auto-confirm new subscribers"** OFF (standard double opt-in).
   - Under **"After confirming redirect to"**, choose **Download** and upload
     that book's sample **PDF** (or **URL** for an online link).
   - Optionally **Edit Email Contents** for the brand voice.
4. Find the **form ID** in the URL: `app.kit.com/forms/…/**9684960**/edit` —
   the number is the ID.
5. Add it to the `kitBookForms` map in `script.js`, keyed by the **exact**
   book title (must match the button's `data-title`):
   ```js
   kitBookForms: {
     "The Rise of Velocity": "9684960",
     "The European Pivot": "1234567",           // add when ready
     "The Age of Intelligent Motion": "7654321",// add when ready
   },
   ```
   A book with no entry stays in demo mode (reveals the preview, sends
   nothing) — so unfinished books never send the wrong PDF.

That's it — the site posts to `https://app.kit.com/forms/<id>/subscriptions`,
Kit stores the subscriber and fires the confirmation email with the sample.

### Newsletter form

The Intelligence Library newsletter (`#subForm`) uses its own form:
create one more Kit form (or reuse a book form) and paste its ID into
`kitNewsletterFormId`.

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
- [ ] Book form ID added to `kitBookForms` (one per book)
- [ ] `kitNewsletterFormId` filled in
- [ ] Apps Script deployed as Web app (Anyone), `/exec` URL copied
- [ ] `briefingEndpoint` filled in
- [ ] Submitted each form once and confirmed delivery
