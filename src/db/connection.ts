import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { mkdirSync, readdirSync, existsSync } from "fs";
import { homedir } from "os";

let db: Database | undefined;

function resolveDbPath(): string {
  const explicit = process.env.CSP_DB_PATH;
  if (explicit) return explicit;

  const explicitDir = process.env.CSP_DATA_DIR;
  if (explicitDir) return join(explicitDir, "csp.sqlite");

  // Standard env var Claude Code sets for plugin persistent state.
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) return join(pluginData, "csp.sqlite");

  // Auto-discover the plugin data directory when running outside the plugin
  // system (e.g. `csp start` from the CLI). Look for an existing DB created
  // by the MCP server so both processes share the same database.
  const pluginDataRoot = join(homedir(), ".claude", "plugins", "data");
  try {
    const dirs = readdirSync(pluginDataRoot, { withFileTypes: true });
    for (const d of dirs) {
      if (d.isDirectory() && d.name.startsWith("claude-sqlite-plugin")) {
        const candidate = join(pluginDataRoot, d.name, "csp.sqlite");
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // plugins/data may not exist yet — fall through
  }

  return join(homedir(), ".claude-sqlite-plugin", "csp.sqlite");
}

export function getDb(): Database {
  if (db) return db;

  const path = resolveDbPath();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new Database(path, { create: true });

  // ACID configuration. journal_mode + synchronous + foreign_keys must all be set
  // for the safety guarantees the README claims.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    const conn = db;
    db = undefined;
    conn.close();
  }
}
