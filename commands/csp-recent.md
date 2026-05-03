---
description: List the user's most recent Claude Code sessions
argument-hint: [count]
---

List the user's most recent Claude Code sessions.

Use the `list_recent_sessions` tool from the `claude-sqlite` MCP server. If `$ARGUMENTS` is a positive integer, pass it as `limit` (clamped to 1–200). Otherwise default to 10.

Render as a numbered list with:

1. **Title** (or `(untitled)`) — truncate to ~60 chars
2. **Project** — basename of `project_path`
3. **Started** — relative time (e.g. `3 hours ago`, `yesterday`, `Apr 12`)
4. **Messages** — count
5. **ID** — short (first 8 chars)

After the list, mention the user can run `/csp-session <id>` to inspect any of them, or `/csp-search <phrase>` to fuzzy-search across all sessions.
