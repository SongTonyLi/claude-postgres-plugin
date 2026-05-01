# Claude Postgres Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a plugin that watches claude-code session files, stores conversations in PostgreSQL, and serves a web dashboard for reviewing past sessions with a terminal-like UI.

**Architecture:** File watcher monitors `~/.claude/projects/` for JSONL session files, parses events, stores in PostgreSQL via ACID transactions. A Hono HTTP server exposes REST + SSE endpoints. A React frontend renders conversations in a terminal-like dark-themed UI with session browsing.

**Tech Stack:** Bun, TypeScript, PostgreSQL (postgres.js), Hono, chokidar, React 19, Tailwind CSS v4, Vite, react-markdown, rehype-highlight

---

## File Structure

```
claude-postgres-plugin/
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts                    # CLI entry point
│   ├── db/
│   │   ├── connection.ts           # PostgreSQL connection pool
│   │   ├── schema.sql              # DDL for all tables + indexes
│   │   └── migrate.ts              # Run schema migration
│   ├── store/
│   │   └── conversation-store.ts   # CRUD operations (sessions, messages, tools)
│   ├── parser/
│   │   └── session-parser.ts       # Parse JSONL lines into typed events
│   ├── watcher/
│   │   └── session-watcher.ts      # chokidar file watcher + tail
│   ├── ingest/
│   │   └── ingest-pipeline.ts      # Watcher → Parser → Store orchestration
│   └── server/
│       ├── app.ts                  # Hono app (REST + SSE + static)
│       └── sse.ts                  # SSE event emitter for browser clients
├── web/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                 # Main layout (sidebar + conversation)
│       ├── api/
│       │   └── client.ts           # REST API client
│       ├── hooks/
│       │   └── useSSE.ts           # SSE hook for real-time updates
│       └── components/
│           ├── SessionSidebar.tsx   # Session list sidebar
│           ├── ConversationView.tsx # Terminal-like conversation renderer
│           ├── MessageBubble.tsx    # Individual message rendering
│           ├── ToolCallBlock.tsx    # Expandable tool call display
│           └── ThinkingBlock.tsx    # Collapsible thinking block
└── tests/
    ├── db/
    │   └── conversation-store.test.ts
    ├── parser/
    │   └── session-parser.test.ts
    ├── ingest/
    │   └── ingest-pipeline.test.ts
    └── e2e/
        └── full-flow.test.ts
```

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Initialize project with Bun**

```bash
cd /Users/songli/claude-postgres-plugin
bun init -y
```

- [ ] **Step 2: Install backend dependencies**

```bash
bun add postgres hono chokidar @hono/node-server eventemitter3
bun add -d typescript @types/node
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Write .gitignore**

```
node_modules/
dist/
web/dist/
.env
*.log
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore bun.lock
git commit -m "initialize project with dependencies"
```

---

### Task 2: PostgreSQL Schema + Connection

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/connection.ts`
- Create: `src/db/migrate.ts`

- [ ] **Step 1: Start PostgreSQL and create database**

```bash
brew services start postgresql@14
createdb claude_sessions
```

- [ ] **Step 2: Write schema.sql**

```sql
-- src/db/schema.sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  project_path TEXT NOT NULL,
  cwd TEXT,
  model TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  title TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  parent_uuid TEXT,
  role TEXT NOT NULL,
  content TEXT,
  content_blocks JSONB NOT NULL DEFAULT '[]',
  thinking TEXT,
  is_sidechain BOOLEAN DEFAULT FALSE,
  is_meta BOOLEAN DEFAULT FALSE,
  sequence_num INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  UNIQUE(session_id, uuid)
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_uuid TEXT NOT NULL,
  result_uuid TEXT,
  tool_use_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input JSONB,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS raw_events (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  file_path TEXT,
  line_number INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_messages_uuid ON messages(session_id, uuid);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_use_id ON tool_calls(tool_use_id);
CREATE INDEX IF NOT EXISTS idx_raw_events_session ON raw_events(session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
```

- [ ] **Step 3: Write connection.ts**

```typescript
// src/db/connection.ts
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/claude_sessions";

let sql: ReturnType<typeof postgres>;

export function getDb(): ReturnType<typeof postgres> {
  if (!sql) {
    sql = postgres(DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end();
  }
}
```

- [ ] **Step 4: Write migrate.ts**

```typescript
// src/db/migrate.ts
import { readFileSync } from "fs";
import { join } from "path";
import { getDb } from "./connection";

export async function runMigrations(): Promise<void> {
  const sql = getDb();
  const schemaPath = join(import.meta.dir, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  await sql.unsafe(schema);
  console.log("Migrations complete");
}
```

- [ ] **Step 5: Test migration runs**

```bash
bun run src/db/migrate.ts
```

Expected: "Migrations complete" and tables created in `claude_sessions` database.

- [ ] **Step 6: Verify tables exist**

```bash
psql claude_sessions -c "\dt"
```

Expected: sessions, messages, tool_calls, raw_events tables listed.

- [ ] **Step 7: Commit**

```bash
git add src/db/
git commit -m "add PostgreSQL schema, connection pool, and migration"
```

---

### Task 3: ConversationStore (CRUD)

**Files:**
- Create: `src/store/conversation-store.ts`
- Create: `tests/db/conversation-store.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/db/conversation-store.test.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { ConversationStore } from "../../src/store/conversation-store";
import { getDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";

const store = new ConversationStore();

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  const sql = getDb();
  await sql`TRUNCATE raw_events, tool_calls, messages, sessions CASCADE`;
});

afterAll(async () => {
  await closeDb();
});

describe("ConversationStore", () => {
  test("upsertSession creates a new session", async () => {
    await store.upsertSession({
      id: "test-session-1",
      projectPath: "/tmp/test",
      cwd: "/tmp/test",
      model: "claude-sonnet-4-6",
      startedAt: new Date(),
      status: "active",
      title: "Test session",
    });

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe("test-session-1");
    expect(sessions[0].title).toBe("Test session");
  });

  test("upsertSession updates existing session", async () => {
    await store.upsertSession({
      id: "test-session-1",
      projectPath: "/tmp/test",
      startedAt: new Date(),
      status: "active",
      title: "Original",
    });
    await store.upsertSession({
      id: "test-session-1",
      projectPath: "/tmp/test",
      startedAt: new Date(),
      status: "completed",
      title: "Updated",
    });

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].title).toBe("Updated");
    expect(sessions[0].status).toBe("completed");
  });

  test("insertMessage stores a message", async () => {
    await store.upsertSession({
      id: "sess-1",
      projectPath: "/tmp",
      startedAt: new Date(),
      status: "active",
    });

    await store.insertMessage({
      sessionId: "sess-1",
      uuid: "msg-1",
      parentUuid: null,
      role: "user",
      content: "Hello world",
      contentBlocks: [{ type: "text", text: "Hello world" }],
      thinking: null,
      isSidechain: false,
      isMeta: false,
      sequenceNum: 0,
      timestamp: new Date(),
    });

    const messages = await store.getMessages("sess-1");
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("Hello world");
    expect(messages[0].role).toBe("user");
  });

  test("insertMessage deduplicates on session_id + uuid", async () => {
    await store.upsertSession({
      id: "sess-1",
      projectPath: "/tmp",
      startedAt: new Date(),
      status: "active",
    });

    const msg = {
      sessionId: "sess-1",
      uuid: "msg-dup",
      parentUuid: null,
      role: "user" as const,
      content: "Hello",
      contentBlocks: [{ type: "text", text: "Hello" }],
      thinking: null,
      isSidechain: false,
      isMeta: false,
      sequenceNum: 0,
      timestamp: new Date(),
    };

    await store.insertMessage(msg);
    await store.insertMessage(msg); // duplicate — should not throw

    const messages = await store.getMessages("sess-1");
    expect(messages.length).toBe(1);
  });

  test("insertToolCall and completeToolCall", async () => {
    await store.upsertSession({
      id: "sess-1",
      projectPath: "/tmp",
      startedAt: new Date(),
      status: "active",
    });

    await store.insertToolCall({
      sessionId: "sess-1",
      messageUuid: "msg-1",
      toolUseId: "tool-1",
      toolName: "Read",
      input: { file_path: "/tmp/test.txt" },
      status: "pending",
    });

    await store.completeToolCall("tool-1", "file contents here", null);

    const tools = await store.getToolCalls("sess-1");
    expect(tools.length).toBe(1);
    expect(tools[0].status).toBe("completed");
    expect(tools[0].output).toBe("file contents here");
  });

  test("insertRawEvent stores raw JSONL data", async () => {
    await store.insertRawEvent({
      sessionId: "sess-raw",
      eventType: "user",
      data: { type: "user", message: "test" },
      filePath: "/tmp/test.jsonl",
      lineNumber: 1,
    });

    const sql = getDb();
    const rows = await sql`SELECT * FROM raw_events WHERE session_id = 'sess-raw'`;
    expect(rows.length).toBe(1);
    expect(rows[0].event_type).toBe("user");
  });

  test("getSession returns null for missing session", async () => {
    const session = await store.getSession("nonexistent");
    expect(session).toBeNull();
  });

  test("listSessions returns sessions ordered by started_at DESC", async () => {
    const now = new Date();
    await store.upsertSession({
      id: "old",
      projectPath: "/tmp",
      startedAt: new Date(now.getTime() - 10000),
      status: "completed",
    });
    await store.upsertSession({
      id: "new",
      projectPath: "/tmp",
      startedAt: new Date(now.getTime()),
      status: "active",
    });

    const sessions = await store.listSessions();
    expect(sessions[0].id).toBe("new");
    expect(sessions[1].id).toBe("old");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/db/conversation-store.test.ts
```

Expected: FAIL — `ConversationStore` module not found.

- [ ] **Step 3: Write conversation-store.ts**

```typescript
// src/store/conversation-store.ts
import { getDb } from "../db/connection";

export interface SessionRecord {
  id: string;
  projectPath: string;
  cwd?: string;
  model?: string;
  startedAt: Date;
  endedAt?: Date;
  status: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageRecord {
  sessionId: string;
  uuid: string;
  parentUuid: string | null;
  role: string;
  content: string | null;
  contentBlocks: unknown[];
  thinking: string | null;
  isSidechain: boolean;
  isMeta: boolean;
  sequenceNum: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ToolCallRecord {
  sessionId: string;
  messageUuid: string;
  resultUuid?: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  output?: string;
  status: string;
  error?: string;
}

export interface RawEventRecord {
  sessionId: string;
  eventType: string;
  data: unknown;
  filePath?: string;
  lineNumber?: number;
}

export class ConversationStore {
  async upsertSession(session: SessionRecord): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO sessions (id, project_path, cwd, model, started_at, ended_at, status, title, metadata)
      VALUES (
        ${session.id},
        ${session.projectPath},
        ${session.cwd ?? null},
        ${session.model ?? null},
        ${session.startedAt},
        ${session.endedAt ?? null},
        ${session.status},
        ${session.title ?? null},
        ${JSON.stringify(session.metadata ?? {})}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        title = COALESCE(EXCLUDED.title, sessions.title),
        ended_at = COALESCE(EXCLUDED.ended_at, sessions.ended_at),
        model = COALESCE(EXCLUDED.model, sessions.model),
        cwd = COALESCE(EXCLUDED.cwd, sessions.cwd),
        metadata = EXCLUDED.metadata
    `;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const sql = getDb();
    const rows = await sql`SELECT * FROM sessions WHERE id = ${id}`;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      projectPath: r.project_path,
      cwd: r.cwd,
      model: r.model,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      title: r.title,
      metadata: r.metadata,
    };
  }

  async listSessions(): Promise<SessionRecord[]> {
    const sql = getDb();
    const rows = await sql`SELECT * FROM sessions ORDER BY started_at DESC`;
    return rows.map((r) => ({
      id: r.id,
      projectPath: r.project_path,
      cwd: r.cwd,
      model: r.model,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      title: r.title,
      metadata: r.metadata,
    }));
  }

  async insertMessage(msg: MessageRecord): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO messages (session_id, uuid, parent_uuid, role, content, content_blocks, thinking, is_sidechain, is_meta, sequence_num, timestamp, metadata)
      VALUES (
        ${msg.sessionId},
        ${msg.uuid},
        ${msg.parentUuid},
        ${msg.role},
        ${msg.content},
        ${JSON.stringify(msg.contentBlocks)},
        ${msg.thinking},
        ${msg.isSidechain},
        ${msg.isMeta},
        ${msg.sequenceNum},
        ${msg.timestamp},
        ${JSON.stringify(msg.metadata ?? {})}
      )
      ON CONFLICT (session_id, uuid) DO NOTHING
    `;
  }

  async getMessages(sessionId: string): Promise<MessageRecord[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM messages WHERE session_id = ${sessionId} ORDER BY sequence_num ASC
    `;
    return rows.map((r) => ({
      sessionId: r.session_id,
      uuid: r.uuid,
      parentUuid: r.parent_uuid,
      role: r.role,
      content: r.content,
      contentBlocks: r.content_blocks,
      thinking: r.thinking,
      isSidechain: r.is_sidechain,
      isMeta: r.is_meta,
      sequenceNum: r.sequence_num,
      timestamp: r.timestamp,
      metadata: r.metadata,
    }));
  }

  async insertToolCall(tool: ToolCallRecord): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO tool_calls (session_id, message_uuid, tool_use_id, tool_name, input, status)
      VALUES (
        ${tool.sessionId},
        ${tool.messageUuid},
        ${tool.toolUseId},
        ${tool.toolName},
        ${JSON.stringify(tool.input)},
        ${tool.status}
      )
      ON CONFLICT DO NOTHING
    `;
  }

  async completeToolCall(toolUseId: string, output: string | null, error: string | null): Promise<void> {
    const sql = getDb();
    const status = error ? "failed" : "completed";
    await sql`
      UPDATE tool_calls SET
        output = ${output},
        error = ${error},
        status = ${status},
        completed_at = NOW()
      WHERE tool_use_id = ${toolUseId}
    `;
  }

  async getToolCalls(sessionId: string): Promise<ToolCallRecord[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM tool_calls WHERE session_id = ${sessionId} ORDER BY created_at ASC
    `;
    return rows.map((r) => ({
      sessionId: r.session_id,
      messageUuid: r.message_uuid,
      resultUuid: r.result_uuid,
      toolUseId: r.tool_use_id,
      toolName: r.tool_name,
      input: r.input,
      output: r.output,
      status: r.status,
      error: r.error,
    }));
  }

  async insertRawEvent(event: RawEventRecord): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO raw_events (session_id, event_type, data, file_path, line_number)
      VALUES (
        ${event.sessionId},
        ${event.eventType},
        ${JSON.stringify(event.data)},
        ${event.filePath ?? null},
        ${event.lineNumber ?? null}
      )
    `;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/db/conversation-store.test.ts
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/ tests/db/
git commit -m "add ConversationStore with CRUD operations and tests"
```

---

### Task 4: Session File Parser

**Files:**
- Create: `src/parser/session-parser.ts`
- Create: `tests/parser/session-parser.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/parser/session-parser.test.ts
import { describe, test, expect } from "bun:test";
import { parseSessionLine, extractTextContent, extractThinking, extractToolUses, extractToolResults } from "../../src/parser/session-parser";

describe("parseSessionLine", () => {
  test("parses user message", () => {
    const line = JSON.stringify({
      type: "user",
      uuid: "u1",
      parentUuid: null,
      sessionId: "s1",
      isSidechain: false,
      isMeta: false,
      timestamp: "2026-05-01T10:00:00Z",
      cwd: "/tmp",
      message: {
        role: "user",
        content: [{ type: "text", text: "Hello world" }],
      },
    });

    const event = parseSessionLine(line);
    expect(event).not.toBeNull();
    expect(event!.type).toBe("user");
    expect(event!.uuid).toBe("u1");
    expect(event!.sessionId).toBe("s1");
  });

  test("parses assistant message with tool_use", () => {
    const line = JSON.stringify({
      type: "assistant",
      uuid: "a1",
      parentUuid: "u1",
      sessionId: "s1",
      isSidechain: false,
      timestamp: "2026-05-01T10:00:01Z",
      message: {
        role: "assistant",
        content: [
          { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/tmp/x.txt" } },
        ],
      },
    });

    const event = parseSessionLine(line);
    expect(event!.type).toBe("assistant");
    const tools = extractToolUses(event!.data.message.content);
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("Read");
  });

  test("parses assistant message with thinking", () => {
    const line = JSON.stringify({
      type: "assistant",
      uuid: "a2",
      parentUuid: "u1",
      sessionId: "s1",
      isSidechain: false,
      timestamp: "2026-05-01T10:00:01Z",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Let me think about this..." },
          { type: "text", text: "Here is my answer." },
        ],
      },
    });

    const event = parseSessionLine(line);
    const thinking = extractThinking(event!.data.message.content);
    expect(thinking).toBe("Let me think about this...");
    const text = extractTextContent(event!.data.message.content);
    expect(text).toBe("Here is my answer.");
  });

  test("parses user message with tool_result", () => {
    const line = JSON.stringify({
      type: "user",
      uuid: "u2",
      parentUuid: "a1",
      sessionId: "s1",
      isSidechain: false,
      toolUseResult: true,
      timestamp: "2026-05-01T10:00:02Z",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "tool-1", content: "file contents" },
        ],
      },
    });

    const event = parseSessionLine(line);
    const results = extractToolResults(event!.data.message.content);
    expect(results.length).toBe(1);
    expect(results[0].toolUseId).toBe("tool-1");
    expect(results[0].output).toBe("file contents");
  });

  test("parses system compaction event", () => {
    const line = JSON.stringify({
      type: "system",
      uuid: "sys-1",
      parentUuid: null,
      sessionId: "s1",
      subtype: "compact",
      durationMs: 5000,
      messageCount: 50,
      isSidechain: false,
      isMeta: true,
      timestamp: "2026-05-01T10:05:00Z",
    });

    const event = parseSessionLine(line);
    expect(event!.type).toBe("system");
    expect(event!.data.subtype).toBe("compact");
  });

  test("returns null for non-message types", () => {
    const line = JSON.stringify({
      type: "last-prompt",
      lastPrompt: "hello",
      sessionId: "s1",
    });

    const event = parseSessionLine(line);
    expect(event).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    const event = parseSessionLine("not json {{{");
    expect(event).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/parser/session-parser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write session-parser.ts**

```typescript
// src/parser/session-parser.ts

export interface ParsedEvent {
  type: "user" | "assistant" | "system";
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  isSidechain: boolean;
  isMeta: boolean;
  data: Record<string, unknown>;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolUseId: string;
  output: string;
  isError?: boolean;
}

export function parseSessionLine(line: string): ParsedEvent | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const type = parsed.type as string;

  // Only process user, assistant, system messages
  if (type !== "user" && type !== "assistant" && type !== "system") {
    return null;
  }

  return {
    type: type as ParsedEvent["type"],
    uuid: (parsed.uuid as string) || "",
    parentUuid: (parsed.parentUuid as string) || null,
    sessionId: (parsed.sessionId as string) || "",
    timestamp: (parsed.timestamp as string) || new Date().toISOString(),
    isSidechain: (parsed.isSidechain as boolean) || false,
    isMeta: (parsed.isMeta as boolean) || false,
    data: parsed,
  };
}

export function extractTextContent(contentBlocks: unknown[]): string {
  if (!Array.isArray(contentBlocks)) return "";
  return contentBlocks
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

export function extractThinking(contentBlocks: unknown[]): string | null {
  if (!Array.isArray(contentBlocks)) return null;
  const thinking = contentBlocks
    .filter((b: any) => b.type === "thinking")
    .map((b: any) => b.thinking)
    .join("\n");
  return thinking || null;
}

export function extractToolUses(contentBlocks: unknown[]): ToolUse[] {
  if (!Array.isArray(contentBlocks)) return [];
  return contentBlocks
    .filter((b: any) => b.type === "tool_use")
    .map((b: any) => ({
      id: b.id,
      name: b.name,
      input: b.input,
    }));
}

export function extractToolResults(contentBlocks: unknown[]): ToolResult[] {
  if (!Array.isArray(contentBlocks)) return [];
  return contentBlocks
    .filter((b: any) => b.type === "tool_result")
    .map((b: any) => {
      let output = "";
      if (typeof b.content === "string") {
        output = b.content;
      } else if (Array.isArray(b.content)) {
        output = b.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
      }
      return {
        toolUseId: b.tool_use_id,
        output,
        isError: b.is_error,
      };
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/parser/session-parser.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/parser/ tests/parser/
git commit -m "add session file parser with content extraction helpers"
```

---

### Task 5: Session File Watcher

**Files:**
- Create: `src/watcher/session-watcher.ts`

- [ ] **Step 1: Write session-watcher.ts**

```typescript
// src/watcher/session-watcher.ts
import chokidar from "chokidar";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import EventEmitter from "eventemitter3";

export interface WatcherEvents {
  line: (filePath: string, line: string, lineNumber: number) => void;
  error: (error: Error) => void;
  ready: () => void;
}

export class SessionWatcher extends EventEmitter<WatcherEvents> {
  private watcher: chokidar.FSWatcher | null = null;
  private fileOffsets: Map<string, number> = new Map();
  private watchPath: string;

  constructor(watchPath?: string) {
    super();
    this.watchPath = watchPath || join(homedir(), ".claude", "projects");
  }

  start(): void {
    const globPattern = join(this.watchPath, "**", "*.jsonl");

    this.watcher = chokidar.watch(globPattern, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on("add", (filePath) => this.processFile(filePath));
    this.watcher.on("change", (filePath) => this.processFile(filePath));
    this.watcher.on("error", (error) => this.emit("error", error));
    this.watcher.on("ready", () => this.emit("ready"));
  }

  private processFile(filePath: string): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const currentOffset = this.fileOffsets.get(filePath) || 0;

      // Only process new content
      const newContent = content.slice(currentOffset);
      if (!newContent.trim()) return;

      const lines = newContent.split("\n");
      let lineOffset = currentOffset === 0 ? 0 : content.slice(0, currentOffset).split("\n").length;

      for (const line of lines) {
        if (line.trim()) {
          this.emit("line", filePath, line, lineOffset);
          lineOffset++;
        }
      }

      this.fileOffsets.set(filePath, content.length);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.fileOffsets.clear();
  }

  getWatchPath(): string {
    return this.watchPath;
  }
}
```

- [ ] **Step 2: Smoke test with a temporary JSONL file**

```bash
bun -e "
import { SessionWatcher } from './src/watcher/session-watcher';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const dir = join(tmpdir(), 'cpg-test-' + Date.now());
mkdirSync(dir, { recursive: true });

const watcher = new SessionWatcher(dir);
let received = 0;
watcher.on('line', (fp, line, num) => {
  received++;
  console.log('Line', num, ':', line.slice(0, 80));
});
watcher.on('ready', () => {
  console.log('Watcher ready');
  const file = join(dir, 'test.jsonl');
  writeFileSync(file, JSON.stringify({ type: 'user', uuid: 'u1', sessionId: 's1' }) + '\n');
  setTimeout(() => {
    appendFileSync(file, JSON.stringify({ type: 'assistant', uuid: 'a1', sessionId: 's1' }) + '\n');
  }, 200);
  setTimeout(async () => {
    console.log('Received', received, 'lines');
    await watcher.stop();
    process.exit(received >= 2 ? 0 : 1);
  }, 1000);
});
watcher.start();
"
```

Expected: "Watcher ready", two "Line" outputs, "Received 2 lines".

- [ ] **Step 3: Commit**

```bash
git add src/watcher/
git commit -m "add session file watcher with incremental tailing"
```

---

### Task 6: Ingest Pipeline

**Files:**
- Create: `src/ingest/ingest-pipeline.ts`
- Create: `tests/ingest/ingest-pipeline.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// tests/ingest/ingest-pipeline.test.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { IngestPipeline } from "../../src/ingest/ingest-pipeline";
import { ConversationStore } from "../../src/store/conversation-store";
import { getDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const store = new ConversationStore();
let testDir: string;

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  const sql = getDb();
  await sql`TRUNCATE raw_events, tool_calls, messages, sessions CASCADE`;
  testDir = join(tmpdir(), "cpg-ingest-" + Date.now());
  mkdirSync(testDir, { recursive: true });
});

afterAll(async () => {
  await closeDb();
});

describe("IngestPipeline", () => {
  test("ingests a user message from JSONL", async () => {
    const pipeline = new IngestPipeline(store, testDir);

    const sessionId = "test-sess-1";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    const userMsg = JSON.stringify({
      type: "user",
      uuid: "u1",
      parentUuid: null,
      sessionId,
      isSidechain: false,
      timestamp: "2026-05-01T10:00:00Z",
      cwd: "/tmp/project",
      message: { role: "user", content: [{ type: "text", text: "What is 2+2?" }] },
    });

    writeFileSync(jsonlPath, userMsg + "\n");

    pipeline.start();
    // Wait for watcher to detect and process
    await new Promise((r) => setTimeout(r, 800));
    await pipeline.stop();

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionId);

    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("What is 2+2?");
  });

  test("ingests assistant message with tool_use and matching tool_result", async () => {
    const pipeline = new IngestPipeline(store, testDir);
    const sessionId = "test-sess-2";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    const lines = [
      JSON.stringify({
        type: "user", uuid: "u1", parentUuid: null, sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:00Z", cwd: "/tmp",
        message: { role: "user", content: [{ type: "text", text: "Read file" }] },
      }),
      JSON.stringify({
        type: "assistant", uuid: "a1", parentUuid: "u1", sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:01Z",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/tmp/x" } }],
        },
      }),
      JSON.stringify({
        type: "user", uuid: "u2", parentUuid: "a1", sessionId,
        isSidechain: false, toolUseResult: true, timestamp: "2026-05-01T10:00:02Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tu-1", content: "hello world" }],
        },
      }),
    ];

    writeFileSync(jsonlPath, lines.join("\n") + "\n");

    pipeline.start();
    await new Promise((r) => setTimeout(r, 800));
    await pipeline.stop();

    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(3);

    const tools = await store.getToolCalls(sessionId);
    expect(tools.length).toBe(1);
    expect(tools[0].toolName).toBe("Read");
    expect(tools[0].status).toBe("completed");
    expect(tools[0].output).toBe("hello world");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/ingest/ingest-pipeline.test.ts
```

Expected: FAIL — `IngestPipeline` module not found.

- [ ] **Step 3: Write ingest-pipeline.ts**

```typescript
// src/ingest/ingest-pipeline.ts
import { SessionWatcher } from "../watcher/session-watcher";
import {
  parseSessionLine,
  extractTextContent,
  extractThinking,
  extractToolUses,
  extractToolResults,
} from "../parser/session-parser";
import { ConversationStore } from "../store/conversation-store";
import { basename, dirname } from "path";
import EventEmitter from "eventemitter3";

export interface PipelineEvents {
  "session:new": (sessionId: string) => void;
  "session:update": (sessionId: string) => void;
  "message:new": (sessionId: string, uuid: string, role: string) => void;
  "tool:update": (sessionId: string, toolUseId: string) => void;
  error: (error: Error) => void;
}

export class IngestPipeline extends EventEmitter<PipelineEvents> {
  private watcher: SessionWatcher;
  private store: ConversationStore;
  private sequenceCounters: Map<string, number> = new Map();
  private knownSessions: Set<string> = new Set();

  constructor(store: ConversationStore, watchPath?: string) {
    super();
    this.store = store;
    this.watcher = new SessionWatcher(watchPath);
  }

  start(): void {
    this.watcher.on("line", (filePath, line, lineNumber) => {
      this.processLine(filePath, line, lineNumber).catch((err) => {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      });
    });

    this.watcher.on("error", (err) => this.emit("error", err));
    this.watcher.start();
  }

  async stop(): Promise<void> {
    await this.watcher.stop();
  }

  private async processLine(filePath: string, line: string, lineNumber: number): Promise<void> {
    const event = parseSessionLine(line);
    if (!event) return;

    // Derive sessionId from the event data or filename
    const sessionId = event.sessionId || basename(filePath, ".jsonl");
    if (!sessionId) return;

    // Store raw event
    await this.store.insertRawEvent({
      sessionId,
      eventType: event.type,
      data: event.data,
      filePath,
      lineNumber,
    });

    // Ensure session exists
    if (!this.knownSessions.has(sessionId)) {
      const projectPath = this.deriveProjectPath(filePath);
      const cwd = (event.data as any).cwd || projectPath;
      await this.store.upsertSession({
        id: sessionId,
        projectPath,
        cwd,
        startedAt: new Date(event.timestamp),
        status: "active",
      });
      this.knownSessions.add(sessionId);
      this.emit("session:new", sessionId);
    }

    // Get next sequence number for this session
    const seq = this.sequenceCounters.get(sessionId) || 0;
    this.sequenceCounters.set(sessionId, seq + 1);

    if (event.type === "user" || event.type === "assistant") {
      const message = (event.data as any).message;
      if (!message) return;

      const contentBlocks = message.content || [];
      const textContent = extractTextContent(contentBlocks);
      const thinking = extractThinking(contentBlocks);

      // Auto-generate session title from first real user message
      if (event.type === "user" && seq === 0 && textContent && !(event.data as any).toolUseResult) {
        const title = textContent.slice(0, 100);
        await this.store.upsertSession({
          id: sessionId,
          projectPath: this.deriveProjectPath(filePath),
          startedAt: new Date(event.timestamp),
          status: "active",
          title,
        });
      }

      // Insert the message
      await this.store.insertMessage({
        sessionId,
        uuid: event.uuid,
        parentUuid: event.parentUuid,
        role: event.type === "assistant" ? "assistant" : "user",
        content: textContent || null,
        contentBlocks,
        thinking,
        isSidechain: event.isSidechain,
        isMeta: event.isMeta,
        sequenceNum: seq,
        timestamp: new Date(event.timestamp),
      });

      this.emit("message:new", sessionId, event.uuid, event.type);

      // Extract tool_use blocks from assistant messages
      if (event.type === "assistant") {
        const toolUses = extractToolUses(contentBlocks);
        for (const tu of toolUses) {
          await this.store.insertToolCall({
            sessionId,
            messageUuid: event.uuid,
            toolUseId: tu.id,
            toolName: tu.name,
            input: tu.input,
            status: "pending",
          });
        }
      }

      // Extract tool_result blocks from user messages
      if (event.type === "user" && (event.data as any).toolUseResult) {
        const results = extractToolResults(contentBlocks);
        for (const tr of results) {
          const error = tr.isError ? tr.output : null;
          const output = tr.isError ? null : tr.output;
          await this.store.completeToolCall(tr.toolUseId, output, error);
          this.emit("tool:update", sessionId, tr.toolUseId);
        }
      }
    }

    if (event.type === "system") {
      // Store system events as messages too (compaction markers)
      await this.store.insertMessage({
        sessionId,
        uuid: event.uuid,
        parentUuid: event.parentUuid,
        role: "system",
        content: `Context compacted: ${(event.data as any).messageCount || 0} messages in ${(event.data as any).durationMs || 0}ms`,
        contentBlocks: [],
        thinking: null,
        isSidechain: event.isSidechain,
        isMeta: event.isMeta,
        sequenceNum: seq,
        timestamp: new Date(event.timestamp),
        metadata: {
          subtype: (event.data as any).subtype,
          durationMs: (event.data as any).durationMs,
          messageCount: (event.data as any).messageCount,
        },
      });
      this.emit("session:update", sessionId);
    }
  }

  private deriveProjectPath(filePath: string): string {
    // Session files live at ~/.claude/projects/<project-hash>/<session>.jsonl
    // or ~/.claude/projects/<project-hash>/<session>/subagents/<agent>.jsonl
    const parts = filePath.split("/");
    const projectsIdx = parts.indexOf("projects");
    if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
      // The project hash is the directory name after "projects"
      return parts[projectsIdx + 1];
    }
    return dirname(filePath);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/ingest/ingest-pipeline.test.ts
```

Expected: Both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingest/ tests/ingest/
git commit -m "add ingest pipeline connecting watcher to parser to store"
```

---

### Task 7: REST API + SSE Server

**Files:**
- Create: `src/server/sse.ts`
- Create: `src/server/app.ts`

- [ ] **Step 1: Write sse.ts**

```typescript
// src/server/sse.ts
import EventEmitter from "eventemitter3";

interface SSEClient {
  id: string;
  sessionFilter: string | null;
  controller: ReadableStreamDefaultController;
}

export class SSEManager extends EventEmitter {
  private clients: Map<string, SSEClient> = new Map();

  addClient(id: string, controller: ReadableStreamDefaultController, sessionFilter: string | null): void {
    this.clients.set(id, { id, sessionFilter, controller });
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: string, data: unknown, sessionId?: string): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(payload);

    for (const client of this.clients.values()) {
      if (client.sessionFilter && sessionId && client.sessionFilter !== sessionId) {
        continue;
      }
      try {
        client.controller.enqueue(bytes);
      } catch {
        this.clients.delete(client.id);
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
```

- [ ] **Step 2: Write app.ts**

```typescript
// src/server/app.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join } from "path";
import { ConversationStore } from "../store/conversation-store";
import { SSEManager } from "./sse";

export function createApp(store: ConversationStore, sse: SSEManager): Hono {
  const app = new Hono();

  app.use("*", cors());

  // REST API
  app.get("/api/sessions", async (c) => {
    const sessions = await store.listSessions();
    return c.json(sessions);
  });

  app.get("/api/sessions/:id", async (c) => {
    const session = await store.getSession(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    return c.json(session);
  });

  app.get("/api/sessions/:id/messages", async (c) => {
    const messages = await store.getMessages(c.req.param("id"));
    return c.json(messages);
  });

  app.get("/api/sessions/:id/tools", async (c) => {
    const tools = await store.getToolCalls(c.req.param("id"));
    return c.json(tools);
  });

  // SSE endpoint
  app.get("/api/events/sse", (c) => {
    const sessionId = c.req.query("sessionId") || null;
    const clientId = crypto.randomUUID();

    const stream = new ReadableStream({
      start(controller) {
        sse.addClient(clientId, controller, sessionId);

        // Send keepalive ping
        const keepalive = setInterval(() => {
          try {
            const ping = new TextEncoder().encode(": keepalive\n\n");
            controller.enqueue(ping);
          } catch {
            clearInterval(keepalive);
          }
        }, 15000);

        // Cleanup on close
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(keepalive);
          sse.removeClient(clientId);
        });
      },
      cancel() {
        sse.removeClient(clientId);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  // Static files for web dashboard (production)
  app.use("/*", serveStatic({ root: join(import.meta.dir, "../../web/dist") }));

  // SPA fallback
  app.get("*", serveStatic({ path: join(import.meta.dir, "../../web/dist/index.html") }));

  return app;
}
```

- [ ] **Step 3: Smoke test the server**

```bash
bun -e "
import { createApp } from './src/server/app';
import { ConversationStore } from './src/store/conversation-store';
import { SSEManager } from './src/server/sse';
import { runMigrations } from './src/db/migrate';

await runMigrations();
const store = new ConversationStore();
const sse = new SSEManager();
const app = createApp(store, sse);

const server = Bun.serve({ port: 3456, fetch: app.fetch });
console.log('Server running on http://localhost:3456');

// Test endpoints
const r1 = await fetch('http://localhost:3456/api/sessions');
console.log('GET /api/sessions:', r1.status, await r1.json());

server.stop();
process.exit(0);
"
```

Expected: Server starts, `GET /api/sessions` returns 200 with empty array.

- [ ] **Step 4: Commit**

```bash
git add src/server/
git commit -m "add Hono REST API server with SSE support"
```

---

### Task 8: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
// src/index.ts
import { runMigrations } from "./db/migrate";
import { ConversationStore } from "./store/conversation-store";
import { IngestPipeline } from "./ingest/ingest-pipeline";
import { SSEManager } from "./server/sse";
import { createApp } from "./server/app";

const PORT = parseInt(process.env.CPG_PORT || "3456");

async function main() {
  const command = process.argv[2] || "start";

  if (command === "start") {
    await startAll();
  } else if (command === "web") {
    await startWeb();
  } else if (command === "import") {
    await importExisting();
  } else {
    console.log("Usage: cpg [start|web|import]");
    console.log("  start   - Start watcher + web server (default)");
    console.log("  web     - Start only web dashboard");
    console.log("  import  - Import existing session files");
    process.exit(0);
  }
}

async function startAll() {
  console.log("Starting claude-postgres-plugin...");

  await runMigrations();
  const store = new ConversationStore();
  const sse = new SSEManager();

  // Start ingest pipeline
  const pipeline = new IngestPipeline(store);
  pipeline.on("session:new", (id) => sse.broadcast("session:new", { sessionId: id }));
  pipeline.on("session:update", (id) => sse.broadcast("session:update", { sessionId: id }, id));
  pipeline.on("message:new", (sid, uuid, role) =>
    sse.broadcast("message:new", { sessionId: sid, uuid, role }, sid)
  );
  pipeline.on("tool:update", (sid, toolId) =>
    sse.broadcast("tool:update", { sessionId: sid, toolUseId: toolId }, sid)
  );
  pipeline.on("error", (err) => console.error("Pipeline error:", err.message));
  pipeline.start();

  // Start web server
  const app = createApp(store, sse);
  Bun.serve({ port: PORT, fetch: app.fetch });
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Watching: ${pipeline["watcher"].getWatchPath()}`);
  console.log("Press Ctrl+C to stop");

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await pipeline.stop();
    process.exit(0);
  });
}

async function startWeb() {
  console.log("Starting web dashboard only...");
  await runMigrations();
  const store = new ConversationStore();
  const sse = new SSEManager();
  const app = createApp(store, sse);
  Bun.serve({ port: PORT, fetch: app.fetch });
  console.log(`Dashboard: http://localhost:${PORT}`);
}

async function importExisting() {
  console.log("Importing existing session files...");
  await runMigrations();
  const store = new ConversationStore();

  // Use a temporary pipeline that processes once and stops
  const pipeline = new IngestPipeline(store);
  pipeline.start();

  // Wait for initial scan to complete
  pipeline["watcher"].on("ready", async () => {
    console.log("Initial scan complete. Waiting for processing...");
    await new Promise((r) => setTimeout(r, 2000));
    await pipeline.stop();

    const sessions = await store.listSessions();
    console.log(`Imported ${sessions.length} sessions`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Add bin entry to package.json**

Add to package.json:
```json
{
  "bin": {
    "cpg": "src/index.ts"
  },
  "scripts": {
    "start": "bun run src/index.ts start",
    "web": "bun run src/index.ts web",
    "import": "bun run src/index.ts import"
  }
}
```

- [ ] **Step 3: Test CLI help**

```bash
bun run src/index.ts help
```

Expected: Usage message with start/web/import commands.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts package.json
git commit -m "add CLI entry point with start, web, and import commands"
```

---

### Task 9: Web Frontend Setup

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`

- [ ] **Step 1: Initialize web project**

```bash
mkdir -p web/src
cd web
bun init -y
bun add react react-dom react-markdown remark-gfm rehype-highlight
bun add -d @vitejs/plugin-react vite typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite
cd ..
```

- [ ] **Step 2: Write web/vite.config.ts**

```typescript
// web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3456",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 3: Write web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write web/index.html**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Claude Sessions</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Write web/src/main.tsx**

```tsx
// web/src/main.tsx
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 6: Write web/src/index.css**

```css
@import "tailwindcss";
@import "highlight.js/styles/github-dark.min.css";

:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #1c2128;
  --border: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --accent-green: #3fb950;
  --accent-blue: #58a6ff;
  --accent-purple: #bc8cff;
  --accent-cyan: #39d2c0;
  --accent-yellow: #d29922;
  --accent-orange: #f0883e;
}

body {
  margin: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: "JetBrains Mono", ui-monospace, monospace;
  font-size: 14px;
}

/* Scrollbar styling */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--bg-primary); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

/* Markdown code blocks */
pre { background: var(--bg-primary) !important; border: 1px solid var(--border); border-radius: 6px; padding: 12px; overflow-x: auto; }
code { font-family: "JetBrains Mono", monospace; font-size: 13px; }
p code { background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px; }
```

- [ ] **Step 7: Verify Vite builds**

```bash
cd web && npx vite build && cd ..
```

Expected: Build succeeds, creates `web/dist/`.

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/tsconfig.json web/vite.config.ts web/index.html web/src/main.tsx web/src/index.css web/bun.lock
echo "web/node_modules/" >> .gitignore
git add .gitignore
git commit -m "initialize web frontend with React, Tailwind, and Vite"
```

---

### Task 10: API Client + SSE Hook

**Files:**
- Create: `web/src/api/client.ts`
- Create: `web/src/hooks/useSSE.ts`

- [ ] **Step 1: Write client.ts**

```typescript
// web/src/api/client.ts
const BASE = "";

export interface Session {
  id: string;
  projectPath: string;
  cwd: string | null;
  model: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  title: string | null;
  metadata: Record<string, unknown>;
}

export interface Message {
  sessionId: string;
  uuid: string;
  parentUuid: string | null;
  role: string;
  content: string | null;
  contentBlocks: ContentBlock[];
  thinking: string | null;
  isSidechain: boolean;
  isMeta: boolean;
  sequenceNum: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ToolCall {
  sessionId: string;
  messageUuid: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  output: string | null;
  status: string;
  error: string | null;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown };

export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE}/api/sessions`);
  return res.json();
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/api/sessions/${id}`);
  return res.json();
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/messages`);
  return res.json();
}

export async function getToolCalls(sessionId: string): Promise<ToolCall[]> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/tools`);
  return res.json();
}
```

- [ ] **Step 2: Write useSSE.ts**

```typescript
// web/src/hooks/useSSE.ts
import { useEffect, useRef, useState, useCallback } from "react";

interface SSEOptions {
  sessionId?: string | null;
  onSessionNew?: (data: { sessionId: string }) => void;
  onSessionUpdate?: (data: { sessionId: string }) => void;
  onMessageNew?: (data: { sessionId: string; uuid: string; role: string }) => void;
  onToolUpdate?: (data: { sessionId: string; toolUseId: string }) => void;
}

export function useSSE(options: SSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    const params = new URLSearchParams();
    if (optionsRef.current.sessionId) {
      params.set("sessionId", optionsRef.current.sessionId);
    }

    const url = `/api/events/sse?${params}`;
    const es = new EventSource(url);

    es.onopen = () => setIsConnected(true);
    es.onerror = () => {
      setIsConnected(false);
      es.close();
      setTimeout(connect, 3000);
    };

    es.addEventListener("session:new", (e) => {
      optionsRef.current.onSessionNew?.(JSON.parse(e.data));
    });
    es.addEventListener("session:update", (e) => {
      optionsRef.current.onSessionUpdate?.(JSON.parse(e.data));
    });
    es.addEventListener("message:new", (e) => {
      optionsRef.current.onMessageNew?.(JSON.parse(e.data));
    });
    es.addEventListener("tool:update", (e) => {
      optionsRef.current.onToolUpdate?.(JSON.parse(e.data));
    });

    eventSourceRef.current = es;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/api/ web/src/hooks/
git commit -m "add REST API client and SSE hook for real-time updates"
```

---

### Task 11: Session Sidebar Component

**Files:**
- Create: `web/src/components/SessionSidebar.tsx`

- [ ] **Step 1: Write SessionSidebar.tsx**

```tsx
// web/src/components/SessionSidebar.tsx
import { Session } from "../api/client";

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SessionSidebar({ sessions, selectedId, onSelect }: Props) {
  return (
    <div
      style={{
        width: 300,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-purple)" }}>
          cpg
        </span>
        <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
          {sessions.length} sessions
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 12px",
              border: "none",
              borderRadius: 6,
              background: selectedId === s.id ? "var(--bg-tertiary)" : "transparent",
              color: "var(--text-primary)",
              textAlign: "left",
              cursor: "pointer",
              marginBottom: 2,
              fontFamily: "inherit",
              fontSize: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: s.status === "active" ? "var(--accent-green)" : "var(--text-muted)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {s.title || s.id.slice(0, 8)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "var(--text-secondary)",
                fontSize: 11,
              }}
            >
              <span>{formatDate(s.startedAt)}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {s.projectPath.split("-").pop()?.slice(0, 12)}
              </span>
            </div>
          </button>
        ))}
        {sessions.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>
            No sessions yet
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/SessionSidebar.tsx
git commit -m "add session sidebar component with time formatting"
```

---

### Task 12: Message Rendering Components

**Files:**
- Create: `web/src/components/MessageBubble.tsx`
- Create: `web/src/components/ToolCallBlock.tsx`
- Create: `web/src/components/ThinkingBlock.tsx`

- [ ] **Step 1: Write ThinkingBlock.tsx**

```tsx
// web/src/components/ThinkingBlock.tsx
import { useState } from "react";

interface Props {
  content: string;
}

export function ThinkingBlock({ content }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderLeft: "2px solid var(--accent-purple)",
        marginBottom: 8,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none",
          border: "none",
          color: "var(--accent-purple)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", display: "inline-block" }}>
          {"\u25B6"}
        </span>
        Thinking
      </button>
      {expanded && (
        <div
          style={{
            padding: "8px 12px",
            color: "var(--text-secondary)",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write ToolCallBlock.tsx**

```tsx
// web/src/components/ToolCallBlock.tsx
import { useState } from "react";
import { ToolCall } from "../api/client";

interface Props {
  toolName: string;
  input: unknown;
  result?: ToolCall;
}

export function ToolCallBlock({ toolName, input, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    result?.status === "completed" ? "var(--accent-green)" :
    result?.status === "failed" ? "var(--accent-orange)" :
    "var(--accent-yellow)";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        marginBottom: 8,
        background: "var(--bg-primary)",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "none",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
        }}
      >
        <span style={{ transform: expanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", display: "inline-block", fontSize: 10 }}>
          {"\u25B6"}
        </span>
        <span style={{ color: "var(--accent-cyan)", fontWeight: 500 }}>
          {toolName}
        </span>
        <span style={{ color: statusColor, fontSize: 11, marginLeft: "auto" }}>
          {result?.status || "pending"}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>Input</div>
            <pre style={{ margin: 0, fontSize: 12 }}>
              {formatInput(toolName, input)}
            </pre>
          </div>
          {result?.output && (
            <div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>Output</div>
              <pre style={{ margin: 0, fontSize: 12, maxHeight: 300, overflowY: "auto" }}>
                {result.output.length > 2000 ? result.output.slice(0, 2000) + "\n... (truncated)" : result.output}
              </pre>
            </div>
          )}
          {result?.error && (
            <div>
              <div style={{ color: "var(--accent-orange)", fontSize: 11, marginBottom: 4 }}>Error</div>
              <pre style={{ margin: 0, fontSize: 12, color: "var(--accent-orange)" }}>
                {result.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return JSON.stringify(input, null, 2);
  const obj = input as Record<string, unknown>;

  // Show concise representation for common tools
  if (toolName === "Read" && obj.file_path) return String(obj.file_path);
  if (toolName === "Write" && obj.file_path) return String(obj.file_path);
  if (toolName === "Edit" && obj.file_path) return `${obj.file_path}\n---\n- ${String(obj.old_string || "").slice(0, 100)}\n+ ${String(obj.new_string || "").slice(0, 100)}`;
  if (toolName === "Bash" && obj.command) return String(obj.command);
  if (toolName === "Glob" && obj.pattern) return `${obj.pattern}${obj.path ? ` in ${obj.path}` : ""}`;
  if (toolName === "Grep" && obj.pattern) return `/${obj.pattern}/${obj.glob ? ` (${obj.glob})` : ""}`;

  return JSON.stringify(obj, null, 2);
}
```

- [ ] **Step 3: Write MessageBubble.tsx**

```tsx
// web/src/components/MessageBubble.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { ContentBlock, ToolCall } from "../api/client";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";

interface Props {
  role: string;
  content: string | null;
  contentBlocks: ContentBlock[];
  thinking: string | null;
  isMeta: boolean;
  toolCalls: Map<string, ToolCall>;
  metadata?: Record<string, unknown>;
}

export function MessageBubble({ role, content, contentBlocks, thinking, isMeta, toolCalls, metadata }: Props) {
  if (isMeta) return null;

  // System messages (compaction markers)
  if (role === "system") {
    return (
      <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: "var(--accent-yellow)", opacity: 0.3 }} />
        <span style={{ color: "var(--accent-yellow)", fontSize: 11 }}>
          {content || "context compacted"}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--accent-yellow)", opacity: 0.3 }} />
      </div>
    );
  }

  // Tool result messages (skip — shown inline with tool calls)
  const hasToolResult = contentBlocks.some((b) => b.type === "tool_result");
  if (hasToolResult) return null;

  const isUser = role === "user";
  const roleColor = isUser ? "var(--accent-green)" : "var(--accent-blue)";
  const roleLabel = isUser ? "You" : "Claude";

  return (
    <div style={{ padding: "12px 20px" }}>
      {/* Role indicator */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ color: roleColor, fontWeight: 600, fontSize: 13 }}>
          {isUser ? "\u276F" : "\u2726"} {roleLabel}
        </span>
      </div>

      {/* Thinking block */}
      {thinking && <ThinkingBlock content={thinking} />}

      {/* Content blocks */}
      {contentBlocks.map((block, i) => {
        if (block.type === "text" && block.text) {
          return (
            <div key={i} className="markdown-body" style={{ color: "var(--text-primary)" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {block.text}
              </ReactMarkdown>
            </div>
          );
        }

        if (block.type === "tool_use") {
          const result = toolCalls.get(block.id);
          return (
            <ToolCallBlock
              key={i}
              toolName={block.name}
              input={block.input}
              result={result}
            />
          );
        }

        return null;
      })}

      {/* Fallback for plain content without blocks */}
      {contentBlocks.length === 0 && content && (
        <div className="markdown-body" style={{ color: "var(--text-primary)" }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/MessageBubble.tsx web/src/components/ToolCallBlock.tsx web/src/components/ThinkingBlock.tsx
git commit -m "add message rendering components with markdown and tool calls"
```

---

### Task 13: Conversation View + App Assembly

**Files:**
- Create: `web/src/components/ConversationView.tsx`
- Create: `web/src/App.tsx`

- [ ] **Step 1: Write ConversationView.tsx**

```tsx
// web/src/components/ConversationView.tsx
import { useEffect, useRef } from "react";
import { Message, ToolCall } from "../api/client";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: Message[];
  toolCalls: ToolCall[];
  sessionTitle: string | null;
  isLoading: boolean;
}

export function ConversationView({ messages, toolCalls, sessionTitle, isLoading }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build tool call lookup map
  const toolMap = new Map<string, ToolCall>();
  for (const tc of toolCalls) {
    toolMap.set(tc.toolUseId, tc);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <span style={{ fontWeight: 600 }}>
          {sessionTitle || "Session"}
        </span>
        <span style={{ color: "var(--text-muted)", marginLeft: 12, fontSize: 12 }}>
          {messages.filter((m) => !m.isMeta).length} messages
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-primary)" }}>
        {messages.map((msg) => (
          <MessageBubble
            key={msg.uuid}
            role={msg.role}
            content={msg.content}
            contentBlocks={msg.contentBlocks}
            thinking={msg.thinking}
            isMeta={msg.isMeta}
            toolCalls={toolMap}
            metadata={msg.metadata}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write App.tsx**

```tsx
// web/src/App.tsx
import { useState, useEffect, useCallback } from "react";
import { SessionSidebar } from "./components/SessionSidebar";
import { ConversationView } from "./components/ConversationView";
import { useSSE } from "./hooks/useSSE";
import * as api from "./api/client";

export function App() {
  const [sessions, setSessions] = useState<api.Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<api.Message[]>([]);
  const [toolCalls, setToolCalls] = useState<api.ToolCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    api.listSessions().then(setSessions).catch(console.error);
  }, []);

  // Load conversation when session selected
  useEffect(() => {
    if (!selectedId) return;
    setIsLoading(true);
    Promise.all([api.getMessages(selectedId), api.getToolCalls(selectedId)])
      .then(([msgs, tools]) => {
        setMessages(msgs);
        setToolCalls(tools);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [selectedId]);

  // SSE for real-time updates
  const refreshSessions = useCallback(() => {
    api.listSessions().then(setSessions).catch(console.error);
  }, []);

  const refreshMessages = useCallback(
    (data: { sessionId: string }) => {
      if (data.sessionId === selectedId) {
        api.getMessages(data.sessionId).then(setMessages).catch(console.error);
      }
    },
    [selectedId]
  );

  const refreshTools = useCallback(
    (data: { sessionId: string }) => {
      if (data.sessionId === selectedId) {
        api.getToolCalls(data.sessionId).then(setToolCalls).catch(console.error);
      }
    },
    [selectedId]
  );

  const { isConnected } = useSSE({
    sessionId: selectedId,
    onSessionNew: refreshSessions,
    onSessionUpdate: refreshSessions,
    onMessageNew: refreshMessages,
    onToolUpdate: refreshTools,
  });

  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <SessionSidebar sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />

      {selectedId ? (
        <ConversationView
          messages={messages}
          toolCalls={toolCalls}
          sessionTitle={selectedSession?.title || null}
          isLoading={isLoading}
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 32 }}>{"\u2726"}</span>
          <span>Select a session to view</span>
          {!isConnected && (
            <span style={{ color: "var(--accent-orange)", fontSize: 12 }}>SSE disconnected</span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build frontend**

```bash
cd web && npx vite build && cd ..
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/ConversationView.tsx web/src/App.tsx
git commit -m "add conversation view and main app with SSE-driven updates"
```

---

### Task 14: End-to-End Testing with Real Claude Code

**Files:**
- Create: `tests/e2e/full-flow.test.ts`

- [ ] **Step 1: Write the E2E test**

```typescript
// tests/e2e/full-flow.test.ts
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { IngestPipeline } from "../../src/ingest/ingest-pipeline";
import { ConversationStore } from "../../src/store/conversation-store";
import { createApp } from "../../src/server/app";
import { SSEManager } from "../../src/server/sse";
import { getDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import { mkdirSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const store = new ConversationStore();
const sse = new SSEManager();
let testDir: string;

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  const sql = getDb();
  await sql`TRUNCATE raw_events, tool_calls, messages, sessions CASCADE`;
  testDir = join(tmpdir(), "cpg-e2e-" + Date.now());
  mkdirSync(testDir, { recursive: true });
});

afterAll(async () => {
  await closeDb();
});

describe("E2E: Full Flow", () => {
  test("ingests a multi-turn conversation and serves via API", async () => {
    const pipeline = new IngestPipeline(store, testDir);
    pipeline.on("session:new", (id) => sse.broadcast("session:new", { sessionId: id }));
    pipeline.on("message:new", (sid, uuid, role) =>
      sse.broadcast("message:new", { sessionId: sid, uuid, role }, sid)
    );

    const sessionId = "e2e-session-1";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    // Simulate a multi-turn conversation
    const conversation = [
      {
        type: "user", uuid: "u1", parentUuid: null, sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:00Z", cwd: "/tmp/project",
        message: { role: "user", content: [{ type: "text", text: "Show me the contents of package.json" }] },
      },
      {
        type: "assistant", uuid: "a1", parentUuid: "u1", sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:01Z",
        message: {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "The user wants to see package.json. I'll use the Read tool." },
            { type: "text", text: "Let me read that file for you." },
            { type: "tool_use", id: "tu-read-1", name: "Read", input: { file_path: "/tmp/project/package.json" } },
          ],
        },
      },
      {
        type: "user", uuid: "u2", parentUuid: "a1", sessionId,
        isSidechain: false, toolUseResult: true, timestamp: "2026-05-01T10:00:02Z",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tu-read-1", content: '{"name": "my-project", "version": "1.0.0"}' }],
        },
      },
      {
        type: "assistant", uuid: "a2", parentUuid: "u2", sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:03Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Here's your `package.json`:\n\n```json\n{\"name\": \"my-project\", \"version\": \"1.0.0\"}\n```\n\nIt's a minimal package with just a name and version." }],
        },
      },
    ];

    writeFileSync(jsonlPath, conversation.map((e) => JSON.stringify(e)).join("\n") + "\n");

    pipeline.start();
    await new Promise((r) => setTimeout(r, 1000));
    await pipeline.stop();

    // Verify session
    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe(sessionId);
    expect(sessions[0].title).toBe("Show me the contents of package.json");

    // Verify messages
    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(4);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].thinking).toBe("The user wants to see package.json. I'll use the Read tool.");
    expect(messages[2].role).toBe("user"); // tool result
    expect(messages[3].role).toBe("assistant");

    // Verify tool calls
    const tools = await store.getToolCalls(sessionId);
    expect(tools.length).toBe(1);
    expect(tools[0].toolName).toBe("Read");
    expect(tools[0].status).toBe("completed");
    expect(tools[0].output).toContain("my-project");

    // Verify REST API
    const app = createApp(store, sse);
    const server = Bun.serve({ port: 0, fetch: app.fetch });
    const baseUrl = `http://localhost:${server.port}`;

    const sessRes = await fetch(`${baseUrl}/api/sessions`);
    const sessData = await sessRes.json();
    expect(sessData.length).toBe(1);

    const msgRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages`);
    const msgData = await msgRes.json();
    expect(msgData.length).toBe(4);

    const toolRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/tools`);
    const toolData = await toolRes.json();
    expect(toolData.length).toBe(1);

    server.stop();
  });

  test("handles incremental file appends (simulates live session)", async () => {
    const pipeline = new IngestPipeline(store, testDir);
    const sessionId = "live-session";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    // Write first message
    writeFileSync(
      jsonlPath,
      JSON.stringify({
        type: "user", uuid: "u1", parentUuid: null, sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:00Z", cwd: "/tmp",
        message: { role: "user", content: [{ type: "text", text: "Hello" }] },
      }) + "\n"
    );

    pipeline.start();
    await new Promise((r) => setTimeout(r, 600));

    let messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(1);

    // Append second message (simulates live write)
    appendFileSync(
      jsonlPath,
      JSON.stringify({
        type: "assistant", uuid: "a1", parentUuid: "u1", sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:01Z",
        message: { role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
      }) + "\n"
    );

    await new Promise((r) => setTimeout(r, 600));

    messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(2);
    expect(messages[1].content).toBe("Hi there!");

    await pipeline.stop();
  });

  test("deduplication prevents double-inserts on file re-read", async () => {
    const pipeline = new IngestPipeline(store, testDir);
    const sessionId = "dedup-session";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    const msg = JSON.stringify({
      type: "user", uuid: "dedup-u1", parentUuid: null, sessionId,
      isSidechain: false, timestamp: "2026-05-01T10:00:00Z", cwd: "/tmp",
      message: { role: "user", content: [{ type: "text", text: "Unique message" }] },
    });

    writeFileSync(jsonlPath, msg + "\n");

    pipeline.start();
    await new Promise((r) => setTimeout(r, 600));
    await pipeline.stop();

    // Start a second pipeline (simulates restart)
    const pipeline2 = new IngestPipeline(store, testDir);
    pipeline2.start();
    await new Promise((r) => setTimeout(r, 600));
    await pipeline2.stop();

    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
bun test tests/e2e/full-flow.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/
git commit -m "add end-to-end tests for ingest pipeline and REST API"
```

---

### Task 15: Database Integrity Tests

**Files:**
- Modify: `tests/db/conversation-store.test.ts`

- [ ] **Step 1: Add ACID and integrity tests to the existing test file**

Append to `tests/db/conversation-store.test.ts`:

```typescript
describe("Database Integrity", () => {
  test("foreign key constraint prevents orphan messages", async () => {
    let threw = false;
    try {
      await store.insertMessage({
        sessionId: "nonexistent-session",
        uuid: "orphan-msg",
        parentUuid: null,
        role: "user",
        content: "This should fail",
        contentBlocks: [],
        thinking: null,
        isSidechain: false,
        isMeta: false,
        sequenceNum: 0,
        timestamp: new Date(),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("cascade delete removes messages when session deleted", async () => {
    const sql = getDb();
    await store.upsertSession({
      id: "cascade-test",
      projectPath: "/tmp",
      startedAt: new Date(),
      status: "active",
    });

    await store.insertMessage({
      sessionId: "cascade-test",
      uuid: "cascade-msg-1",
      parentUuid: null,
      role: "user",
      content: "test",
      contentBlocks: [],
      thinking: null,
      isSidechain: false,
      isMeta: false,
      sequenceNum: 0,
      timestamp: new Date(),
    });

    await sql`DELETE FROM sessions WHERE id = 'cascade-test'`;
    const messages = await store.getMessages("cascade-test");
    expect(messages.length).toBe(0);
  });

  test("concurrent message inserts maintain sequence integrity", async () => {
    await store.upsertSession({
      id: "concurrent-test",
      projectPath: "/tmp",
      startedAt: new Date(),
      status: "active",
    });

    // Insert 20 messages concurrently
    const inserts = Array.from({ length: 20 }, (_, i) =>
      store.insertMessage({
        sessionId: "concurrent-test",
        uuid: `concurrent-msg-${i}`,
        parentUuid: null,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`,
        contentBlocks: [{ type: "text", text: `Message ${i}` }],
        thinking: null,
        isSidechain: false,
        isMeta: false,
        sequenceNum: i,
        timestamp: new Date(),
      })
    );

    await Promise.all(inserts);

    const messages = await store.getMessages("concurrent-test");
    expect(messages.length).toBe(20);

    // Verify ordering
    for (let i = 0; i < messages.length; i++) {
      expect(messages[i].sequenceNum).toBe(i);
    }
  });

  test("unique constraint on (session_id, uuid) is enforced", async () => {
    const sql = getDb();
    await store.upsertSession({
      id: "unique-test",
      projectPath: "/tmp",
      startedAt: new Date(),
      status: "active",
    });

    await store.insertMessage({
      sessionId: "unique-test",
      uuid: "unique-msg",
      parentUuid: null,
      role: "user",
      content: "first",
      contentBlocks: [],
      thinking: null,
      isSidechain: false,
      isMeta: false,
      sequenceNum: 0,
      timestamp: new Date(),
    });

    // Second insert with same uuid should be silently ignored (ON CONFLICT DO NOTHING)
    await store.insertMessage({
      sessionId: "unique-test",
      uuid: "unique-msg",
      parentUuid: null,
      role: "user",
      content: "duplicate",
      contentBlocks: [],
      thinking: null,
      isSidechain: false,
      isMeta: false,
      sequenceNum: 1,
      timestamp: new Date(),
    });

    const messages = await store.getMessages("unique-test");
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("first"); // original preserved
  });
});
```

- [ ] **Step 2: Run all database tests**

```bash
bun test tests/db/conversation-store.test.ts
```

Expected: All tests PASS (original 8 + new 4 = 12 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/db/conversation-store.test.ts
git commit -m "add database integrity tests for FK, cascade, concurrency"
```

---

### Task 16: Live Test with Real Claude Code Session

- [ ] **Step 1: Start the plugin**

```bash
bun run src/index.ts import
```

Expected: Imports existing session files from `~/.claude/projects/`. Reports count.

- [ ] **Step 2: Start the full service**

```bash
bun run src/index.ts start
```

Expected: "Dashboard: http://localhost:3456" and "Watching: /Users/songli/.claude/projects"

- [ ] **Step 3: Open dashboard in browser**

Open `http://localhost:3456` — verify:
- Sessions appear in sidebar
- Clicking a session loads the conversation
- Messages render with markdown, code blocks, tool calls
- Thinking blocks are collapsible
- Tool calls are expandable with input/output

- [ ] **Step 4: Test with a live claude-code session**

In a separate terminal:
```bash
cd /tmp/cpg-live-test && mkdir -p /tmp/cpg-live-test && cd /tmp/cpg-live-test
claude -p "write a hello world python script"
```

Then check the dashboard — the new session should appear in real-time via SSE.

- [ ] **Step 5: Verify database contents**

```bash
psql claude_sessions -c "SELECT id, title, status, started_at FROM sessions ORDER BY started_at DESC LIMIT 5;"
psql claude_sessions -c "SELECT COUNT(*) as msg_count FROM messages;"
psql claude_sessions -c "SELECT tool_name, status, COUNT(*) FROM tool_calls GROUP BY tool_name, status;"
```

- [ ] **Step 6: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix issues discovered during live testing"
```

---

### Task 17: GUI Polish

- [ ] **Step 1: Test sidebar scrolling with many sessions**

Import all existing sessions, verify the sidebar scrolls properly and session titles are readable.

- [ ] **Step 2: Test long conversations**

Select a session with many messages. Verify:
- Smooth scrolling
- Auto-scroll to bottom on new messages
- Markdown renders correctly (headers, lists, code blocks, tables)
- Large tool outputs are truncated with "... (truncated)"

- [ ] **Step 3: Test dark theme consistency**

Verify all text is readable against the dark background. No white flashes. Scrollbars are styled.

- [ ] **Step 4: Build production frontend and verify**

```bash
cd web && npx vite build && cd ..
bun run src/index.ts web
```

Open `http://localhost:3456` — verify the production build looks identical to dev mode.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "polish web dashboard and finalize production build"
```
