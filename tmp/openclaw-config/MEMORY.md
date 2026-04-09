# MEMORY.md - Egons långtidsminne

## Om Nathalie
- Namn: Nathalie Wassgren
- Telegram: 8050081892
- Tidszon: Europe/Stockholm
- Föredrar svenska i konversation
- Grupp "Kabinett" på Telegram (-1003690757639)
- GitHub: nath-san

## Projekt (Kabinett-topics)
- **Topic 2 — Mandat:** Huvudprojekt, stort (2748 msgs)
- **Topic 3 — Kabinett/Slack:** Integration, konfig, demo (7143 msgs)
- **Topic 196 — SignService:** Signeringstjänst kopplad till Mandat (github.com/nath-san/signservice)
- **Topic 2424 — Föräldrapenning-optimerare:** Produktutveckling, SvelteKit, Vercel-deploy
- **Topic 2471 — Vårdköer:** Vårdköer i realtid, prototyp
- **Topic 2696 — Kabinett (Portfolio/Konstsida):** Discovery-plattform för Sveriges kulturarv, CLIP-sökning, multi-museum. Detaljerad status i `memory/kabinett-portfolio.md`
- **Topic 8252 — Skolkollen:** Namnbyte diskuterat, vill ha poppigare namn
- **Topic 9227 — Fantasy Allsvenskan:** Se memory/fantasy-allsvenskan.md

## Viktiga händelser
- **2026-03-15:** Migration ClawdBot → OpenClaw. Workspace nollställdes, alla sessioner markerades som deleted.
- **2026-03-17:** Nathalie upptäckte att minnet försvunnit. Återställde 107 borttagna sessionsfiler och all topic-historik. Skapade MEMORY.md och memory/ från scratch.

## Lärdomar
- Skriv alltid ner saker i filer. "Mentala anteckningar" överlever inte sessioner.
- Kontrollera att memory/-mappen och MEMORY.md faktiskt existerar vid uppstart.
- Vid migration/uppgradering: verifiera att workspace och sessionsdata överlevde.
- **DUBBLA SVAR-BUGG:** När meddelanden köas under omstarter/config-ändringar, skicka ALDRIG samma innehåll två gånger. Kolla alltid om svaret redan levererats innan du skickar. Nathalie har påpekat detta — det är irriterande.
- **Voice/STT-status (2026-04-02):** tools.media.audio.enabled=true är satt, men transkribering funkar inte ännu. Väntar på OpenClaw-uppdatering som fixar ogg-transcoding (finns i beta). Whisper-cli installerat via brew men modell borttagen. OPENAI_API_KEY är satt via launchctl setenv.

## Config-ändringar (2026-04-01/02)
- maxTokens: Opus 32768, Sonnet 16384
- Heartbeat-modell: Sonnet 4.5
- Elevated tools: aktiverat
- tools.media.audio.enabled: true (väntar på fungerande transcoding)
- OPENAI_API_KEY: satt i ~/.zshrc + launchctl setenv
- Cron: Daily Tech & AI Digest (08:30), OpenClaw Auto-Update (04:00)
- Borttagna cron: slack-reminder, vercel-webhook, loka-faktura
- Fantasy Allsvenskan cron: fixade delivery-adresser
