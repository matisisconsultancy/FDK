# GVI inbox — infographics land here automatically

This folder is the **entry point for the daily dashboard update**. Images arrive
here on their own — you don't upload them by hand.

## How it works (via the Telegram publisher bot)

FDK already sends the daily edition to the **`fdk_publisher_bot`** Telegram bot
(the same one used to publish articles). A Google Apps Script polls that bot
every minute and now routes **both** parts of the message:

- 📊 **the infographic (photo)** → committed here, to `data/gvi/inbox/` →
  the **GVI daily auto-ingest** Action reads it with a vision model, updates
  `data/gvi/latest.json`, rebuilds `gvi-data.js`, and the **/gvi** dashboard
  refreshes.
- ✍️ **the caption/text (the edition)** → published as an article in
  The Velocity Edge (the existing flow).

One Telegram message → the dashboard **and** the article update. No transcription.

The Apps Script lives in the FDK Google account (the same one that publishes
articles). To enable the infographic route, apply the two additions in
[`forms/telegram-infographic-additions.md`](../../../forms/telegram-infographic-additions.md)
to that script — they add photo handling to the article bot you already run.

## Manual fallback

You can still drop an image here directly (commit, or GitHub web UI →
**Add file → Upload files**) and the same ingest Action processes it.

## Requirements (already in place)

- Repo secret **`ANTHROPIC_API_KEY`** (vision extraction + article formatting).
- Optional repo/org variable **`GVI_VISION_MODEL`** to pin a specific model.
- The Apps Script's `GITHUB_TOKEN` (Contents: read/write) — already set for articles.

## Notes

- Supported infographics: Country Rankings (daily), Corporate Rankings (daily),
  Country Weekly Scorecard, Corporate Rankings by Industry, Europe's Top
  Corporates by Country, and European Banks Rankings.
- An unrecognized image is left in place (not deleted) and logged.

