# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Kodning
- **Använd ALLTID Codex** (via coding-agent skill) för koduppgifter
- **Modell:** Codex 5.4 — ALLTID, inga undantag
- Aldrig Sonnet, aldrig Opus, aldrig något annat för kod

## Modellstrategi
- **Allt (chatt, heartbeats, sub-agents):** Claude Sonnet 4.5
- **Kodning:** Codex 5.4 (via coding-agent skill) — ALLTID

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
