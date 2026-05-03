---
description: Inspect a specific Claude Code session — metadata plus recent transcript
argument-hint: <session-id> [last N messages]
---

Inspect Claude Code session: **$ARGUMENTS**

Parse `$ARGUMENTS` as `<session-id> [N]`. The session ID may be a full UUID or a unique prefix; if it's a prefix, first call `list_recent_sessions` and find the matching one. `N` is how many of the most-recent messages to show (default 20, clamp to 1–500).

Steps:

1. Call `get_session` with the resolved session id.
   - If `found: false`, tell the user the id was not found and suggest `/csp-recent` to browse.
2. Call `get_session_messages` with `limit: N` and `offset: max(0, total_messages - N)` so we get the *tail* of the conversation.
3. Render a header with: title, project path, model, status, started/ended, total message count.
4. Render each returned message: role, timestamp, content snippet (first ~400 chars), any `tool_uses`, flags like `has_image` / `has_document` / `is_sidechain`.
5. End with a one-liner reminding the user they can:
   - Run `claude --resume <id>` to continue the conversation
   - Open the web dashboard for full visual browsing (default http://localhost:3456)
   - Call `get_session_tool_calls` for full tool input/output detail
