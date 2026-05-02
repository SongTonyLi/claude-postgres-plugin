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
    expect(sessions[0]!.id).toBe("test-session-1");
    expect(sessions[0]!.title).toBe("Test session");
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
    expect(sessions[0]!.title).toBe("Updated");
    expect(sessions[0]!.status).toBe("completed");
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
    expect(messages[0]!.content).toBe("Hello world");
    expect(messages[0]!.role).toBe("user");
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
    await store.insertMessage(msg);

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

    await store.completeToolCall("tool-1", "file contents here", null, "result-msg-1");

    const tools = await store.getToolCalls("sess-1");
    expect(tools.length).toBe(1);
    expect(tools[0]!.status).toBe("completed");
    expect(tools[0]!.output).toBe("file contents here");
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
    expect(rows[0]!.event_type).toBe("user");
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
    expect(sessions[0]!.id).toBe("new");
    expect(sessions[1]!.id).toBe("old");
  });
});

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

    for (let i = 0; i < messages.length; i++) {
      expect(messages[i]!.sequenceNum).toBe(i);
    }
  });

  test("unique constraint on (session_id, uuid) is enforced", async () => {
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
    expect(messages[0]!.content).toBe("first");
  });
});
