# claude-postgres-plugin

PostgreSQL-backed conversation storage and web viewer for Claude Code sessions.

Watches claude-code session files in real-time, stores all conversations in PostgreSQL with ACID guarantees, and serves a web dashboard for reviewing past sessions.

## Quick Start

```bash
# Prerequisites: PostgreSQL 14+, Bun
brew services start postgresql@14
createdb claude_sessions

# Install
bun install
cd web && bun install && bun --bun vite build && cd ..

# Run migrations
bun run src/db/migrate.ts

# Import existing sessions
bun run src/index.ts import

# Start (watcher + dashboard)
bun run src/index.ts start
# Open http://localhost:3456
```

## Commands

```bash
bun run src/index.ts start   # Watch sessions + serve dashboard
bun run src/index.ts web     # Dashboard only (read from DB)
bun run src/index.ts import  # One-time import of existing sessions
bun test                     # Run 25 tests
```

## Architecture

```
claude-code writes .jsonl → fs.watch → parser → PostgreSQL → REST API → Web Dashboard
                                                            → SSE → Real-time updates
```

**Backend**: Bun + TypeScript, PostgreSQL (postgres.js), Hono HTTP server
**Frontend**: React 19 + Tailwind CSS v4 + Vite, Open WebUI-inspired layout

## Database

4 tables: `sessions`, `messages`, `tool_calls`, `raw_events`
- ACID transactions, FK constraints, dedup via UNIQUE(session_id, uuid)
- Indexes on session_id, timestamp, tool_use_id

## Current Status

- [x] PostgreSQL schema + migrations
- [x] ConversationStore (CRUD with dedup)
- [x] Session file parser (JSONL → typed events)
- [x] File watcher (native fs.watch + polling)
- [x] Ingest pipeline (serialized queue, race-condition safe)
- [x] REST API (sessions, messages, tools)
- [x] SSE real-time streaming
- [x] CLI entry point (start/web/import)
- [x] Web dashboard (Open WebUI-inspired design)
- [x] 25 tests passing (unit + E2E + integrity)
- [x] Verified with 134 real sessions, 28k messages

## Next Steps

1. **Right panel should render full SSE-mirrored output** — Currently shows user bubbles + assistant markdown. Needs to render everything from claude-code SSE stream faithfully: all tool calls inline, thinking blocks, status indicators, exactly mirroring what you see in the terminal.

2. **Live session streaming** — When a claude-code session is active, the dashboard should stream new messages in real-time via SSE, showing them as they arrive.

3. **Session resume support** — Export conversation data in a format that allows true conversation resume (not just agent memory).

4. **Search across conversations** — Full-text search across all messages.

5. **Session metadata** — Show model, token usage, duration, tool statistics per session.
