# Vilken Skola — Projektstatus

## Vad är det?
Skolvalstjänst för föräldrar. SvelteKit, SQLite, AI-analys av skolinspektionsbeslut.
Repo: github.com/nath-san/vilken-skola (alias egon-agent/vilken-skola)
Topic: 8252 i Kabinett-gruppen

## Nuvarande datakällor
- Skolverket KPI:er (betyg, lärartäthet, behörighet) — 119k rader
- Skolverket statistik — 213k rader
- Skolinspektionens tillsynsbeslut — 11 512 dokument, 3 756 skolor
- AI-analys av tillsyns-PDF:er (Gemini 2.5 Flash, thinking off) — 6 429 success, 5 082 failed (per 2026-03-19)
- 4 723 skolor totalt i databasen

## AI-analys setup
- Script: scripts/analyze-inspections-ai.js (prompt v4)
- .env med GEMINI_API_KEY, auto-detect Gemini provider
- Flaggor: REPROCESS_ALL=1, REPROCESS_FAILED=1, SCHOOL_IDS=xxx, CONCURRENCY=4
- thinkingBudget: 0 (avstängt)
- Korsvalidering mot nyckelordsanalys

## Plan: senaste + on-demand
1. Batch: bara analysera senaste dokumentet per skola (~3 756 st) — gratis för alla
2. On-demand: användaren betalar för djupanalys av alla dokument per skola, cacheas

## Datakällor att lägga till (prioritetsordning)

### 🔥 Hög prioritet
1. **Skolenkäten (Skolinspektionen)** — elev/lärare/vårdnadshavare-svar om trygghet, studiero, stöd. Per skola, Excel. skolinspektionen.se/skolenkaten
2. **Betygsinflation (Nationella prov vs betyg)** — SIRIS/Skolverket. Avvikelse visar betygsinflation. Viralt ämne.
3. **Friskoleekonomin** — org.nr → Allabolag/Bolagsverket: vinst, omsättning, ägare. Politiskt hett.

### 💡 Medium prioritet
4. **Skolenhetsregistret (Skolverkets API)** — komplett skolregister med adress, huvudman, skolform
5. **Elevdemografi/SALSA** — föräldrarnas utbildningsnivå, andel nyanlända → justerade resultat
6. **Lärarbehörighet per ämne** — fördjupning av befintlig data

### 🧲 Nice-to-have
7. **Kötider friskolor** — svårt att scrapa men extremt efterfrågat
8. **Google Reviews / SchoolParrot** — omdömen
9. **Geografisk data** — avstånd, kollektivtrafik, upptagningsområden

## Nya datakällor (2026-04-01)

### Skolenkäten (importerad)
- Script: scripts/import-skolenkaten.py
- Tabell: skolenkaten
- Data: 2022-2025 vårdnadshavare (~10k rader, ~5600 skolor)
- 8 index per skola: trygghet, studiero, stimulans, stöd, bemötande (lärare/elever), information, elevhälsa
- 2022 har 4 av 8 index (ändrad enkätstruktur), 2023+ har alla 8
- Filnamn: 2023+ = "skolenkaten-", ≤2022 = "excelrapport-"
- 2021 finns inte (404/annat format)
- UI-sektion "Så tycker föräldrar & elever" byggd av Codex på /skola/[id]

### Kvalitetssystemdata (importerad)
- Script: scripts/import-kvalitet.py
- Tabell: kvalitetssystem
- Källa: Skolverkets PxWeb API (statistikdatabasen)
- 15 309 rader, 5 103 skolor × 3 år (2022/23 – 2024/25)
- 30 mått per skola: betyg, NP, personal, kostnader, trygghet, demografi
- Level-format i API: "org_nr-skolenhetskod" (19 tecken)
- UI: ännu ej byggd

## Tekniskt
- Nathalie kör på sin dator (inte administrator-maskinen)
- Exec security satt till "full" (2026-04-01)
- Adapter: SvelteKit adapter-auto
- Inte deployad ännu — körs lokalt
- SSL-cert-problem med Python urllib → alla scripts använder curl
