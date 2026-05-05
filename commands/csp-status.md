---
description: Health check — verify the plugin is running and show database stats
argument-hint:
---

Run a health check on the claude-sqlite-plugin installation.

## Check 1 — MCP server

Call `list_recent_sessions` with limit = 1. If it returns successfully, the MCP server is connected and the database is readable. Note the session count from `total_matching`.

If the tool call fails, report that the MCP server is not responding and suggest:
- Check that the plugin is installed: `/plugin list`
- Reinstall if needed: `/plugin install claude-sqlite-plugin@songtonyli-plugins`

## Check 2 — Dashboard

Determine the port: use `$CSP_PORT` if set, otherwise 3456.

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>
```

Report whether the dashboard is reachable (200) or not. If not running, suggest `/csp-start`.

## Check 3 — Database stats

Call `list_recent_sessions` with limit = 1 (already done above). Use `total_matching` as the total session count.

Also run:

```bash
ls -lh ~/.claude-sqlite-plugin/csp.sqlite 2>/dev/null || ls -lh "${CLAUDE_PLUGIN_DATA}/csp.sqlite" 2>/dev/null || echo "DB file not found at default paths"
```

to report the database file size.

## Report

Present a single compact status block:

```
╭─ claude-sqlite-plugin status ─────────────────────╮
│ MCP server:  ✓ connected                          │
│ Dashboard:   ✓ running at http://localhost:3456    │
│ Database:    847 sessions · 38,291 messages        │
│ DB size:     24.3 MB                              │
│ Watcher:     ✓ ingesting ~/.claude/projects/      │
╰───────────────────────────────────────────────────╯
```

Use ✗ and a brief explanation for any failing component. If everything passes, end with:

```
All systems healthy. Your conversations are being captured.
```

If anything fails, end with the most actionable fix first.
