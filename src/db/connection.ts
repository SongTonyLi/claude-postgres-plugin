import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
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
