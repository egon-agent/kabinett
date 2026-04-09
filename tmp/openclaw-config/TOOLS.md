# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Kodning
- **Använd ALLTID Codex** (via coding-agent skill) för koduppgifter
- **Modell:** Codex 5.4 — ALLTID, inga undantag
- Aldrig Sonnet, aldrig Opus, aldrig något annat för kod

## Modellstrategi
- **Allt (chatt, heartbeats, sub-agents):** Claude Sonnet 4.5
- **Kodning:** Codex 5.4 (via coding-agent skill) — ALLTID

## Lokalt installerat
- **icalBuddy:** Kalendertillgång (macOS)
- **Ollama:** Inte installerat än (planerat för Gemma 4-test)
- **whisper-cpp:** Installerat men oanvänt (modell borttagen)

## API-nycklar
- ✅ **OpenAI:** Satt (via launchctl setenv)
- ✅ **Brave Search:** Satt
- ⚠️ **Slack:** Plugin enabled men token saknas
- ❌ **Gmail:** Inte önskat, skippa setup

## SSH/Remotes
- Ingen konfiguration ännu

## Kameror/IoT
- Ingen konfiguration ännu

---

## Why This File?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.
