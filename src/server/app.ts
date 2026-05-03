import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import type { ConversationStore } from "../store/conversation-store";
import type { SSEManager } from "./sse";

// Resolve the web/dist directory across three runtime modes:
//   1. Explicit CPG_WEB_DIST env var (overrides everything)
//   2. Compiled binary at bin/cpg with web/dist as a sibling of bin/
//   3. Dev mode: running via `bun run`, web/dist is two levels up from this file
function resolveWebDist(): string {
  const explicit = process.env.CPG_WEB_DIST;
  if (explicit) return explicit;

  const binDir = dirname(process.execPath);
  const candidates = [
    join(binDir, "..", "web", "dist"), // bin/cpg + web/dist as sibling of bin/
    join(binDir, "web", "dist"),       // bin/ contains web/dist directly
  ];
  for (const c of candidates) if (existsSync(c)) return c;

  // Dev fallback: this file's location is meaningful (not inside a compiled binary).
  const sourceRelative = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  return sourceRelative;
}

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
    // Strip base64 data from image/document blocks for performance
    for (const m of messages) {
      if (Array.isArray(m.contentBlocks)) {
        m.contentBlocks = m.contentBlocks.map((b: any) => {
          if ((b.type === "image" || b.type === "document") && b.source?.data) {
            return { ...b, source: { ...b.source, data: "__stripped__" } };
          }
          return b;
        });
      }
    }
    return c.json(messages);
  });

  // Serve image/document attachment from a message's content blocks
  app.get("/api/sessions/:sessionId/messages/:uuid/attachment/:index", async (c) => {
    const sessionId = c.req.param("sessionId");
    const uuid = c.req.param("uuid");
    const idx = parseInt(c.req.param("index"));
    const result = await store.getMessageAttachment(sessionId, uuid, idx);
    if (!result) return c.json({ error: "Not found" }, 404);
    const binary = Buffer.from(result.data, "base64");
    return new Response(binary, {
      headers: {
        "Content-Type": result.mediaType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  });

  app.get("/api/sessions/:id/tools", async (c) => {
    const tools = await store.getToolCalls(c.req.param("id"));
    return c.json(tools);
  });

  app.get("/api/search", async (c) => {
    const q = c.req.query("q");
    const mode = c.req.query("mode") || "fuzzy";
    if (!q || q.length < 2) return c.json([]);
    const results = await store.searchMessages(q, 50, mode);
    return c.json(results);
  });

  // Hide/unhide session
  app.post("/api/sessions/:id/hide", async (c) => {
    await store.setSessionHidden(c.req.param("id"), true);
    return c.json({ ok: true });
  });

  app.post("/api/sessions/:id/unhide", async (c) => {
    await store.setSessionHidden(c.req.param("id"), false);
    return c.json({ ok: true });
  });

  // XML export of selected messages
  app.post("/api/sessions/:id/export-xml", async (c) => {
    const sessionId = c.req.param("id");
    const session = await store.getSession(sessionId);
    if (!session) return c.json({ error: "Not found" }, 404);

    const body = await c.req.json<{ uuids: string[] }>();
    const allMessages = await store.getMessages(sessionId);
    const allTools = await store.getToolCalls(sessionId);
    const toolMap = new Map(allTools.map((t) => [t.toolUseId, t]));

    const selected = body.uuids && body.uuids.length > 0
      ? allMessages.filter((m) => body.uuids.includes(m.uuid))
      : allMessages.filter((m) => !m.isMeta);

    const escXml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<conversation sessionId="${escXml(sessionId)}" title="${escXml(session.title || "")}" exportedAt="${new Date().toISOString()}">\n`;

    for (const msg of selected) {
      const blocks = Array.isArray(msg.contentBlocks) ? msg.contentBlocks : [];
      xml += `  <message role="${escXml(msg.role)}" uuid="${escXml(msg.uuid)}" timestamp="${msg.timestamp}">\n`;

      if (msg.content) {
        xml += `    <content>${escXml(msg.content)}</content>\n`;
      }
      if (msg.thinking) {
        xml += `    <thinking>${escXml(msg.thinking)}</thinking>\n`;
      }

      for (const block of blocks) {
        const b = block as any;
        if (b.type === "tool_use") {
          const result = toolMap.get(b.id);
          xml += `    <toolUse name="${escXml(b.name)}" id="${escXml(b.id)}" status="${escXml(result?.status || "pending")}">\n`;
          xml += `      <input>${escXml(JSON.stringify(b.input))}</input>\n`;
          if (result?.output) xml += `      <output>${escXml(result.output)}</output>\n`;
          if (result?.error) xml += `      <error>${escXml(result.error)}</error>\n`;
          xml += `    </toolUse>\n`;
        }
        if (b.type === "tool_result") {
          const content = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
          xml += `    <toolResult toolUseId="${escXml(b.tool_use_id)}">${escXml(content)}</toolResult>\n`;
        }
      }

      xml += `  </message>\n`;
    }
    xml += `</conversation>\n`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="session-${sessionId.slice(0, 8)}.xml"`,
      },
    });
  });

  // SSE endpoint
  app.get("/api/events/sse", (c) => {
    const sessionId = c.req.query("sessionId") || null;
    const clientId = crypto.randomUUID();

    const stream = new ReadableStream({
      start(controller) {
        sse.addClient(clientId, controller, sessionId);

        const keepalive = setInterval(() => {
          try {
            const ping = new TextEncoder().encode(": keepalive\n\n");
            controller.enqueue(ping);
          } catch {
            clearInterval(keepalive);
          }
        }, 15000);

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

  // Static files for web dashboard
  const staticRoot = resolveWebDist();
  app.use("/*", serveStatic({ root: staticRoot }));
  app.get("*", serveStatic({ path: join(staticRoot, "index.html") }));

  return app;
}
