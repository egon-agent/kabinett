# Kabinett — Projektstatus

## Vad är Kabinett?
En discovery-plattform för Sveriges kulturarv. Sökbar med CLIP (semantisk AI-sökning) — "sök med egna ord". 
Repo: github.com/nath-san/kabinett
Prod: kabinett.fly.dev / kabinett.norrava.com
Tech: SvelteKit → Remix/React Router, SQLite, FAISS, Python CLIP

## Datakällor & volymer
- **Nationalmuseum (NM):** 74 108 verk — eget API (nm-api.se)
- **Nordiska museet:** 285 972 föremål — K-samsök/Europeana
- **SHM (Statens historiska museer):** 798 759 objekt — K-samsök (7 samlingar)
- **Europeana:** 1.2M+ verk synkade, neighbors beräknade
- **Totalt:** ~1 158 839 verk (1 154 332 efter licensfiltrering)

## Kampanjsystem (multi-museum)
En app, en DB. Hostname-baserad routing:
- `kabinett.norrava.com` → alla museer (default)
- `nm.norrava.com` → bara Nationalmuseum
- `nordiska.norrava.com` → bara Nordiska
- `shm.norrava.com` → bara SHM

Implementation: AsyncLocalStorage per request via root loader (`ensureRequestContext`). Cloudflare CNAME → Fly.io med `Vary: Host`.

## Funktioner
### Klart ✅
- CLIP-sökning (semantisk "sök med egna ord")
- Licensdata backfillad (~1 054 000 verk med media_license/media_copyright)
- Licensbadge på varje verksida med CC-länk
- "In Copyright"-verk (4 507 st) filtrerade bort via sourceFilter
- Vandringar/walks (/vandringar) — 16 st, alla NM-verk
- Skolmodul (/skola) — 9 skolwalks med Lgr22-koppling, diskussionsfrågor, PDF-export
  - 3 per museum (NM: Berättelser i måleri, Färg & känsla, Stormaktstiden; Nordiska: Vardagsliv, Mode & identitet, Samisk kultur; SHM: Vikingatid, Medeltid, Makt & symboler)
  - Filtrerbart per museum ELLER per ämne (Bild, Historia, Samhällskunskap, Slöjd)
- Suggestion chips under sökfältet (kampanjmedvetna)
- Temakort (kampanjmedvetna: 5 universella + 5 museum-specifika)
- Kampanjmedveten autocomplete (filtrerar konstnärer per museum)
- Stats-kort gömt i kampanjläge (visas bara på kabinett.norrava.com)
- Om-sidan anpassad per kampanj
- Curated startsidebilder per museum
- Färgsök fallback till CLIP när museum saknar RGB-data (Nordiska, SHM)
- Skola-länk i navigeringen
- /walks → /vandringar URL-byte med redirect

### Saknas / Nästa steg 🔲
- **Vandringar för Nordiska & SHM** — alla walks har bara NM-verk. Behöver skapas.
- **Färgextraktion** för Nordiska & SHM (de saknar color_r/g/b)
- **QR-guide + admin-panel** — gör det till produkt vs projekt (Nathalies prioritering)
- **Pitch till RAÄ/museer** — koppling till Åsa på RAÄ, länk från deras sida, Digikult-konferens
- **Auktionssök** — Bukowskis/Auctionet-integration (separat projekt, parkerat)

## Deploy-process (viktigt!)
1. `fly deploy` — ny kod
2. `./scripts/deploy-db.sh` ELLER manuellt:
   - `gzip -k packages/data/kabinett.db`
   - `fly sftp shell` → `put packages/data/kabinett.db.gz /data/kabinett.db.gz`
   - `fly ssh console -C "rm -f /data/kabinett.db"` (ta bort gamla FÖRST)
   - `fly ssh console -C "gunzip /data/kabinett.db.gz"` (VÄNTA, ctrl+c inte!)
3. **ORDNING:** deploy först, DB sen. `fly deploy` skapar ny container som kan skriva över DB.
4. **VIKTIGT:** `fly ssh -C` stöder INTE `&&` — kör kommandon separat!
5. DB:n (6.2 GB) finns på Mac 13 (administrator). Nathalies MacBook 15 behöver SCP:a därifrån.

## Kontakter
- **Åsa (RAÄ):** Kontakt på Riksantikvarieämbetet. Tipsat om nya K-samsök API, erbjudit länk från RAÄ:s sida och Digikult. Flaggat licensfrågan.
- **Tre museum att pitcha:** NM, Nordiska, SHM

## Lärdomar
- `Vary: Host` krävs för multi-tenant caching på Fly.io
- Root loader med `ensureRequestContext` — React Router kör loaders INNAN entry.server handleRequest
- Global variabel per request funkar i Node (single-threaded), AsyncLocalStorage propagerade inte tillförlitligt till parallella loaders
- Fly sftp "file exists" = den redan finns, behöver ta bort först
- Entrypoint gunzippar .db.gz bara om .db saknas
- Ctrl+C i `fly ssh console` dödar SSH-sessionen men inte serverns process
- Nordiska & SHM saknar RGB-färgdata

## Senaste uppdatering
2026-03-19 — Europeana neighbors klar (1.2M verk), licensdata live i prod
