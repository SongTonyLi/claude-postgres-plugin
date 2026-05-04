# claude-sqlite-plugin

https://github.com/user-attachments/assets/cb254f18-082b-4fe6-99d9-763d7dcd185f



Embedded conversation viewer **and MCP search server** for Claude Code. Never lose a conversation, never lose context — even when your network drops mid-session.

> **Renamed in v0.2.1.** The project was originally `claude-postgres-plugin` (PostgreSQL-backed). v0.2 swapped the database for embedded SQLite (WAL + FTS5) — no daemon, no `createdb`, no separate database service — and v0.2.1 renamed everything user-visible to match: plugin id `claude-sqlite-plugin`, MCP server `claude-sqlite`, slash commands `/csp-*`. If you installed v0.2.0 under the old name, run `/plugin uninstall claude-postgres-plugin@songtonyli-plugins` then reinstall under the new name. The old GitHub URL still redirects.

## The problem this solves

You SSH into a remote dev box and kick off a long Claude Code "vibe coding" session. Two hours in, your home Wi-Fi flakes for 30 seconds. The SSH connection dies. You reconnect, run:

```bash
claude --resume
```

…and Claude immediately **autocompacts** because the conversation grew large. Half the context — the careful back-and-forth where you nailed down the architecture, the failing test runs, the prompt that finally worked — gets squashed into a one-paragraph summary. The detail is gone.

Same story with: laptop sleep dropping the SSH tunnel, a `tmux` session that didn't survive a reboot, an `iTerm` crash, a cellular hotspot blip on the train.

The JSONL file Claude Code writes to `~/.claude/projects/` survives all of that. But by default, you have no good way to search it, browse it, or hand the relevant slice back to a fresh Claude session — so `--resume` and its autocompact are your only options.

This plugin fixes that:

- **A real-time watcher** ingests every message into a local SQLite database the moment Claude Code writes it to disk. ACID-safe via WAL + `synchronous = FULL` + foreign keys. No transaction is ever lost, even if the parent terminal dies.
- **A web dashboard** at `http://localhost:3456` lets you browse, search, and export every past session — text, tool calls, thinking blocks, **and image / document attachments** rendered exactly as they appeared.
- **An MCP server** ships with the plugin so Claude itself can search your conversation history during a new session: *"what did we try for the rate-limiter bug last week?"* → Claude calls the `search_messages` tool → answers with real evidence from your past work.

## How it works

```
You use claude normally           This plugin runs in background
        |                                    |
        v                                    v
  claude-code writes                  fs.watch detects
  ~/.claude/projects/*.jsonl    -->   new lines in files
                                             |
                                             v
                                    Parser extracts messages,
                                    tool calls, thinking, images
                                             |
                                             v
                                    SQLite stores everything
                                    (WAL + FTS5, ACID safe)
                                             |
                              +-----------------------------+
                              |                             |
                              v                             v
                  Web dashboard at :3456           MCP tools for Claude
                  (humans browse visually)         (Claude searches via
                                                    search_messages, etc.)
```

## Two ways to install

### Option A — As a Claude Code plugin (recommended)

This bundles the MCP server, the slash commands, and the watcher all in one install.

```text
/plugin marketplace add SongTonyLi/claude-sqlite-plugin
/plugin install claude-sqlite-plugin@songtonyli-plugins
```

**Prerequisites**: Bun installed (`curl -fsSL https://bun.sh/install | bash`). That's it — **no Postgres, no `createdb`, no database service to manage**. The DB is a single SQLite file under `~/.claude-sqlite-plugin/csp.sqlite` (or `${CLAUDE_PLUGIN_DATA}` if Claude Code provides one).

One-time setup in the plugin cache directory:

```bash
# Replace the path below with whatever /plugin install reported, typically:
cd ~/.claude/plugins/cache/songtonyli-plugins/claude-sqlite-plugin/0.2.1

bun install                                          # backend deps
(cd web && bun install && bun --bun vite build)      # frontend bundle (only needed if you'll use the dashboard)
```

Optional — compile to a standalone binary (drops Bun runtime requirement for the MCP server, recommended for users who want zero-runtime-dep):

```bash
bun run build      # produces bin/csp (~96 MB), platform-specific
```

> v0.3 will ship pre-built per-platform binaries via GitHub Releases so this step disappears entirely.

That's it. From any Claude Code session you now have:

**MCP tools** Claude can call autonomously (no slash command needed — Claude picks them up from the `claude-sqlite` MCP server when relevant):

| Tool | What it does |
|---|---|
| `list_recent_sessions` | List the user's most recent sessions |
| `search_messages` | Fuzzy or regex search across all conversation messages |
| `get_session` | Fetch a session's metadata by id |
| `get_session_messages` | Fetch the message transcript |
| `get_session_tool_calls` | List all tool calls made in a session |

**Slash commands** for direct invocation:

| Command | What it does |
|---|---|
| `/csp-search <phrase>` | Fuzzy-search past sessions and show top matches with session IDs |
| `/csp-recent [count]` | List the most recent N sessions (default 10) |
| `/csp-session <id> [N]` | Show metadata + last N messages for a session |
| `/csp-start` | Start the watcher + web dashboard in the background |

### Option B — Standalone (no Claude Code plugin)

Use this if you want only the dashboard and don't need MCP integration.

**Prerequisite**: Bun. That's literally it. (No Postgres. No `createdb`. No service to start.)

**Setup**

```bash
git clone https://github.com/SongTonyLi/claude-sqlite-plugin.git
cd claude-sqlite-plugin
bun install
(cd web && bun install && bun --bun vite build)
bun run src/index.ts import        # import existing sessions (creates the SQLite file on first run)
bun run src/index.ts start         # watch + serve dashboard
```

Open **http://localhost:3456**.

The SQLite file is created automatically at `~/.claude-sqlite-plugin/csp.sqlite` on first run. Override the location with `CSP_DB_PATH` or `CSP_DATA_DIR`.

## Quick examples

```bash
# Start watcher + dashboard (plugin)
/csp-start

# Start watcher + dashboard (standalone)
bun run src/index.ts start       # then open http://localhost:3456

# Search past conversations from inside Claude Code
/csp-search rate limiter bug

# List recent sessions
/csp-recent 20

# Inspect a specific session
/csp-session a745301c

# Resume a found session directly in Claude Code
claude --resume a745301c-fe8a-4f20-97bf-4fda1f1f2ad2

# Ask Claude to search for you (no slash command needed — Claude uses the MCP tools)
> "What did we try for the auth middleware rewrite last week?"
```

## Usage

### Real-time browsing

Start the watcher, use Claude Code normally, open `http://localhost:3456`. Messages appear in the dashboard as Claude writes them.

### Search (Cmd+K)

`Cmd+K` / `Ctrl+K` in the dashboard fuzzy-searches every past conversation (FTS5 prefix matching, LIKE fallback). From Claude Code, just ask — Claude calls `search_messages` automatically.

### Images and documents

Pasted images, screenshots, PDFs — all extracted from the JSONL and stored in SQLite. Viewable in the dashboard even after autocompact destroys the original context. Click thumbnails for full-size originals.

### Export to XML

**Select** → check messages → **Export XML**. Useful for handing context to a fresh session, archiving, or feeding to other tools.

### Hide sessions

Hover a session in the sidebar → click the eye icon. Hidden from the list, still in the DB and searchable.

### CLI commands

```bash
bun run src/index.ts start   # Watch + dashboard
bun run src/index.ts web     # Dashboard only (no watcher)
bun run src/index.ts import  # One-time import of existing sessions
bun run src/index.ts mcp     # Run as stdio MCP server
bun test                     # Run tests
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CSP_DB_PATH` | (see `CSP_DATA_DIR`) | Full path to the SQLite database file. Use `:memory:` for an ephemeral in-process DB (used by tests). |
| `CSP_DATA_DIR` | `${CLAUDE_PLUGIN_DATA}` if set, else `~/.claude-sqlite-plugin/` | Directory containing `csp.sqlite`. |
| `CSP_PORT` | `3456` | Dashboard port |
| `CSP_WEB_DIST` | (auto-resolved) | Override the location of the built web frontend. Auto-discovered relative to the binary or source. |

When running as a Claude Code plugin, set these in your shell or `.env` before launching `claude`. The MCP server inherits them.

## Architecture

**Backend**: Bun + TypeScript, embedded SQLite via `bun:sqlite` (zero install), Hono HTTP server, native `fs.watch`
**MCP server**: bare stdio JSON-RPC, no extra dependencies, reuses the same `ConversationStore`
**Frontend**: React 19 + Tailwind CSS v4 + Vite, Open WebUI-inspired layout
**Database**: 4 tables (`sessions`, `messages`, `tool_calls`, `raw_events`) plus a `messages_fts` FTS5 virtual table. WAL journal mode + `synchronous = FULL` + `foreign_keys = ON` for full ACID + multi-process safety (one writer, many readers, snapshot isolation across processes)
**Distribution**: standard `bun run` for v0.2; single-binary `bun build --compile` opt-in (`bun run build` produces `bin/csp`); v0.3 will ship per-platform binaries via GitHub Releases

## Current Status

- [x] **v0.2.1: rename to `claude-sqlite-plugin`** — plugin id, MCP server, slash commands, env vars, default DB path all renamed away from `cpg`/`claude-postgres` to match the SQLite reality
- [x] **v0.2: SQLite swap** — dropped PostgreSQL dep entirely, embedded WAL + FTS5
- [x] Schema + migrations (ACID via WAL + `synchronous = FULL` + foreign keys)
- [x] Session file watcher (real-time detection)
- [x] Ingest pipeline (race-condition safe, deduplication)
- [x] REST API + SSE real-time streaming
- [x] Web dashboard (Open WebUI style — sidebar + chat view)
- [x] Inline tool call and tool result rendering
- [x] Image / document attachment preservation and serving
- [x] Global search with FTS5 prefix matching + LIKE fallback (Cmd+K)
- [x] XML export of selected messages
- [x] Session hiding
- [x] Message selection with checkboxes
- [x] MCP server with 5 search/inspect tools
- [x] Slash commands: `/csp-search`, `/csp-recent`, `/csp-session`, `/csp-start`
- [x] Single-plugin marketplace catalog
- [x] `bun build --compile` produces a working single binary (96 MB, platform-specific)
- [x] 25 tests passing against `:memory:` SQLite

## Next Steps

1. **v0.3 — pre-built per-platform binaries via GitHub Releases** — drops the Bun runtime requirement entirely; truly zero-dep `/plugin install`
2. **Live session streaming** — real-time message appearance in dashboard via SSE during active sessions
3. **Session metadata panel** — model, token usage, duration, tool stats
4. **Conversation branching** — visualize sidechain/forked conversations
5. **Unhide UI** — settings page to manage hidden sessions
6. **Auto-resume helper** — slash command that builds a context bundle from a past session for resuming without autocompact loss
