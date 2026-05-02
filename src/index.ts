import { runMigrations } from "./db/migrate";
import { ConversationStore } from "./store/conversation-store";
import { IngestPipeline } from "./ingest/ingest-pipeline";
import { SSEManager } from "./server/sse";
import { createApp } from "./server/app";
import { closeDb } from "./db/connection";

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
  await pipeline.start();

  // Start web server
  const app = createApp(store, sse);
  Bun.serve({ port: PORT, fetch: app.fetch });
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Watching: ${pipeline.watcher.getWatchPath()}`);
  console.log("Press Ctrl+C to stop");

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await pipeline.stop();
    await closeDb();
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

  const pipeline = new IngestPipeline(store);
  let eventCount = 0;
  pipeline.on("message:new", () => eventCount++);
  pipeline.on("error", (err) => console.error("  Error:", err.message));
  await pipeline.start();

  pipeline.watcher.on("ready", async () => {
    console.log("Initial scan complete. Waiting for processing...");
    await new Promise((r) => setTimeout(r, 3000));
    await pipeline.stop();

    const sessions = await store.listSessions();
    console.log(`Imported ${sessions.length} sessions, ${eventCount} messages`);
    await closeDb();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
