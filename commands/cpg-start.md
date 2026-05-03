---
description: Start the cpg watcher + web dashboard in the background
---

Start the claude-postgres-plugin watcher and web dashboard.

Run this in the background using the Bash tool with `run_in_background: true`:

```bash
bun run "$CLAUDE_PLUGIN_ROOT/src/index.ts" start
```

If the user has set `$CPG_PORT`, the dashboard binds there; otherwise the default is 3456.

After starting, report:

- **Dashboard URL** — `http://localhost:<port>`
- **Watcher status** — confirm it is now ingesting `~/.claude/projects/*.jsonl` in real time
- A reminder that the same Postgres database powers both the dashboard and the `claude-postgres` MCP server, so any conversation Claude can search is also browsable in the UI

If the command fails because dependencies are missing, tell the user to run:

```bash
cd "$CLAUDE_PLUGIN_ROOT" && bun install && (cd web && bun install && bun --bun vite build)
```

once, then re-run `/cpg-start`.
