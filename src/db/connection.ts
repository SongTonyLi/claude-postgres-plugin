import { Database } from "bun:sqlite";
import { join, dirname } from "path";
import { mkdirSync, readdirSync, existsSync, statSync, copyFileSync, unlinkSync } from "fs";
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

/**
 * Migrate data from a legacy DB location when the resolved path points to a
 * new/empty database.  This handles plugin renames (e.g. claude-postgres-plugin
 * → claude-sqlite-plugin), re-installations from a different source, or any
 * other event that changes the canonical data directory.
 */
function migrateLegacyDb(targetPath: string): void {
  // If the target already has real data (> 100 KB) there is nothing to migrate.
  try {
    if (existsSync(targetPath) && statSync(targetPath).size > 100_000) return;
  } catch { /* file may not exist yet */ }

  const candidates: string[] = [];

  // 1. Old fallback location
  const fallback = join(homedir(), ".claude-sqlite-plugin", "csp.sqlite");
  if (fallback !== targetPath) candidates.push(fallback);

  // Legacy fallback from the postgres-era name
  const legacyFallback = join(homedir(), ".claude-postgres-plugin", "cpg.sqlite");
  if (legacyFallback !== targetPath) candidates.push(legacyFallback);

  // 2. Other plugin data directories (handles renames / source changes)
  const pluginDataRoot = join(homedir(), ".claude", "plugins", "data");
  try {
    for (const d of readdirSync(pluginDataRoot, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (d.name.startsWith("claude-postgres-plugin") || d.name.startsWith("claude-sqlite-plugin")) {
        const p = join(pluginDataRoot, d.name, "csp.sqlite");
        if (p !== targetPath) candidates.push(p);
        // Also check old postgres-era filename
        const pg = join(pluginDataRoot, d.name, "cpg.sqlite");
        if (pg !== targetPath) candidates.push(pg);
      }
    }
  } catch { /* plugins/data may not exist */ }

  // Pick the largest candidate — the one with the most data wins.
  let best = "";
  let bestSize = 0;
  for (const c of candidates) {
    try {
      const s = statSync(c).size;
      if (s > bestSize) { bestSize = s; best = c; }
    } catch { /* candidate doesn't exist */ }
  }

  if (!best || bestSize < 100_000) return;

  // Checkpoint the legacy DB's WAL so the main file is self-contained.
  try {
    const legacyDb = new Database(best);
    legacyDb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    legacyDb.close();
  } catch { /* best-effort */ }

  // Copy the consolidated legacy file to the target path.
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(best, targetPath);

  // Remove stale WAL/SHM at the target since we just copied a clean file.
  try { unlinkSync(targetPath + "-wal"); } catch { /* may not exist */ }
  try { unlinkSync(targetPath + "-shm"); } catch { /* may not exist */ }

  console.error(`[csp] Migrated database from ${best} (${(bestSize / 1e6).toFixed(1)} MB)`);
}

export function getDb(): Database {
  if (db) return db;

  const path = resolveDbPath();
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
    migrateLegacyDb(path);
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
