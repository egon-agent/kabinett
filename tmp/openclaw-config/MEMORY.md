# MEMORY.md - Egons långtidsminne

## Om [User]
- Namn: [REDACTED]
- Telegram: [REDACTED]
- Tidszon: Europe/Stockholm
- Föredrar svenska i konversation
- Grupp "[Group Name]" på Telegram ([REDACTED])
- GitHub: [REDACTED]

## Projekt (exempel på topic-strukturering)
- **Topic X — Projekt A:** Huvudprojekt, stort
- **Topic Y — Projekt B:** Integration, konfig, demo
- **Topic Z — Projekt C:** Detaljerad status i `memory/project-c.md`

_Anpassa detta till dina egna projekt och Telegram-topics._

## Viktiga händelser
- **[Date]:** Migration ClawdBot → OpenClaw. Workspace nollställdes, alla sessioner markerades som deleted.
- **[Date]:** Upptäckte att minnet försvunnit. Återställde borttagna sessionsfiler och topic-historik. Skapade MEMORY.md och memory/ från scratch.

_Detta är exempel på viktig historik — ersätt med dina egna milstolpar._

## Lärdomar
- Skriv alltid ner saker i filer. "Mentala anteckningar" överlever inte sessioner.
- Kontrollera att memory/-mappen och MEMORY.md faktiskt existerar vid uppstart.
- Vid migration/uppgradering: verifiera att workspace och sessionsdata överlevde.
- **DUBBLA SVAR-BUGG:** När meddelanden köas under omstarter/config-ändringar, skicka ALDRIG samma innehåll två gånger. Kolla alltid om svaret redan levererats innan du skickar.
- **Voice/STT-status:** tools.media.audio.enabled=true är satt, men transkribering funkar inte ännu. Väntar på OpenClaw-uppdatering som fixar ogg-transcoding (finns i beta). Whisper-cli installerat via brew men modell borttagen. OPENAI_API_KEY är satt via launchctl setenv.

## Config-ändringar (exempel)
- **[Date]:** Cron-jobb skapad för daglig notifikation
- **[Date]:** Slack enabled (men fungerar ej, token saknas)
- **[Date]:** Modellstrategy → Sonnet 4.5 för allt utom kod
- **[Date]:** De flesta cron-jobb disabled (kostnadsbesparing)
- **[Date]:** Elevated tools aktiverat, maxTokens ökade

_Dokumentera dina egna config-ändringar här._

## Ej önskat
- Gmail-integration
- Voice transcription (väntar på OpenClaw-uppdatering, låg prioritet)
