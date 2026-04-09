# MEMORY.md - Agent Long-term Memory

## Om användaren
- Namn: [Your Name]
- Telegram: [Your Telegram ID]
- Tidszon: [Your Timezone]
- Föredrar [Your Language] i konversation
- Grupp "[Group Name]" på Telegram ([Group ID])
- GitHub: [Your GitHub]

_Fyll i dina egna detaljer._

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

## Modellstrategi
- **Chatt, heartbeats, sub-agents:** Claude Sonnet 4.5 (eller din val)
- **Kodning:** Codex 5.4 via coding-agent skill (eller din val)

_Justera efter dina egna preferenser._

## Config-ändringar (exempel)
- **[Date]:** Elevated tools aktiverat, maxTokens ökade
- **[Date]:** Cron-jobb skapad för daglig notifikation

_Dokumentera dina egna config-ändringar här._
