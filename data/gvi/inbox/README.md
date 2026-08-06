# GVI inbox — drop the daily infographics here

This folder is the **entry point for the daily dashboard update**.

## How it works

1. Add the day's FDK GVI infographic image(s) to this folder — `.jpg`, `.jpeg`,
   `.png` or `.webp`. You can drop one or several at once (country daily,
   corporate daily, and the weekly scorecards).
2. Commit / push (or upload straight through GitHub's web UI: **Add file →
   Upload files** into `data/gvi/inbox/`).
3. The **GVI daily auto-ingest** GitHub Action runs automatically:
   - a vision model reads each infographic and extracts the numbers,
   - `data/gvi/latest.json` is updated (sparkline history is extended),
   - `gvi-data.js` is rebuilt,
   - the processed image is moved to `inbox/processed/`,
   - the change is committed and pushed → the **/gvi** dashboard updates.

No manual transcription. The infographic is the only input.

## Requirements (already in place)

- Repo secret **`ANTHROPIC_API_KEY`** (used for the vision extraction).
- Optional repo/org variable **`GVI_VISION_MODEL`** to pin a specific model.

## Notes

- Supported infographics: Country Rankings (daily), Corporate Rankings (daily),
  Country Weekly Scorecard, Corporate Rankings by Industry, Europe's Top
  Corporates by Country, and European Banks Rankings.
- An unrecognized image is left in place (not deleted) and logged.
- To fully remove the manual "drop the image" step later, the same script can be
  fed from an email label or a Drive folder — the extraction stays identical.
