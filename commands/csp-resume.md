---
description: Resume from any point in any past conversation — search, pick, and reload full context that autocompact destroyed
argument-hint: [search phrase]
---

Resume a past Claude Code conversation by selecting from recent or searched sessions.

**Why this exists:** `claude --resume` only continues from the *end* of a session — and if the context is large, it autocompacts first, destroying the detail. `/csp-resume` is different: it reloads the **full preserved transcript** from the SQLite database (which captured every message in real time, before autocompact), lets you pick **any conversations from multiple sessions from any project**, and injects that context into your current conversation. You resume with the *complete* picture, not a one-paragraph summary. For example, you can resume from the workflow related to homework submissions which occurred across multiple sessions over the past week.

## Step 1 — Gather sessions

- If `$ARGUMENTS` is non-empty, call `search_messages` from the `claude-sqlite` MCP server with query = `$ARGUMENTS`, mode = `fuzzy`, limit = 20. Deduplicate by `session_id` (keep the highest-relevance hit per session). Then call `get_session` for each unique session id to get full metadata.
- If `$ARGUMENTS` is empty, call `list_recent_sessions` with limit = 15.

## Step 2 — Present the selector

Render a **numbered selector** list. For each session show:

```
[N]  Title (or summarization)  —  Project basename  —  Started relative time  —  Messages count
     - Brief snippet from the first user message (up to ~100 chars) -
     Session ID (first 8 chars)
```

Example:

```
[1]  Fix rate limiter bug — my-api — 2 hours ago — 47 messages
     - Started debugging rate limiter returning 429 for authenticated users... -
     a745301c

[2]  Homework: chapter 5 exercises — cs101 — yesterday — 23 messages -
     - Working through exercises 5.1 to 5.5 on recursion and dynamic programming... -
     bf920e14

[3]  Refactor auth middleware — backend — 3 days ago — 112 messages - 
     - Refactored auth middleware to support multiple strategies (JWT, sessions)... -
     c3d8f72a
```

Below the list, print:

```
Pick a number to load that session's context into this conversation.
Or type multiple numbers (e.g. "1 3") to load context from several sessions.
Type "all" to show sessions from all projects, or a new search phrase to search again.
```

Then **stop and wait for the user's response.**

## Step 3 — Handle user's choice

When the user responds:

- **A number (e.g. "2")** — proceed to Step 4 with that single session.
- **Multiple numbers (e.g. "1 3")** — proceed to Step 4 loading context from all selected sessions.
- **"all"** — re-run Step 1 with `list_recent_sessions` limit = 30 (no project filter), then re-present the selector.
- **A text phrase** — treat as a new search: re-run Step 1 with that phrase as the query, re-present the selector.

## Step 4 — Load session context

For each selected session:

1. Call `get_session` to confirm it exists and get metadata (title, project, model, start/end time, message count).
2. Call `get_session_messages` with limit = 100 and offset = 0 to load the conversation transcript from the beginning.
3. Optionally call `get_session_tool_calls` if the session has significant tool usage.

Present a **condensed context summary** for each loaded session:

```
━━━ Loaded: "Fix rate limiter bug" (a745301c) ━━━
Project: my-api | Model: opus | 47 messages | 2 hours ago
Key context:
- [user] Started debugging rate limiter returning 429 for authenticated users...
- [assistant] Found the issue in middleware/rateLimit.ts — token bucket wasn't...
- [tool] Called "ReadFile" on "middleware/rateLimit.ts" and got the file contents...
- [user] That fixed it, but now the Redis connection pool...
  ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

When summarizing the transcript:
- Show the first user message in full (up to ~200 chars) to establish the topic.
- Summarize the arc of the conversation: what was attempted, what worked, what was left unfinished.
- Highlight any unresolved questions, pending TODOs, or errors at the end.
- If multiple sessions are loaded, present them in chronological order.
- If total messages across all selected sessions exceeds 200, summarize more aggressively — focus on decisions, outcomes, and open threads rather than individual exchanges.

## Step 5 — Offer resume options

After presenting the context, offer:

```
Context loaded. You can now:
  (a) Continue this work right here — I have the full context above.
  (b) Resume the original session: claude --resume <full-session-id>
  (c) Pick a different session — type a number or search phrase.
```

**If the user picks (a):** proceed naturally — you now have the session context in this conversation and can continue the work. This is the recommended path. The full history is in your context window, uncorrupted by autocompact.

**If the user picks (b):** output the exact `claude --resume <full-uuid>` command they can copy and run. Mention they can type `! claude --resume <id>` to launch it directly from this session. Note: this path is subject to autocompact if the session is large.

**If the user picks (c):** go back to Step 2.

## Image and document reloading

When loading session context, check for messages with `has_image: true` or `has_document: true`. These attachments are preserved in the SQLite database even after autocompact.

To reload them:

1. Determine the dashboard port: use `$CSP_PORT` if set, otherwise 3456.
2. Check if the dashboard is running: `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>`
3. If running (200), for each message with images/documents, fetch them via:
   ```
   http://localhost:<port>/api/sessions/<session_id>/messages/<message_uuid>/attachment/<block_index>
   ```
   Use the Read tool on the fetched URL to display images inline, or mention the URL so the user can view them.
4. If the dashboard is NOT running, note which messages had attachments and suggest the user run `/csp-start` first if they need the images reloaded.

When presenting context with images, mark them clearly:

```
- [user] (+ 2 images attached) Here's the error screenshot and the architecture diagram...
```

This is especially valuable for sessions where the user shared screenshots of bugs, whiteboards, or design mockups — context that would otherwise be lost to autocompact.

## Notes

- **Any point, any project:** Unlike `claude --resume` which only works within the same directory and continues from the end, `/csp-resume` can load context from sessions in any project directory and from any point in the conversation. You get the full transcript the way it actually happened.
- **Survives autocompact:** The SQLite database captured messages in real-time as they were written. Even if `claude --resume` would autocompact a session, `/csp-resume` still has the unabridged version.
- **Cross-session synthesis:** Select multiple sessions (e.g., all homework conversations from this week) to build a combined context that spans multiple work sessions — something `claude --resume` cannot do at all.
- If a session has more than 100 messages, load the first 100 by default (establishes the original intent and approach). Mention the total count so the user knows there's more, and offer to load a different range (e.g., the last 100 for most-recent context).
