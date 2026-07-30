# Live market data — automated pipeline

Fully automated public market data for the FDK site. No backend, no manual step.

```
GitHub Action (cron, weekdays)
   → scripts/fetch-quotes.mjs   (reads data/market/watchlist.json)
   → TwelveData API             (key from the TWELVEDATA_API_KEY secret)
   → data/market/quotes.json    (committed & pushed)
   → GitHub Pages redeploys     → /markets renders the fresh board
```

## One-time setup

1. Get a free API key at <https://twelvedata.com> → Dashboard → API Key.
2. In GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `TWELVEDATA_API_KEY`
   - Value: your key
3. That's it. The workflow runs on schedule (06:00 & 20:05 UTC on weekdays) and
   can also be run on demand from the **Actions** tab → *Update live market data* →
   *Run workflow*.

## Editing what's shown

Everything on `/markets` comes from **`data/market/watchlist.json`**. Add or remove
entries — `label` (display name), `symbol` (TwelveData ticker), optional `exchange`
for non-US listings (e.g. `BME` for Madrid, `XETR` for Frankfurt), and a `group`.
Bad symbols are logged and skipped on each run; they never break the board.

Example — ENCE on the Madrid exchange:
```json
{ "label": "ENCE Energía y Celulosa", "symbol": "ENC", "exchange": "BME" }
```

## Notes & limits

- **Free tier**: 8 requests/min, 800/day. The fetcher throttles to stay under it,
  so a daily batch of a few hundred tickers is fine. For real-time / intraday across
  many tickers, TwelveData's paid *Grow* plan lifts these limits.
- **The API key never reaches the browser** — it lives only as a GitHub secret and
  is used inside the Action. (The older `market.js` ticker embeds a key client-side;
  this pipeline is the secure, scalable replacement.)
- **Sparklines** build up over time: each run appends the latest price to a short
  per-symbol history (up to 30 points), so trend lines appear after a few runs.
- **What this is / isn't**: this shows *public market data* (price, daily % change).
  It is **not** the proprietary FDK GVI velocity score — that is FDK's own
  calculation and is not published on any public API.

## Local preview (no key)

```
node scripts/fetch-quotes.mjs --sample   # writes placeholder quotes.json
```
The board shows a "Sample data" badge until the real key is set.
