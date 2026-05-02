import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { IngestPipeline } from "../../src/ingest/ingest-pipeline";
import { ConversationStore } from "../../src/store/conversation-store";
import { getDb, closeDb } from "../../src/db/connection";
import { runMigrations } from "../../src/db/migrate";
import { mkdirSync, writeFileSync, appendFileSync } from "fs";
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

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 800));
    await pipeline.stop();

    const sessions = await store.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.id).toBe(sessionId);

    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(1);
    expect(messages[0]!.role).toBe("user");
    expect(messages[0]!.content).toBe("What is 2+2?");
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

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 800));
    await pipeline.stop();

    const messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(3);

    const tools = await store.getToolCalls(sessionId);
    expect(tools.length).toBe(1);
    expect(tools[0]!.toolName).toBe("Read");
    expect(tools[0]!.status).toBe("completed");
    expect(tools[0]!.output).toBe("hello world");
  });

  test("handles incremental file appends (live session)", async () => {
    const pipeline = new IngestPipeline(store, testDir);
    const sessionId = "live-session";
    const jsonlPath = join(testDir, `${sessionId}.jsonl`);

    writeFileSync(
      jsonlPath,
      JSON.stringify({
        type: "user", uuid: "u1", parentUuid: null, sessionId,
        isSidechain: false, timestamp: "2026-05-01T10:00:00Z", cwd: "/tmp",
        message: { role: "user", content: [{ type: "text", text: "Hello" }] },
      }) + "\n"
    );

    await pipeline.start();
    await new Promise((r) => setTimeout(r, 600));

    let messages = await store.getMessages(sessionId);
    expect(messages.length).toBe(1);

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
    expect(messages[1]!.content).toBe("Hi there!");

    await pipeline.stop();
  });
});
