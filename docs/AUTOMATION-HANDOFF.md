# MEMORIA / HANDOFF → chat "automatización artículos"
*The Velocity Edge · FDK EmpowerNet — stato, pipeline e piano per risolvere la frammentazione del bot Telegram. Aggiornata: 18 nov 2026.*

## 0. Obiettivo di questa chat
Implementare **A + B** per eliminare alla radice la frammentazione delle note (vedi §4–5): A = buffer/marcatura nel bot Telegram (accessibile via API Google), B = ricucitura nel pipeline del repo. E continuare la bonifica dell'archivio (§6).

## 1. Cos'è il progetto
Sito statico (HTML/CSS/JS vanilla, zero dipendenze) di Francesco De Leo Kaufmann: tesi strategica su AI/capitale per board (mobility, energy, telecom). Pubblica "The Velocity Edge", un servizio d'intelligence con **serie ricorrenti** (GVI Corporate Benchmark, GVI Daily Update, The Next Economy Research Centre, Daily Intelligence Brief, Central Banks AI Watch, Closing of the Day, Europe Watch, In Focus, Morning View…). Ha anche: indice proprietario **GVI** + dashboard, dati di mercato live (TwelveData), i18n **EN/ES/IT**, SEO (canonical/sitemap/IndexNow), un libro ("Velocity Capitalism").

## 2. Repo, rami, deploy
- Repo: **`matisisconsultancy/FDK`** (il remoto è `https://github.com/matisisconsultancy/FDK`).
- **Rama di deploy (GitHub Pages serve QUESTA):** `claude/eager-carson-vjorjg`, cartella `/` (root), `.nojekyll`. Dominio: `fdkempowernet.com`.
- Si lavora su una rama personale `claude/*` e poi si porta la rama di deploy con **fast-forward**. **MAI force-push sulla rama di deploy** (è mossa di continuo dal bot).
- Igiene push: `git fetch origin claude/eager-carson-vjorjg` → `git rebase origin/claude/eager-carson-vjorjg` → push della propria rama → `git push origin <miarama>:claude/eager-carson-vjorjg` (FF). Se il bot l'ha mossa (non-FF), rebase di nuovo e ritenta.
- **Accesso GitHub:** a volte la sessione perde le credenziali (`could not read Username for github.com`). Si recupera riconnettendo a `https://claude.ai/connect-github` (e installando la Claude GitHub App sul repo).

## 3. Pipeline (tutto in `scripts/`)
- **`publish-note.mjs`** — motore: costruisce `/<slug>/index.html`, antepone a `posts.js`, aggiorna `sitemap.xml`. Portada automatica unica da `scripts/cover-pool.json` se manca `image`. Supporta blocchi `::stats ::pull ::signals ::patterns ::section ::rank ::takeaways ::para ::close`. Slot→kind/time (Morning View, In Focus, Market Watch, Midday Pulse, Daily Nowcast, Sunday Edition = day; Night Briefing/Evening/The Close = night).
- **`format-draft.mjs`** — formattatore IA: Anthropic Messages API diretta (no SDK), modello **`claude-opus-4-8`**, header `x-api-key` + `anthropic-version: 2023-06-01`. Converte testo libero nel formato draft. Preserva front-matter "pinnato" (`title/slug/date/slot/tag/dek/epigraph/excerpt`) sopra l'output del modello. Marcatore `format: ai` = front-matter fisso ma corpo da strutturare.
- **`process-drafts.mjs`** — orchestratore (punto chiave per B). In ordine: (a) gestisce richieste di **unpublish** via marker `drafts/unpublish/<slug>` (comando `/borrar` del bot) → `unpublish-note.mjs`; (b) per ogni draft: `repairTitle` → formatter IA se serve → **GUARDIA `looksJunkTitle`** → **GUARDIA corpo-minimo** → `resolveSlug` (dedup per contenuto/append data allo slug) → `publish-note`. Gli scarti vanno in **`drafts/rejected/`** con `rejected: <motivo>` che il bot rilegge a Francesco. Segnala `published`/`changed` al workflow.
- **`unpublish-note.mjs`** — rimuove cartella + voce `posts.js` + blocco `sitemap.xml` + draft archiviato. ⚠️ **NON rimuove i diccionari i18n** `i18n/<slug>.es.js` e `.it.js` → vanno cancellati a mano.
- Altri: `i18n-*.mjs` (EN sorgente in HTML; ES/IT in `data/i18n/*.json` → `i18n-build.mjs` genera `i18n/*.js`), `seo-build.mjs`, `gvi-notes-ingest.mjs`+`gvi-build.mjs` (alimenta dashboard GVI), `indexnow.mjs`, `fetch-quotes.mjs` (TwelveData, secret `TWELVEDATA_API_KEY`).
- **Workflow** `.github/workflows/publish-drafts.yml`: trigger su push a `drafts/**`; `AUTO_TRANSLATE: "true"`; esegue process-drafts → GVI → i18n build+translate → seo-build → commit+push (retry) → IndexNow → self-heal del build Pages. Secret: **`ANTHROPIC_API_KEY`**. Var: `GVI_NOTES_MODEL`.

### Guardie anti-spazzatura già in `process-drafts.mjs` (rinforzate il 18 nov)
`looksJunkTitle` respinge: URL/`chatgpt.com` come titolo, data come titolo, masthead ("The Velocity Edge…|FDK"), lista di sezioni (`·…·…·`), nome-edizione da solo, testo da assistente IA ("I'd…", "Sure, here…"), prima parola troncata; **+ aggiunto:** titolo-frase (>16 parole o >130 caratteri), titolo che inizia a metà frase ("Nevertheless/It is/Whether…"), titolo troncato (finisce in "…and/of/res/inves…"). **+ GUARDIA nuova:** draft con **corpo < 300 parole → `setAside`** (frammento). Verificato: 0 falsi positivi sulle note reali.

## 4. IL PROBLEMA: frammentazione
Telegram taglia i messaggi a ~4.096 caratteri. Se Francesco incolla un newsletter lungo, arriva in 2–4 messaggi; il bot **pubblica ogni pezzo come nota separata**. Risultato: una edizione esplode in 8–15 note. Dati: ottobre ~344 note (~11/giorno), novembre ~237 (~13/giorno); cadenza reale ~1–2 edizioni/giorno + serie.
**Chiarimento importante:** il problema NON è il volume (è l'identità del servizio, a Francesco piace) — è la **frammentazione**. E l'archivio è in gran parte **contenuto reale e pieno**, non spazzatura sottile: delle ~639 note, 537 erano ≥450 parole.

## 5. DECISIONE: implementare A + B (abbiamo accesso al bot via API Google)
Il limite di caratteri non si aggira: la soluzione è **ri-assemblare i pezzi**. Si fa in due punti complementari:

**A — Bot Telegram (buffer + marcatura).** Due opzioni, meglio entrambe:
  - *Buffer/debounce:* raccogliere i messaggi consecutivi di Francesco in una finestra (es. 20–40s dopo l'ultimo) o fino a un comando `/fine` (`/pubblica`), concatenare e inviare **UN solo draft**.
  - *Marcatura (minimo indispensabile se il buffer è complesso):* quando invia più messaggi di fila, taggare ogni draft con front-matter **`thread: <id-sessione>`** e **`part: <n>/<tot>`** (o anche solo `thread` + ordine). Così B ricuce in modo deterministico, non euristico.

**B — Pipeline/repo (ricucitura).** In `process-drafts.mjs`, **PRIMA delle guardie**: raggruppare i draft pendenti per `thread`, concatenarne i corpi in ordine di `part` in un unico draft (tenendo front-matter/titolo della part 1), e pubblicare **una nota**. Fallback senza `thread` (bot vecchio/altri canali): euristica — un draft **senza titolo valido** (già intercettato da `looksJunkTitle`) o **corto** che arriva lo stesso giorno subito dopo una nota titolata → **appendere** al corpo di quella invece di creare nota nuova.
  - ⚠️ **Ordine critico:** la ricucitura deve avvenire **prima** della guardia corpo-minimo e di `looksJunkTitle`, così le guardie valutano la nota *assemblata*, non i frammenti.

Con A che fornisce `thread/part` e B che ricuce, la frammentazione sparisce in modo affidabile.

## 6. Bonifica archivio — stato e lavoro residuo
Già fatto (in vivo): rimossa la nota "The Decisive Indicators… Bilateral Res"; **−94 note a titolo-frase**; **−42 note-frammento corte**. Archivio: **597 note**.
Residuo:
  - **6 note corte trattenute** (non cancellate): 3 reali epoca bassa da TENERE (29 giu "The Great Capital Formation Race", 20 lug "The Architecture of the Next Economy", 26 ago "The AI Supercycle Meets the Full Equation"); 3 del **27-set** (senza versione completa quel giorno) — decisione proposta: tenere la più completa ("AI Is Repricing the Cost of Money" 281w), eliminare le altre 2.
  - **Round 3 (curation per serie, NON delete cieco):** nel bucket "edizioni singole" ci sono ~382 "pezzi extra" stesso-giorno, ma **in gran parte note piene/reali** → vanno **ricucite/deduplicate per giorno**, non cancellate. Base dati pronta: `analisi-per-serie.csv` (639 righe: serie, data, parole, slug, titolo), ordinato per serie e data.
  - File di lavoro prodotti: `blog-audit.csv` (730 righe classificate KEEP/DELETE), `analisi-per-serie.csv`, `analisi-per-serie.md`, `STRATEGIA-the-velocity-edge.md`.

## 7. Come cancellare una nota (procedura sicura)
`node scripts/unpublish-note.mjs <slug> [<slug>…]` poi `rm -f i18n/<slug>.es.js i18n/<slug>.it.js` per ciascuno. Validare `posts.js` (`node -e "global.window={};require('./posts.js');console.log(window.FDK_POSTS.length)"`), commit, push, FF alla rama di deploy.

## 8. Direzione strategica (contesto per le decisioni)
Professionalizzare verso un prodotto a pagamento: tassonomia delle serie come sezioni navigabili; freemium (Morning View + qualche brief gratis; GVI Benchmark/Research Centre/dashboard dietro abbonamento); un'edizione ammiraglia/giorno curata e tradotta. Principio guida: **1 invio di Francesco = 1 nota completa.** Mantenere il volume, togliere la moltiplicazione artificiale.
