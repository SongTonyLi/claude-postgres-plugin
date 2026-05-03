# claude-postgres-plugin

https://github.com/user-attachments/assets/49c8e498-d7ca-4390-96b8-38e6397b6760

PostgreSQL-backed conversation viewer for Claude Code. Never lose a conversation again.

Automatically watches your claude-code session files, stores every message in PostgreSQL, and gives you a web dashboard to browse and search all your past conversations.

## How It Works

When you use Claude Code (`claude` CLI), it writes session files to `~/.claude/projects/`. This plugin watches those files in real-time, parses every message, tool call, and thinking block, then stores them in PostgreSQL. You get a web dashboard at `http://localhost:3456` to browse everything.

**No changes to Claude Code needed.** Just run the plugin alongside your normal `claude` sessions.

```
You use claude normally           This plugin runs in background
        |                                    |
        v                                    v
  claude-code writes                  fs.watch detects
  ~/.claude/projects/*.jsonl    -->   new lines in files
                                         |
                                         v
                                    Parser extracts messages,
                                    tool calls, thinking
                                         |
                                         v
                                    PostgreSQL stores everything
                                    (ACID safe, never loses data)
                                         |
                                         v
                                    Web dashboard at :3456
                                    shows all conversations
```

## Setup (5 minutes)

### Prerequisites

- **Bun** (JavaScript runtime): `npm install -g bun` or `curl -fsSL https://bun.sh/install | bash`
- **PostgreSQL**: `brew install postgresql@14` (Mac) or see [postgresql.org](https://www.postgresql.org/download/)

### Step 1: Start PostgreSQL

```bash
brew services start postgresql@14    # Mac
# or: sudo systemctl start postgresql  # Linux
```

### Step 2: Create the database

```bash
createdb claude_sessions
```

### Step 3: Install and build

```bash
git clone <this-repo> claude-postgres-plugin
cd claude-postgres-plugin

# Install backend
bun install

# Install and build frontend
cd web && bun install && bun --bun vite build && cd ..

# Run database migrations (creates tables)
bun run src/db/migrate.ts
```

### Step 4: Import your existing sessions

```bash
bun run src/index.ts import
```

This scans `~/.claude/projects/` and imports all your past claude-code conversations.

### Step 5: Start the plugin

```bash
bun run src/index.ts start
```

Open **http://localhost:3456** in your browser. That's it!

## Usage

### Running alongside Claude Code

1. Start the plugin in one terminal: `bun run src/index.ts start`
2. Use Claude Code normally in another terminal: `claude`
3. Open `http://localhost:3456` to see your conversations appear in real-time

The plugin detects new session files automatically. No restart needed.

### Search (Cmd+K)

Press `Cmd+K` (Mac) or `Ctrl+K` (Windows/Linux) or click the search bar in the sidebar to search across ALL your conversations. Uses SQL ILIKE fuzzy matching.

### Export to XML

1. Click **Select** in the conversation header
2. Check the messages you want to export (or use **Select All**)
3. Click **Export XML** — downloads an XML file with full conversation content, tool calls, and results

### Hide Sessions

Hover over any session in the sidebar and click the eye icon to hide it. Hidden sessions are excluded from the list but remain in the database.

### Commands

```bash
bun run src/index.ts start   # Watch sessions + serve dashboard
bun run src/index.ts web     # Dashboard only (read from DB)
bun run src/index.ts import  # One-time import of existing sessions
bun test                     # Run tests
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgres://localhost:5432/claude_sessions` | PostgreSQL connection |
| `CPG_PORT` | `3456` | Dashboard port |

## Architecture

**Backend**: Bun + TypeScript, PostgreSQL (postgres.js), Hono HTTP server, native fs.watch
**Frontend**: React 19 + Tailwind CSS v4 + Vite, Open WebUI-inspired layout
**Database**: 4 tables (sessions, messages, tool_calls, raw_events) with ACID guarantees

## Current Status

- [x] PostgreSQL schema + migrations (ACID transactions)
- [x] Session file watcher (real-time detection)
- [x] Ingest pipeline (race-condition safe, deduplication)
- [x] REST API + SSE real-time streaming
- [x] Web dashboard (Open WebUI style — sidebar + chat view)
- [x] Inline tool call and tool result rendering
- [x] Global search with SQL ILIKE fuzzy matching (Cmd+K)
- [x] XML export of selected messages
- [x] Session hiding
- [x] Message selection with checkboxes
- [x] 25 tests passing
- [x] Verified with 134 real sessions, 28k+ messages

## Next Steps

1. **Live session streaming** — Real-time message appearance in dashboard via SSE during active sessions
2. **Session metadata panel** — Model, token usage, duration, tool stats
3. **Full-text search with pg_trgm** — Better fuzzy matching with trigram indexes
4. **Conversation branching** — Visualize sidechain/forked conversations
5. **Unhide UI** — Settings page to manage hidden sessions
