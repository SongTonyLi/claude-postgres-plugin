#!/usr/bin/env bun
import { ConversationStore, type MessageRecord, type SessionRecord, type ToolCallRecord } from "./store/conversation-store";
import { closeDb } from "./db/connection";

const log = (...args: unknown[]) => console.error("[cpg-mcp]", ...args);

const store = new ConversationStore();

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: any;
}

const send = (msg: object) => {
  process.stdout.write(JSON.stringify(msg) + "\n");
};

const reply = (id: unknown, result: unknown) => send({ jsonrpc: "2.0", id, result });
const sendError = (id: unknown, code: number, message: string) =>
  send({ jsonrpc: "2.0", id, error: { code, message } });

const TOOLS = [
  {
    name: "list_recent_sessions",
    description:
      "List the user's most recent Claude Code sessions, newest first. Returns session id, title, project path, start time, and message/tool counts. Use this to get an overview before drilling in.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum number of sessions to return (default 20, max 200)" },
        project_path: { type: "string", description: "Optional substring filter on project path" },
      },
    },
  },
  {
    name: "search_messages",
    description:
      "Full-text fuzzy search across all stored Claude Code conversation messages. Returns matching messages with session context. Use for questions like 'what did I try for the auth bug?' or 'find sessions where I worked on Vite config'.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search phrase. Two or more characters." },
        limit: { type: "number", description: "Max results (default 20, max 100)" },
        mode: { type: "string", enum: ["fuzzy", "regex"], description: "Search mode (default fuzzy)" },
      },
    },
  },
  {
    name: "get_session",
    description: "Fetch metadata for a single session by id (title, project path, model, status, timestamps).",
    inputSchema: {
      type: "object",
      required: ["session_id"],
      properties: {
        session_id: { type: "string", description: "Session UUID" },
      },
    },
  },
  {
    name: "get_session_messages",
    description:
      "Fetch the message transcript for a session in order. Image and document blocks are stripped to keep the response compact; large message bodies are truncated.",
    inputSchema: {
      type: "object",
      required: ["session_id"],
      properties: {
        session_id: { type: "string", description: "Session UUID" },
        limit: { type: "number", description: "Max messages to return (default 50, max 500)" },
        offset: { type: "number", description: "Number of messages to skip from the start (default 0)" },
      },
    },
  },
  {
    name: "get_session_tool_calls",
    description: "List all tool calls made during a session with their inputs, outputs, and status.",
    inputSchema: {
      type: "object",
      required: ["session_id"],
      properties: {
        session_id: { type: "string", description: "Session UUID" },
      },
    },
  },
];

const MAX_CONTENT_CHARS = 2000;
const MAX_THINKING_CHARS = 800;

const summarizeBlocks = (blocks: unknown): { tool_uses: string[]; has_image: boolean; has_document: boolean } => {
  const arr = Array.isArray(blocks) ? blocks : [];
  const tool_uses: string[] = [];
  let has_image = false;
  let has_document = false;
  for (const b of arr as any[]) {
    if (b?.type === "tool_use" && typeof b.name === "string") tool_uses.push(b.name);
    if (b?.type === "image") has_image = true;
    if (b?.type === "document") has_document = true;
  }
  return { tool_uses, has_image, has_document };
};

const compactSession = (s: SessionRecord & { messageCount?: number; toolCount?: number }) => ({
  id: s.id,
  title: s.title || null,
  project_path: s.projectPath,
  cwd: s.cwd ?? null,
  model: s.model ?? null,
  status: s.status,
  started_at: s.startedAt,
  ended_at: s.endedAt ?? null,
  message_count: s.messageCount ?? null,
  tool_count: s.toolCount ?? null,
});

const compactMessage = (m: MessageRecord) => {
  const summary = summarizeBlocks(m.contentBlocks);
  return {
    uuid: m.uuid,
    parent_uuid: m.parentUuid,
    role: m.role,
    sequence: m.sequenceNum,
    timestamp: m.timestamp,
    is_sidechain: m.isSidechain,
    content:
      m.content && m.content.length > MAX_CONTENT_CHARS
        ? m.content.slice(0, MAX_CONTENT_CHARS) + `… [truncated, ${m.content.length} chars total]`
        : m.content,
    thinking:
      m.thinking && m.thinking.length > MAX_THINKING_CHARS
        ? m.thinking.slice(0, MAX_THINKING_CHARS) + `… [truncated, ${m.thinking.length} chars total]`
        : m.thinking,
    tool_uses: summary.tool_uses,
    has_image: summary.has_image,
    has_document: summary.has_document,
  };
};

const compactToolCall = (t: ToolCallRecord) => ({
  tool_use_id: t.toolUseId,
  message_uuid: t.messageUuid,
  result_uuid: t.resultUuid ?? null,
  tool_name: t.toolName,
  status: t.status,
  input: t.input,
  output:
    t.output && t.output.length > MAX_CONTENT_CHARS
      ? t.output.slice(0, MAX_CONTENT_CHARS) + `… [truncated, ${t.output.length} chars total]`
      : t.output,
  error: t.error ?? null,
});

const asTextResult = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

async function handleToolCall(name: string, args: any) {
  switch (name) {
    case "list_recent_sessions": {
      const limit = Math.min(Math.max(Number(args?.limit ?? 20), 1), 200);
      const filter = typeof args?.project_path === "string" ? args.project_path : null;
      const sessions = await store.listSessions();
      const filtered = filter
        ? sessions.filter((s) => s.projectPath.toLowerCase().includes(filter.toLowerCase()))
        : sessions;
      return asTextResult({
        count: Math.min(filtered.length, limit),
        total_matching: filtered.length,
        sessions: filtered.slice(0, limit).map(compactSession),
      });
    }

    case "search_messages": {
      const query = String(args?.query ?? "").trim();
      if (query.length < 2) throw new Error("query must be at least 2 characters");
      const limit = Math.min(Math.max(Number(args?.limit ?? 20), 1), 100);
      const mode = args?.mode === "regex" ? "regex" : "fuzzy";
      const results = await store.searchMessages(query, limit, mode);
      return asTextResult({
        query,
        mode,
        count: results.length,
        results: results.map((m) => ({
          session_id: m.sessionId,
          session_title: m.sessionTitle ?? null,
          ...compactMessage(m),
        })),
      });
    }

    case "get_session": {
      const id = String(args?.session_id ?? "");
      if (!id) throw new Error("session_id is required");
      const s = await store.getSession(id);
      if (!s) return asTextResult({ found: false, session_id: id });
      return asTextResult({ found: true, session: compactSession(s) });
    }

    case "get_session_messages": {
      const id = String(args?.session_id ?? "");
      if (!id) throw new Error("session_id is required");
      const limit = Math.min(Math.max(Number(args?.limit ?? 50), 1), 500);
      const offset = Math.max(Number(args?.offset ?? 0), 0);
      const all = await store.getMessages(id);
      const slice = all.slice(offset, offset + limit);
      return asTextResult({
        session_id: id,
        total_messages: all.length,
        offset,
        returned: slice.length,
        messages: slice.map(compactMessage),
      });
    }

    case "get_session_tool_calls": {
      const id = String(args?.session_id ?? "");
      if (!id) throw new Error("session_id is required");
      const tools = await store.getToolCalls(id);
      return asTextResult({
        session_id: id,
        count: tools.length,
        tool_calls: tools.map(compactToolCall),
      });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function dispatch(req: JsonRpcRequest): Promise<void> {
  const { id, method, params } = req;

  if (method === "initialize") {
    reply(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "claude-postgres", version: "0.1.0" },
    });
    return;
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return;
  }

  if (method === "ping") {
    reply(id, {});
    return;
  }

  if (method === "tools/list") {
    reply(id, { tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    try {
      const result = await handleToolCall(params?.name, params?.arguments);
      reply(id, result);
    } catch (e: any) {
      reply(id, {
        content: [{ type: "text", text: `Error: ${e?.message ?? String(e)}` }],
        isError: true,
      });
    }
    return;
  }

  if (method === "prompts/list") {
    reply(id, { prompts: [] });
    return;
  }
  if (method === "resources/list") {
    reply(id, { resources: [] });
    return;
  }

  if (id != null) sendError(id, -32601, `Method not found: ${method}`);
}

async function main() {
  log(`started, db = ${process.env.DATABASE_URL || "postgres://localhost:5432/claude_sessions"}`);

  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", async (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line);
      } catch (e: any) {
        log("parse error:", e.message);
        continue;
      }
      try {
        await dispatch(req);
      } catch (e: any) {
        log("dispatch error:", e.message);
        if (req.id != null) sendError(req.id, -32603, e.message ?? "internal error");
      }
    }
  });

  process.stdin.on("end", async () => {
    log("stdin closed, shutting down");
    await closeDb().catch(() => {});
    process.exit(0);
  });

  const shutdown = async () => {
    await closeDb().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  log("fatal:", e);
  process.exit(1);
});
