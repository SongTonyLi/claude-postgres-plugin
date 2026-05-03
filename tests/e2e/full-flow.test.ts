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
  const db = getDb();
  db.exec(
    "DELETE FROM raw_events; DELETE FROM tool_calls; DELETE FROM messages; DELETE FROM sessions;"
  );
  testDir = join(tmpdir(), "csp-e2e-" + Date.now());
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
            { type: "thinking", thinking: "The user wants to see package.json." },
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
          content: [{ type: "tool_result", tool_use_id: "tu-read-1", content: '{"name": "my-project"}' }],
        },
      },
      {
        type: "assistant", uuid: "a2", parentUuid: "u2", sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:03Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Here's your `package.json`:\n\n```json\n{\"name\": \"my-project\"}\n```" }],
        },
      },
    ];

    writeFileSync(jsonlPath, conversation.map((e) => JSON.stringify(e)).join("\n") + "\n");

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 1200));
    await pipeline.stop();

    // Verify session
    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.id).toBe(sessionId);
    expect(sessions[0]!.title).toBe("Show me the contents of package.json");

    // Verify messages
    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(4);
    expect(messages[0]!.role).toBe("user");
    expect(messages[1]!.role).toBe("assistant");
    expect(messages[1]!.thinking).toBe("The user wants to see package.json.");

    // Verify tool calls
    const tools = await store.getToolCalls(sessionId);
    expect(tools.length).toBe(1);
    expect(tools[0]!.toolName).toBe("Read");
    expect(tools[0]!.status).toBe("completed");
    expect(tools[0]!.output).toContain("my-project");

    // Verify REST API
    const app = createApp(store, sse);
    const server = Bun.serve({ port: 0, fetch: app.fetch });
    const baseUrl = `http://localhost:${server.port}`;

    const sessRes = await fetch(`${baseUrl}/api/sessions`);
    expect(sessRes.status).toBe(200);
    const sessData = await sessRes.json() as any[];
    expect(sessData.length).toBe(1);

    const msgRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/messages`);
    expect(msgRes.status).toBe(200);
    const msgData = await msgRes.json() as any[];
    expect(msgData.length).toBe(4);

    const toolRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/tools`);
    expect(toolRes.status).toBe(200);
    const toolData = await toolRes.json() as any[];
    expect(toolData.length).toBe(1);
    expect(toolData[0].status).toBe("completed");

    server.stop();
  });

  test("deduplication prevents double-inserts on restart", async () => {
    const sessionId = "dedup-session";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    const msg = JSON.stringify({
      type: "user", uuid: "dedup-u1", parentUuid: null, sessionId,
      isSidechain: false, timestamp: "2026-05-01T10:00:00Z", cwd: "/tmp",
      message: { role: "user", content: [{ type: "text", text: "Unique message" }] },
    });

    writeFileSync(jsonlPath, msg + "\n");

    const pipeline1 = new IngestPipeline(store, testDir);
    pipeline1.start();
    await new Promise((r) => setTimeout(r, 800));
    await pipeline1.stop();

    // Restart — same file should not duplicate
    const pipeline2 = new IngestPipeline(store, testDir);
    pipeline2.start();
    await new Promise((r) => setTimeout(r, 800));
    await pipeline2.stop();

    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(1);
  });

  test("handles system compaction events", async () => {
    const sessionId = "compact-session";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    const lines = [
      JSON.stringify({
        type: "user", uuid: "u1", parentUuid: null, sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:00Z", cwd: "/tmp",
        message: { role: "user", content: [{ type: "text", text: "Hello" }] },
      }),
      JSON.stringify({
        type: "system", uuid: "sys-1", parentUuid: null, sessionId,
        subtype: "compact", durationMs: 2500, messageCount: 30,
        isSidechain: false, isMeta: true,
        timestamp: "2026-05-01T10:05:00Z",
      }),
      JSON.stringify({
        type: "user", uuid: "u2", parentUuid: null, sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:05:01Z", cwd: "/tmp",
        message: { role: "user", content: [{ type: "text", text: "After compaction" }] },
      }),
    ];

    writeFileSync(jsonlPath, lines.join("\n") + "\n");

    const pipeline = new IngestPipeline(store, testDir);
    await pipeline.start();
    await new Promise((r) => setTimeout(r, 800));
    await pipeline.stop();

    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(3);

    const systemMsg = messages.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.content).toContain("30 messages");
    expect(systemMsg!.content).toContain("2500ms");
  });
});
