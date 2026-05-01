# Claude Postgres Plugin - Design Spec

## Problem

Claude Code loses conversation data when sessions end or context is compacted. The built-in `/resume` feature resumes from agent memory summaries, not the true conversation. There is no way to review past conversations in full fidelity.

## Solution

A standalone plugin that watches claude-code session files in real-time, stores all conversation data in PostgreSQL with ACID guarantees, and serves a web dashboard for reviewing past sessions with a terminal-like UI that mirrors claude-code.

## Architecture

### Event Capture: Session File Watcher

Claude Code writes structured JSONL session files to `~/.claude/projects/<project-hash>/<session-id>.jsonl`. Each line is a JSON object with one of these types:

| Event Type | Description | Key Fields |
|---|---|---|
| `user` | User messages (text, images, tool_results) | uuid, parentUuid, message.content[], timestamp, sessionId, cwd |
| `assistant` | Assistant responses (text, thinking, tool_use) | uuid, parentUuid, message.content[], requestId, timestamp |
| `system` | Compaction events | subtype, durationMs, messageCount |
| `file-history-snapshot` | File backup snapshots | messageId, snapshot |
| `queue-operation` | Queue state changes | operation, content |
| `last-prompt` | Last prompt bookmark | lastPrompt |

The watcher uses `chokidar` to detect new/modified JSONL files, tails new lines, parses them into typed events, and stores them in PostgreSQL via ACID transactions. This requires zero configuration change for the user.

### PostgreSQL Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                    -- claude-code session UUID
  project_path TEXT NOT NULL,             -- project directory path
  cwd TEXT,                               -- working directory
  model TEXT,                             -- model used
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',  -- active, completed, compacted
  title TEXT,                             -- auto-generated from first user message
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,                     -- claude-code message UUID
  parent_uuid TEXT,                       -- for conversation tree
  role TEXT NOT NULL,                     -- user, assistant, system
  content TEXT,                           -- plain text extraction
  content_blocks JSONB NOT NULL,          -- full content blocks array
  thinking TEXT,                          -- extracted thinking content
  is_sidechain BOOLEAN DEFAULT FALSE,
  is_meta BOOLEAN DEFAULT FALSE,
  sequence_num INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  UNIQUE(session_id, uuid)
);

CREATE TABLE tool_calls (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_uuid TEXT NOT NULL,             -- assistant message that initiated
  result_uuid TEXT,                       -- user message with tool_result
  tool_use_id TEXT NOT NULL,              -- claude's tool_use block id
  tool_name TEXT NOT NULL,
  input JSONB,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE raw_events (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  file_path TEXT,                         -- source JSONL file
  line_number INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON messages(session_id, sequence_num);
CREATE INDEX idx_messages_uuid ON messages(session_id, uuid);
CREATE INDEX idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX idx_tool_calls_use_id ON tool_calls(tool_use_id);
CREATE INDEX idx_raw_events_session ON raw_events(session_id, timestamp);
CREATE INDEX idx_sessions_started ON sessions(started_at DESC);
```

### REST API

| Method | Endpoint | Description |
|---|---|---|
| GET | /api/sessions | List all sessions (paginated, sorted by started_at DESC) |
| GET | /api/sessions/:id | Get session details |
| GET | /api/sessions/:id/messages | Get all messages for a session (ordered by sequence_num) |
| GET | /api/sessions/:id/tools | Get all tool calls for a session |
| GET | /api/events/sse | SSE stream for real-time updates (query: ?sessionId=X) |

### SSE Events

The server emits SSE events to connected browsers:
- `session:new` — new session detected
- `session:update` — session status changed
- `message:new` — new message in a session
- `tool:update` — tool call completed/failed

### Web Dashboard

Three-panel layout:
1. **Session Sidebar** (left): Lists past sessions with title, timestamp, project path. Click to select. Shows active sessions with a live indicator.
2. **Conversation View** (center): Terminal-like dark theme rendering of the full conversation. Renders user prompts, assistant responses with markdown, code blocks with syntax highlighting, tool calls as expandable sections showing input/output, thinking blocks as collapsible sections, and compaction markers.
3. **Session Info** (right, optional): Session metadata, model, project path, duration, message count.

The terminal-like UI uses:
- Dark background (#1a1a2e or similar)
- Monospace font (JetBrains Mono / system monospace)
- Color-coded roles: user (green), assistant (white), system (yellow), tools (cyan)
- Markdown rendering with syntax-highlighted code blocks
- Expandable/collapsible tool call and thinking sections

## Tech Stack

- **Runtime**: Node.js / Bun + TypeScript
- **Database**: PostgreSQL (via `postgres` package — Postgres.js)
- **HTTP Server**: Hono
- **File Watching**: chokidar
- **Frontend**: React 19 + Tailwind CSS v4 + Vite
- **Markdown**: react-markdown + remark-gfm + rehype-highlight (or shiki)

## CLI Interface

```bash
cpg start        # Start watcher + web server (main command)
cpg web          # Start only web dashboard (read from DB)
cpg sessions     # List sessions from CLI
cpg import       # One-time import of all existing session files
cpg status       # Show watcher/server status
```

## Implementation Order

1. Project setup (package.json, tsconfig, PostgreSQL schema)
2. Database connection + migration runner
3. ConversationStore (session/message/tool CRUD with transactions)
4. Session file parser (JSONL line → typed event objects)
5. File watcher (chokidar watching ~/.claude/projects/)
6. Ingest pipeline (watcher → parser → store, with deduplication)
7. REST API endpoints (Hono server)
8. SSE real-time streaming
9. Web frontend — session sidebar + conversation viewer
10. CLI entry point
11. Testing with real claude-code sessions
12. Database integrity tests
13. GUI polish and testing

## Non-Goals

- Modifying claude-code source code
- Replacing claude-code's session storage
- Cloud/remote storage
- Multi-user support
- Authentication (localhost only)
