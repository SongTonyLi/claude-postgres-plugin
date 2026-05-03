import type { Database } from "bun:sqlite";
import { getDb } from "../db/connection";

export interface SessionRecord {
  id: string;
  projectPath: string;
  cwd?: string;
  model?: string;
  startedAt: Date;
  endedAt?: Date;
  status: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageRecord {
  sessionId: string;
  uuid: string;
  parentUuid: string | null;
  role: string;
  content: string | null;
  contentBlocks: unknown[];
  thinking: string | null;
  isSidechain: boolean;
  isMeta: boolean;
  sequenceNum: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ToolCallRecord {
  sessionId: string;
  messageUuid: string;
  resultUuid?: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  output?: string | null;
  status: string;
  error?: string | null;
}

export interface RawEventRecord {
  sessionId: string;
  eventType: string;
  data: unknown;
  filePath?: string;
  lineNumber?: number;
}

const toIso = (d: Date): string => d.toISOString();

const rowToSession = (r: any): SessionRecord & { messageCount?: number; toolCount?: number } => ({
  id: r.id,
  projectPath: r.project_path,
  cwd: r.cwd ?? undefined,
  model: r.model ?? undefined,
  startedAt: new Date(r.started_at),
  endedAt: r.ended_at ? new Date(r.ended_at) : undefined,
  status: r.status,
  title: r.title ?? undefined,
  metadata: r.metadata ? JSON.parse(r.metadata) : {},
  messageCount: r.message_count != null ? Number(r.message_count) : undefined,
  toolCount: r.tool_count != null ? Number(r.tool_count) : undefined,
});

const rowToMessage = (r: any): MessageRecord & { sessionTitle?: string } => ({
  sessionId: r.session_id,
  uuid: r.uuid,
  parentUuid: r.parent_uuid,
  role: r.role,
  content: r.content,
  contentBlocks: r.content_blocks ? JSON.parse(r.content_blocks) : [],
  thinking: r.thinking,
  isSidechain: Boolean(r.is_sidechain),
  isMeta: Boolean(r.is_meta),
  sequenceNum: r.sequence_num,
  timestamp: new Date(r.timestamp),
  metadata: r.metadata ? JSON.parse(r.metadata) : {},
  sessionTitle: r.session_title ?? undefined,
});

const rowToToolCall = (r: any): ToolCallRecord => ({
  sessionId: r.session_id,
  messageUuid: r.message_uuid,
  resultUuid: r.result_uuid ?? undefined,
  toolUseId: r.tool_use_id,
  toolName: r.tool_name,
  input: r.input ? JSON.parse(r.input) : null,
  output: r.output,
  status: r.status,
  error: r.error,
});

export class ConversationStore {
  /**
   * Run a callback inside a SQLite transaction with BEGIN IMMEDIATE so we acquire the
   * write lock up front and never have to upgrade mid-transaction. Atomic across
   * the whole callback; rolls back on any throw.
   */
  async transact(fn: (tx: Database) => Promise<void>): Promise<void> {
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      await fn(db);
      db.exec("COMMIT");
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // best-effort rollback; original error is what matters
      }
      throw e;
    }
  }

  async upsertSession(session: SessionRecord, tx?: Database): Promise<void> {
    const db = tx || getDb();
    db.prepare(`
      INSERT INTO sessions (id, project_path, cwd, model, started_at, ended_at, status, title, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        title = COALESCE(excluded.title, sessions.title),
        ended_at = COALESCE(excluded.ended_at, sessions.ended_at),
        model = COALESCE(excluded.model, sessions.model),
        cwd = COALESCE(excluded.cwd, sessions.cwd),
        metadata = excluded.metadata
    `).run(
      session.id,
      session.projectPath,
      session.cwd ?? null,
      session.model ?? null,
      toIso(session.startedAt),
      session.endedAt ? toIso(session.endedAt) : null,
      session.status,
      session.title ?? null,
      JSON.stringify(session.metadata ?? {}),
    );
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const db = getDb();
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    if (!row) return null;
    return rowToSession(row);
  }

  async listSessions(): Promise<(SessionRecord & { messageCount?: number; toolCount?: number })[]> {
    const db = getDb();
    const rows = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id AND m.role != 'system' AND m.is_meta = 0) as message_count,
        (SELECT COUNT(*) FROM tool_calls t WHERE t.session_id = s.id) as tool_count
      FROM sessions s
      WHERE s.hidden = 0
      ORDER BY started_at DESC
    `).all() as any[];
    return rows.map(rowToSession);
  }

  async insertMessage(msg: MessageRecord, tx?: Database): Promise<void> {
    const db = tx || getDb();
    db.prepare(`
      INSERT INTO messages (session_id, uuid, parent_uuid, role, content, content_blocks, thinking, is_sidechain, is_meta, sequence_num, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, uuid) DO NOTHING
    `).run(
      msg.sessionId,
      msg.uuid,
      msg.parentUuid,
      msg.role,
      msg.content,
      JSON.stringify(msg.contentBlocks),
      msg.thinking,
      msg.isSidechain ? 1 : 0,
      msg.isMeta ? 1 : 0,
      msg.sequenceNum,
      toIso(msg.timestamp),
      JSON.stringify(msg.metadata ?? {}),
    );
  }

  async getMessages(sessionId: string): Promise<MessageRecord[]> {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM messages WHERE session_id = ? ORDER BY sequence_num ASC"
    ).all(sessionId) as any[];
    return rows.map(rowToMessage);
  }

  async getMessageAttachment(
    sessionId: string,
    uuid: string,
    blockIndex: number
  ): Promise<{ data: string; mediaType: string } | null> {
    const db = getDb();
    const row = db.prepare(
      "SELECT content_blocks FROM messages WHERE session_id = ? AND uuid = ?"
    ).get(sessionId, uuid) as any;
    if (!row) return null;
    const blocks = (row.content_blocks ? JSON.parse(row.content_blocks) : []) as any[];
    const block = blocks[blockIndex];
    if (!block || (block.type !== "image" && block.type !== "document")) return null;
    if (!block.source?.data) return null;
    return {
      data: block.source.data,
      mediaType: block.source.media_type || block.source.mediaType || "image/png",
    };
  }

  async insertToolCall(tool: ToolCallRecord, tx?: Database): Promise<void> {
    const db = tx || getDb();
    db.prepare(`
      INSERT INTO tool_calls (session_id, message_uuid, tool_use_id, tool_name, input, status)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(tool_use_id) DO NOTHING
    `).run(
      tool.sessionId,
      tool.messageUuid,
      tool.toolUseId,
      tool.toolName,
      JSON.stringify(tool.input),
      tool.status,
    );
  }

  async completeToolCall(
    toolUseId: string,
    output: string | null,
    error: string | null,
    resultUuid?: string,
    tx?: Database
  ): Promise<void> {
    const db = tx || getDb();
    const status = error ? "failed" : "completed";
    db.prepare(`
      UPDATE tool_calls SET
        output = ?,
        error = ?,
        status = ?,
        result_uuid = ?,
        completed_at = datetime('now')
      WHERE tool_use_id = ?
    `).run(output, error, status, resultUuid ?? null, toolUseId);
  }

  async getToolCalls(sessionId: string): Promise<ToolCallRecord[]> {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM tool_calls WHERE session_id = ? ORDER BY created_at ASC"
    ).all(sessionId) as any[];
    return rows.map(rowToToolCall);
  }

  async searchMessages(
    query: string,
    limit: number = 50,
    mode: string = "fuzzy"
  ): Promise<(MessageRecord & { sessionTitle?: string })[]> {
    const db = getDb();
    const trimmed = query.trim();

    // Substring (LIKE) fallback used by both regex mode and FTS-empty fallback.
    const runLike = (): any[] => {
      const pattern = `%${trimmed}%`;
      return db.prepare(`
        SELECT m.*, s.title as session_title
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE m.content LIKE ?
          AND m.is_meta = 0
          AND m.role IN ('user', 'assistant')
        ORDER BY m.timestamp DESC
        LIMIT ?
      `).all(pattern, limit) as any[];
    };

    if (mode === "regex") {
      // SQLite has no native regex; treat "regex" mode as substring match.
      // Documented behavior change from the Postgres backend's ~* operator.
      return runLike().map(rowToMessage);
    }

    // Fuzzy: FTS5 with prefix matching on each word, then fall back to LIKE.
    const ftsQuery = trimmed
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, ""))
      .filter(Boolean)
      .map((w) => w + "*")
      .join(" ");

    if (!ftsQuery) {
      return runLike().map(rowToMessage);
    }

    let rows: any[];
    try {
      rows = db.prepare(`
        SELECT m.*, s.title as session_title, bm25(messages_fts) as rank
        FROM messages_fts
        JOIN messages m ON m.id = messages_fts.rowid
        JOIN sessions s ON m.session_id = s.id
        WHERE messages_fts MATCH ?
          AND m.is_meta = 0
          AND m.role IN ('user', 'assistant')
        ORDER BY rank ASC
        LIMIT ?
      `).all(ftsQuery, limit) as any[];
    } catch {
      // Bad FTS query (rare given our sanitization) — fall back to LIKE.
      rows = runLike();
    }

    if (rows.length === 0) {
      // FTS5 returned nothing; substring match might still find something.
      rows = runLike();
    }

    return rows.map(rowToMessage);
  }

  async setSessionHidden(id: string, hidden: boolean): Promise<void> {
    const db = getDb();
    db.prepare("UPDATE sessions SET hidden = ? WHERE id = ?").run(hidden ? 1 : 0, id);
  }

  async insertRawEvent(event: RawEventRecord, tx?: Database): Promise<void> {
    const db = tx || getDb();
    db.prepare(`
      INSERT INTO raw_events (session_id, event_type, data, file_path, line_number)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      event.sessionId,
      event.eventType,
      JSON.stringify(event.data),
      event.filePath ?? null,
      event.lineNumber ?? null,
    );
  }

  async getSessionIds(): Promise<Set<string>> {
    const db = getDb();
    const rows = db.prepare("SELECT id FROM sessions").all() as any[];
    return new Set(rows.map((r) => r.id));
  }

  async getTitledSessionIds(): Promise<Set<string>> {
    const db = getDb();
    const rows = db
      .prepare("SELECT id FROM sessions WHERE title IS NOT NULL AND title != ''")
      .all() as any[];
    return new Set(rows.map((r) => r.id));
  }
}
