import { describe, test, expect } from "bun:test";
import {
  parseSessionLine,
  extractTextContent,
  extractThinking,
  extractToolUses,
  extractToolResults,
} from "../../src/parser/session-parser";

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
    const tools = extractToolUses((event!.data.message as any).content);
    expect(tools.length).toBe(1);
    expect(tools[0]!.name).toBe("Read");
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
    const thinking = extractThinking((event!.data.message as any).content);
    expect(thinking).toBe("Let me think about this...");
    const text = extractTextContent((event!.data.message as any).content);
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
    const results = extractToolResults((event!.data.message as any).content);
    expect(results.length).toBe(1);
    expect(results[0]!.toolUseId).toBe("tool-1");
    expect(results[0]!.output).toBe("file contents");
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
    expect((event!.data as any).subtype).toBe("compact");
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
