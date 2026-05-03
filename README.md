# claude-postgres-plugin

https://github.com/user-attachments/assets/49c8e498-d7ca-4390-96b8-38e6397b6760

Embedded conversation viewer **and MCP search server** for Claude Code. Never lose a conversation, never lose context — even when your network drops mid-session.

> **About the name:** v0.1 used PostgreSQL. v0.2+ uses embedded SQLite (WAL + FTS5) — no daemon, no `createdb`, no separate database service. The repo name stays for continuity. ACID guarantees are preserved.

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
                  Web dashboard at :3456        MCP tools for Claude
                  (humans browse visually)      (Claude searches via
                                                 search_messages, etc.)
```

## Two ways to install

### Option A — As a Claude Code plugin (recommended)

This bundles the MCP server, the slash commands, and the watcher all in one install.

```text
/plugin marketplace add SongTonyLi/claude-postgres-plugin
/plugin install claude-postgres-plugin@songtonyli-plugins
```

**Prerequisites**: Bun installed (`curl -fsSL https://bun.sh/install | bash`). That's it — **no Postgres, no `createdb`, no database service to manage**. The DB is a single SQLite file under `~/.claude-postgres-plugin/cpg.sqlite` (or `${CLAUDE_PLUGIN_DATA}` if Claude Code provides one).

One-time setup in the plugin cache directory:

```bash
# Replace the path below with whatever /plugin install reported, typically:
cd ~/.claude/plugins/cache/songtonyli-plugins/claude-postgres-plugin

bun install                                          # backend deps
(cd web && bun install && bun --bun vite build)      # frontend bundle (only needed if you'll use the dashboard)
```

Optional — compile to a standalone binary (drops Bun runtime requirement for the MCP server, recommended for users who want zero-runtime-dep):

```bash
bun run build      # produces bin/cpg (~96 MB), platform-specific
```

> v0.3 will ship pre-built per-platform binaries via GitHub Releases so this step disappears entirely.

That's it. From any Claude Code session you now have:

**MCP tools** Claude can call autonomously (no slash command needed — Claude picks them up from the `claude-postgres` MCP server when relevant):

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
| `/cpg-search <phrase>` | Fuzzy-search past sessions and show top matches with session IDs |
| `/cpg-recent [count]` | List the most recent N sessions (default 10) |
| `/cpg-session <id> [N]` | Show metadata + last N messages for a session |
| `/cpg-start` | Start the watcher + web dashboard in the background |

### Option B — Standalone (no Claude Code plugin)

Use this if you want only the dashboard and don't need MCP integration.

**Prerequisite**: Bun. That's literally it. (No Postgres. No `createdb`. No service to start.)

**Setup**

```bash
git clone https://github.com/SongTonyLi/claude-postgres-plugin.git
cd claude-postgres-plugin
bun install
(cd web && bun install && bun --bun vite build)
bun run src/index.ts import        # import existing sessions (creates the SQLite file on first run)
bun run src/index.ts start         # watch + serve dashboard
```

Open **http://localhost:3456**.

The SQLite file is created automatically at `~/.claude-postgres-plugin/cpg.sqlite` on first run. Override the location with `CPG_DB_PATH` or `CPG_DATA_DIR`.

## Usage

### Real-time browsing while you code

1. Start the plugin (`/cpg-start` if installed as a plugin, or `bun run src/index.ts start` standalone).
2. Use Claude Code normally in another terminal: `claude`.
3. Open `http://localhost:3456`. New messages appear in the dashboard as Claude Code writes them.

### Search (Cmd+K)

Press `Cmd+K` (Mac) / `Ctrl+K` (Linux/Windows) or click the search bar to fuzzy-search across **every** past conversation. Uses SQLite FTS5 with prefix matching, then falls back to substring `LIKE` for matches FTS5 misses.

From inside Claude Code, you can also ask Claude directly: *"search my past sessions for X"* — Claude will use the `search_messages` MCP tool and surface the relevant snippets with session IDs you can resume from.

### Image and document attachments are preserved

When you paste an image into Claude Code (drag-and-drop, clipboard paste, or `@`-mention a PDF / file), Claude Code base64-encodes the bytes into the session JSONL. This plugin extracts those blocks and stores the raw bytes in Postgres.

That means:

- **Screenshots** of error stacks, terminal output, design mockups — all survive the session and are viewable later
- **PDFs and documents** you attached for analysis are preserved with the conversation that used them
- The dashboard renders thumbnails inline; click any thumbnail to open the full-size original
- Even one-shot pastes that you never saved anywhere else are now permanent

If you used `claude --resume` and lost the original images to autocompact, you can still pull them up in the dashboard and re-attach them to a new session.

### Export to XML

1. Click **Select** in the conversation header
2. Check the messages you want to export (or use **Select All**)
3. Click **Export XML** — downloads an XML file with full conversation content, tool calls, results, and references to attached images

Useful for: handing a slice of a session back to a fresh Claude session as context, archiving, or feeding to another tool.

### Hide Sessions

Hover over any session in the sidebar and click the eye icon to hide it. Hidden sessions are excluded from the list but remain in the database (and remain searchable).

### Standalone CLI commands

```bash
bun run src/index.ts start   # Watch sessions + serve dashboard
bun run src/index.ts web     # Dashboard only (read from DB, no watcher)
bun run src/index.ts import  # One-time import of existing sessions
bun test                     # Run tests
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CPG_DB_PATH` | (see `CPG_DATA_DIR`) | Full path to the SQLite database file. Use `:memory:` for an ephemeral in-process DB (used by tests). |
| `CPG_DATA_DIR` | `${CLAUDE_PLUGIN_DATA}` if set, else `~/.claude-postgres-plugin/` | Directory containing `cpg.sqlite`. |
| `CPG_PORT` | `3456` | Dashboard port |
| `CPG_WEB_DIST` | (auto-resolved) | Override the location of the built web frontend. Auto-discovered relative to the binary or source. |

When running as a Claude Code plugin, set these in your shell or `.env` before launching `claude`. The MCP server inherits them.

## Architecture

**Backend**: Bun + TypeScript, embedded SQLite via `bun:sqlite` (zero install), Hono HTTP server, native `fs.watch`
**MCP server**: bare stdio JSON-RPC, no extra dependencies, reuses the same `ConversationStore`
**Frontend**: React 19 + Tailwind CSS v4 + Vite, Open WebUI-inspired layout
**Database**: 4 tables (`sessions`, `messages`, `tool_calls`, `raw_events`) plus a `messages_fts` FTS5 virtual table. WAL journal mode + `synchronous = FULL` + `foreign_keys = ON` for full ACID + multi-process safety (one writer, many readers, snapshot isolation across processes)
**Distribution**: standard `bun run` for v0.2; single-binary `bun build --compile` opt-in (`bun run build` produces `bin/cpg`); v0.3 will ship per-platform binaries via GitHub Releases

## Current Status

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
- [x] Slash commands: `/cpg-search`, `/cpg-recent`, `/cpg-session`, `/cpg-start`
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
