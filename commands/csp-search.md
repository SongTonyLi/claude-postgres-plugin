---
description: Search across all past Claude Code conversations stored in the local SQLite database
argument-hint: <natural language query>
---

Search the user's past Claude Code conversations for: **$ARGUMENTS**

If `$ARGUMENTS` is empty, ask the user what to search for instead of calling the tool.

## Step 1 — Interpret the query

The user's input is **natural language**, not a raw database query. Before calling any tool, analyze `$ARGUMENTS` to extract:

1. **Keywords** — expand the user's intent into multiple relevant search terms. Think about synonyms, related phrases, and how the topic would actually appear in a conversation.
   - "homework" → search for: `homework`, `assignment`, `exercise`, `problem set`
   - "that auth bug" → search for: `auth`, `authentication`, `login`, `401`, `unauthorized`
   - "deploy issue last week" → search for: `deploy`, `deployment`, `CI`, `pipeline`, `release`

2. **Time constraints** — look for temporal language and translate to a filtering strategy:
   - "recent" → limit to 5, rely on default recency ordering
   - "last week" → limit to 10, will filter results by date after fetching
   - "yesterday" → limit to 5, filter by date
   - No time mentioned → use default limit of 10

3. **Scope hints** — detect project/context narrowing:
   - "in the backend repo" → note for post-filtering by project path
   - "from my math class" → expand keywords to include course-related terms

## Step 2 — Execute searches

Run **multiple searches** if the query expands to several keywords. For each keyword/phrase:

- Call `search_messages` from the `claude-sqlite` MCP server with mode = `fuzzy` and the appropriate limit.

Deduplicate results across all searches by `session_id` + `uuid` (same message appearing in multiple keyword hits should only show once). Rank by: exact keyword match > partial match > synonym match.

## Step 3 — Filter and rank

Apply any constraints identified in Step 1:
- **Time:** discard results outside the time window the user implied.
- **Project:** if the user mentioned a specific project/repo, prefer results from matching `project_path`.
- **Relevance:** if a session matches multiple of the expanded keywords, rank it higher.

## Step 4 — Render results

Present the top results (after filtering) as a list with:

- **Session title** (or `(untitled)` if missing) — truncate to ~60 chars
- **Date** of the matching message (e.g. `2026-04-12`)
- **Role** — `user` or `assistant`
- **Snippet** — a short excerpt of the matching content centered on the match
- **Session ID** — first 8 chars, so the user can run `claude --resume <id>` or `/csp-resume` to pick the conversation back up

If no results match after filtering, try a broader search (drop time constraints or use fewer keywords) before reporting "no results found."

## Step 5 — Suggest follow-ups

After showing results, briefly suggest:
- `/csp-session <id>` to inspect a specific session in detail
- `/csp-resume <search phrase>` to load full context from matching sessions and continue the work

## Examples

| User types | What you search for |
|---|---|
| `/csp-search recent homework` | keywords: `homework`, `assignment`, `exercise`; limit: 5 |
| `/csp-search that bug with redis` | keywords: `redis`, `connection`, `cache`, `timeout` |
| `/csp-search what we decided about the API` | keywords: `API`, `endpoint`, `decided`, `design`, `REST` |
| `/csp-search auth stuff from the backend` | keywords: `auth`, `authentication`, `login`, `middleware`; scope: project paths containing "backend" |
| `/csp-search last week's deploy failure` | keywords: `deploy`, `failure`, `CI`, `pipeline`, `error`; time: last 7 days |
