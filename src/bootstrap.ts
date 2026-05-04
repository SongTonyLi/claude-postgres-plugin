#!/usr/bin/env bun
/**
 * Bootstrap entry point for the MCP server.
 * Ensures `bun install` has been run before launching the server.
 * Only uses Bun built-ins (no npm dependencies at top level).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? resolve(import.meta.dir, "..");
const log = (...args: unknown[]) => console.error("[csp-bootstrap]", ...args);

function ensureDeps() {
  if (existsSync(resolve(PLUGIN_ROOT, "node_modules"))) return;

  log("First run — installing dependencies...");
  const proc = Bun.spawnSync(["bun", "install"], {
    cwd: PLUGIN_ROOT,
    stdout: "pipe", // keep off the JSON-RPC stdout channel
    stderr: "pipe",
  });

  if (proc.exitCode !== 0) {
    log("bun install failed:", proc.stderr.toString());
    process.exit(1);
  }
  log("Dependencies installed");
}

ensureDeps();

const { runMcpServer } = await import("./mcp-server");
await runMcpServer();
