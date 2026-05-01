import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { ConversationStore } from "../store/conversation-store";
import type { SSEManager } from "./sse";

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
  const staticRoot = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  app.use("/*", serveStatic({ root: staticRoot }));
  app.get("*", serveStatic({ path: join(staticRoot, "index.html") }));

  return app;
}
