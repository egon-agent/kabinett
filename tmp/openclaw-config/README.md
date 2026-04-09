# OpenClaw Config Files Example

This directory contains **sanitized** OpenClaw workspace configuration files.

## Files

- **AGENTS.md** — Session startup behavior, memory management, heartbeat rules
- **SOUL.md** — Agent personality and values
- **USER.md** — User info and preferences (sanitized)
- **TOOLS.md** — Local environment setup and API keys status
- **IDENTITY.md** — Agent name and vibe
- **HEARTBEAT.md** — Periodic tasks (currently empty)
- **MEMORY.md** — Long-term memory (sanitized, project-specific sections removed)

## What's Been Removed

- User's real name, Telegram ID, group IDs
- GitHub username
- Project-specific memory files (kabinett-portfolio.md, fantasy-allsvenskan.md)
- Daily logs (memory/YYYY-MM-DD.md)
- ALL_CONFIG_FILES.md (combined file)

## How to Use

1. Copy these files to `~/.openclaw/workspace/`
2. Replace `[REDACTED]` placeholders with your own info
3. Adjust preferences in USER.md to match your needs
4. Read AGENTS.md and SOUL.md to understand how the agent behaves

## Notes

- These files work with OpenClaw 2026.4.1+
- Model strategy: Claude Sonnet 4.5 for chat, Codex 5.4 for coding
- Cron jobs: Morning compliment at 07:00 (example)

---

Feel free to adapt these to your own setup!
