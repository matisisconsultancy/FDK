# Telegram — the site's central inbox

One Telegram bot feeds the whole site. Send it a message, the site updates itself.

```
        ┌──────────────  send to the bot  ──────────────┐
        │                                                │
   📷 infographic                                   ✍️  text note
        │                                                │
   data/gvi/inbox/                                    drafts/
        │                                                │
   AI vision extract                               AI formats + publishes
        │                                                │
   /gvi dashboard updates                     new article in The Velocity Edge
```

Every ~30 minutes the **Telegram intake** GitHub Action polls the bot, routes new
messages, runs the matching pipeline, and pushes — so GitHub Pages redeploys.

## What to send

- **One message with a photo + a caption** (how FDK usually sends: the
  infographic as the image, the edition text as the caption) → the dashboard
  refreshes **and** the caption is published as the article. One message, both
  outputs.
- **A photo only** → dashboard update. Send several at once (country daily,
  corporate daily, the weekly scorecards) — each is read.
- **An image sent as a file/document** → treated the same as a photo.
- **A text message only** → published as an article (AI-formatted into the
  site's style).
- Captions/texts shorter than ~40 characters are treated as labels, not
  articles. Commands `/start`, `/help`, `/skip`, `/id` are ignored.

## One-time setup

1. **Create the bot**: in Telegram, message **@BotFather** → `/newbot` → follow the
   prompts → copy the **bot token**.
2. **Find your chat id**: send any message to your new bot, then check the
   collector log (or send `/id`) to read the numeric id. This is what locks the
   inbox to you/FDK.
3. **Add repo secrets** (Settings → Secrets and variables → Actions):
   - `TELEGRAM_BOT_TOKEN` — the token from BotFather.
   - `TELEGRAM_ALLOWED_CHAT_IDS` — your chat id(s), comma-separated. Strongly
     recommended: without it, anyone who finds the bot could post to the site.
   - `ANTHROPIC_API_KEY` — already set (reads infographics, formats text).
4. Merge the PR (or run **Actions → Telegram intake → Run workflow** to test now).

## Notes

- **Scheduling**: GitHub only runs `schedule:` from the repository's **default
  branch**, so the timed polling starts once this is merged there. `Run workflow`
  works from any branch in the meantime.
- **Security**: only allow-listed chat ids are processed; everything else is
  skipped and logged.
- **State**: `data/telegram/state.json` tracks the last processed message, so no
  message is handled twice.
- **Frequency**: change the `cron` in `.github/workflows/telegram-intake.yml`
  (e.g. `*/15` for every 15 min). More frequent = more Action minutes used.
- This does not touch the market-data pipeline — public quotes still refresh on
  their own schedule (see `MARKET-DATA.md`).
