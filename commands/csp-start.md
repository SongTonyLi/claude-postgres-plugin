---
description: Start the csp watcher + web dashboard in the background
---

Start the claude-sqlite-plugin watcher and web dashboard.

Determine the port: use `$CSP_PORT` if set, otherwise default to 3456.

**Step 1 — Check if already running:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>
```

If this returns `200`, the dashboard is already up. Skip starting and go straight to the report below.

**Step 2 — Start the server (only if not already running):**

Check whether a compiled binary exists at `$CLAUDE_PLUGIN_ROOT/bin/csp`. If it does, prefer it (no Bun runtime needed):

```bash
"$CLAUDE_PLUGIN_ROOT/bin/csp" start
```

Otherwise fall back to the Bun source path:

```bash
bun run "$CLAUDE_PLUGIN_ROOT/src/index.ts" start
```

Either way, run it in the background using the Bash tool with `run_in_background: true`.

After starting, report:

- **Dashboard URL** — `http://localhost:<port>`
- **Watcher status** — confirm it is now ingesting `~/.claude/projects/*.jsonl` in real time
- A reminder that the same local SQLite database powers both the dashboard and the `claude-sqlite` MCP server, so any conversation Claude can search is also browsable in the UI

If the command fails because dependencies are missing, tell the user to run:

```bash
cd "$CLAUDE_PLUGIN_ROOT" && bun install && (cd web && bun install && bun --bun vite build)
```

once, then re-run `/csp-start`.
