import postgres from "postgres";
import { getDb } from "../db/connection";

type Sql = ReturnType<typeof postgres>;

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

export class ConversationStore {
  /** Run a callback inside a database transaction (ACID). */
  async transact(fn: (tx: Sql) => Promise<void>): Promise<void> {
    const sql = getDb();
    await sql.begin((tx) => fn(tx));
  }

  async upsertSession(session: SessionRecord, tx?: Sql): Promise<void> {
    const sql = tx || getDb();
    await sql`
      INSERT INTO sessions (id, project_path, cwd, model, started_at, ended_at, status, title, metadata)
      VALUES (
        ${session.id},
        ${session.projectPath},
        ${session.cwd ?? null},
        ${session.model ?? null},
        ${session.startedAt},
        ${session.endedAt ?? null},
        ${session.status},
        ${session.title ?? null},
        ${sql.json(session.metadata ?? {})}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        title = COALESCE(EXCLUDED.title, sessions.title),
        ended_at = COALESCE(EXCLUDED.ended_at, sessions.ended_at),
        model = COALESCE(EXCLUDED.model, sessions.model),
        cwd = COALESCE(EXCLUDED.cwd, sessions.cwd),
        metadata = EXCLUDED.metadata
    `;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const sql = getDb();
    const rows = await sql`SELECT * FROM sessions WHERE id = ${id}`;
    if (rows.length === 0) return null;
    const r = rows[0]!;
    return {
      id: r.id,
      projectPath: r.project_path,
      cwd: r.cwd,
      model: r.model,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      title: r.title,
      metadata: r.metadata,
    };
  }

  async listSessions(): Promise<(SessionRecord & { messageCount?: number; toolCount?: number })[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT s.*,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id AND m.role != 'system' AND m.is_meta = false) as message_count,
        (SELECT COUNT(*) FROM tool_calls t WHERE t.session_id = s.id) as tool_count
      FROM sessions s WHERE s.hidden = false ORDER BY started_at DESC
    `;
    return rows.map((r) => ({
      id: r.id,
      projectPath: r.project_path,
      cwd: r.cwd,
      model: r.model,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      title: r.title,
      metadata: r.metadata,
      messageCount: Number(r.message_count),
      toolCount: Number(r.tool_count),
    }));
  }

  async insertMessage(msg: MessageRecord, tx?: Sql): Promise<void> {
    const sql = tx || getDb();
    await sql`
      INSERT INTO messages (session_id, uuid, parent_uuid, role, content, content_blocks, thinking, is_sidechain, is_meta, sequence_num, timestamp, metadata)
      VALUES (
        ${msg.sessionId},
        ${msg.uuid},
        ${msg.parentUuid},
        ${msg.role},
        ${msg.content},
        ${sql.json(msg.contentBlocks)},
        ${msg.thinking},
        ${msg.isSidechain},
        ${msg.isMeta},
        ${msg.sequenceNum},
        ${msg.timestamp},
        ${sql.json(msg.metadata ?? {})}
      )
      ON CONFLICT (session_id, uuid) DO NOTHING
    `;
  }

  async getMessages(sessionId: string): Promise<MessageRecord[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM messages WHERE session_id = ${sessionId} ORDER BY sequence_num ASC
    `;
    return rows.map((r) => ({
      sessionId: r.session_id,
      uuid: r.uuid,
      parentUuid: r.parent_uuid,
      role: r.role,
      content: r.content,
      contentBlocks: r.content_blocks,
      thinking: r.thinking,
      isSidechain: r.is_sidechain,
      isMeta: r.is_meta,
      sequenceNum: r.sequence_num,
      timestamp: r.timestamp,
      metadata: r.metadata,
    }));
  }

  async insertToolCall(tool: ToolCallRecord, tx?: Sql): Promise<void> {
    const sql = tx || getDb();
    await sql`
      INSERT INTO tool_calls (session_id, message_uuid, tool_use_id, tool_name, input, status)
      VALUES (
        ${tool.sessionId},
        ${tool.messageUuid},
        ${tool.toolUseId},
        ${tool.toolName},
        ${sql.json(tool.input)},
        ${tool.status}
      )
      ON CONFLICT (tool_use_id) DO NOTHING
    `;
  }

  async completeToolCall(toolUseId: string, output: string | null, error: string | null, resultUuid?: string, tx?: Sql): Promise<void> {
    const sql = tx || getDb();
    const status = error ? "failed" : "completed";
    await sql`
      UPDATE tool_calls SET
        output = ${output},
        error = ${error},
        status = ${status},
        result_uuid = ${resultUuid ?? null},
        completed_at = NOW()
      WHERE tool_use_id = ${toolUseId}
    `;
  }

  async getToolCalls(sessionId: string): Promise<ToolCallRecord[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM tool_calls WHERE session_id = ${sessionId} ORDER BY created_at ASC
    `;
    return rows.map((r) => ({
      sessionId: r.session_id,
      messageUuid: r.message_uuid,
      resultUuid: r.result_uuid,
      toolUseId: r.tool_use_id,
      toolName: r.tool_name,
      input: r.input,
      output: r.output,
      status: r.status,
      error: r.error,
    }));
  }

  async searchMessages(query: string, limit: number = 50): Promise<(MessageRecord & { sessionTitle?: string })[]> {
    const sql = getDb();
    const pattern = `%${query}%`;
    const rows = await sql`
      SELECT m.*, s.title as session_title
      FROM messages m
      JOIN sessions s ON m.session_id = s.id
      WHERE m.content ILIKE ${pattern}
        AND m.is_meta = false
        AND m.role IN ('user', 'assistant')
      ORDER BY m.timestamp DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      sessionId: r.session_id,
      uuid: r.uuid,
      parentUuid: r.parent_uuid,
      role: r.role,
      content: r.content,
      contentBlocks: r.content_blocks,
      thinking: r.thinking,
      isSidechain: r.is_sidechain,
      isMeta: r.is_meta,
      sequenceNum: r.sequence_num,
      timestamp: r.timestamp,
      metadata: r.metadata,
      sessionTitle: r.session_title,
    }));
  }

  async setSessionHidden(id: string, hidden: boolean): Promise<void> {
    const sql = getDb();
    await sql`UPDATE sessions SET hidden = ${hidden} WHERE id = ${id}`;
  }

  async insertRawEvent(event: RawEventRecord, tx?: Sql): Promise<void> {
    const sql = tx || getDb();
    await sql`
      INSERT INTO raw_events (session_id, event_type, data, file_path, line_number)
      VALUES (
        ${event.sessionId},
        ${event.eventType},
        ${sql.json(event.data)},
        ${event.filePath ?? null},
        ${event.lineNumber ?? null}
      )
    `;
  }

  /** Get all known session IDs (for seeding in-memory caches on restart). */
  async getSessionIds(): Promise<Set<string>> {
    const sql = getDb();
    const rows = await sql`SELECT id FROM sessions`;
    return new Set(rows.map((r) => r.id));
  }

  /** Get session IDs that already have a title. */
  async getTitledSessionIds(): Promise<Set<string>> {
    const sql = getDb();
    const rows = await sql`SELECT id FROM sessions WHERE title IS NOT NULL AND title != ''`;
    return new Set(rows.map((r) => r.id));
  }
}
