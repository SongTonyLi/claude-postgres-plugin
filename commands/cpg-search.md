---
description: Search across all past Claude Code conversations stored in the local SQLite database
argument-hint: <search phrase>
---

Search the user's past Claude Code conversations for: **$ARGUMENTS**

Use the `search_messages` tool from the `claude-postgres` MCP server (default mode is `fuzzy`, limit 10). Render the top results as a table or list with:

- **Session title** (or `(untitled)` if missing) — truncate to ~60 chars
- **Date** of the matching message (e.g. `2026-04-12`)
- **Role** — `user` or `assistant`
- **Snippet** — a short excerpt of the matching content centered on the match
- **Session ID** — first 8 chars, so the user can run `claude --resume <id>` to pick the conversation back up

If `$ARGUMENTS` is empty, ask the user what to search for instead of calling the tool.

After showing results, briefly suggest a follow-up — e.g. `/cpg-session <id>` to inspect a specific session in detail.
