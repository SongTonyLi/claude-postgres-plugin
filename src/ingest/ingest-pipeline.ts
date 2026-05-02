import { SessionWatcher } from "../watcher/session-watcher";
import {
  parseSessionLine,
  extractTextContent,
  extractThinking,
  extractToolUses,
  extractToolResults,
} from "../parser/session-parser";
import type { ConversationStore } from "../store/conversation-store";
import { basename, dirname } from "path";
import EventEmitter from "eventemitter3";

export interface PipelineEvents {
  "session:new": (sessionId: string) => void;
  "session:update": (sessionId: string) => void;
  "message:new": (sessionId: string, uuid: string, role: string, data?: any) => void;
  "tool:update": (sessionId: string, toolUseId: string) => void;
  error: (error: Error) => void;
}

export class IngestPipeline extends EventEmitter<PipelineEvents> {
  readonly watcher: SessionWatcher;
  private store: ConversationStore;
  private knownSessions: Set<string> = new Set();
  private titledSessions: Set<string> = new Set();
  private queue: Promise<void> = Promise.resolve();
  private flushQueue: Promise<void> = Promise.resolve();

  constructor(store: ConversationStore, watchPath?: string) {
    super();
    this.store = store;
    this.watcher = new SessionWatcher(watchPath);
  }

  async start(): Promise<void> {
    // Seed in-memory caches from DB to avoid false "new" events on restart
    this.knownSessions = await this.store.getSessionIds();
    this.titledSessions = await this.store.getTitledSessionIds();

    this.watcher.on("line", (filePath, line, lineNumber) => {
      this.queue = this.queue.then(() =>
        this.processLine(filePath, line, lineNumber).catch((err) => {
          this.emit("error", err instanceof Error ? err : new Error(String(err)));
        })
      );
    });

    this.watcher.on("error", (err) => this.emit("error", err));
    this.watcher.start();
  }

  async stop(): Promise<void> {
    await this.watcher.stop();
    // Wait for all pending DB writes to flush
    await this.flushQueue;
  }

  private async processLine(filePath: string, line: string, lineNumber: number): Promise<void> {
    const event = parseSessionLine(line);
    if (!event) return;

    const sessionId = event.sessionId || basename(filePath, ".jsonl");
    if (!sessionId) return;

    const isNewSession = !this.knownSessions.has(sessionId);
    const projectPath = this.deriveProjectPath(filePath);
    const seq = lineNumber;

    // ─── Parse data immediately for fast rendering ─────
    let messageData: any = null;
    let toolUses: any[] = [];
    let toolResults: any[] = [];

    if (event.type === "user" || event.type === "assistant") {
      const message = (event.data as any).message;
      if (!message) return;

      const rawContent = message.content;
      const contentBlocks = Array.isArray(rawContent) ? rawContent : [];
      const textContent = typeof rawContent === "string" ? rawContent : extractTextContent(contentBlocks);
      const thinking = extractThinking(contentBlocks);

      messageData = {
        sessionId,
        uuid: event.uuid,
        parentUuid: event.parentUuid,
        role: event.type === "assistant" ? "assistant" : "user",
        content: textContent || null,
        contentBlocks,
        thinking,
        isSidechain: event.isSidechain,
        isMeta: event.isMeta,
        sequenceNum: seq,
        timestamp: new Date(event.timestamp).toISOString(),
        metadata: {},
      };

      if (event.type === "assistant") {
        toolUses = extractToolUses(contentBlocks);
      }
      if (event.type === "user") {
        const extracted = extractToolResults(contentBlocks);
        if (extracted.length > 0) toolResults = extracted;
      }
    }

    // ─── Emit events IMMEDIATELY for fast rendering ─────
    if (isNewSession) {
      this.knownSessions.add(sessionId);
      this.emit("session:new", sessionId);
    }

    if (messageData) {
      this.emit("message:new", sessionId, event.uuid, messageData.role, messageData);
      // tool:update is emitted AFTER DB flush so status is queryable
    }

    if (event.type === "system") {
      this.emit("session:update", sessionId);
    }

    // ─── Flush to DB asynchronously for data integrity ─────
    this.flushQueue = this.flushQueue.then(() =>
      this.flushToDB(event, sessionId, projectPath, seq, isNewSession, messageData, toolUses, toolResults).catch((err) => {
        this.emit("error", err instanceof Error ? err : new Error(`DB flush failed: ${err}`));
      })
    );
  }

  private async flushToDB(
    event: any,
    sessionId: string,
    projectPath: string,
    seq: number,
    isNewSession: boolean,
    messageData: any,
    toolUses: any[],
    toolResults: any[],
  ): Promise<void> {
    await this.store.transact(async (tx) => {
      // Store raw event
      await this.store.insertRawEvent({
        sessionId,
        eventType: event.type,
        data: event.data,
        filePath: "",
        lineNumber: seq,
      }, tx);

      // Ensure session exists
      if (isNewSession) {
        const cwd = (event.data as any).cwd || projectPath;
        await this.store.upsertSession({
          id: sessionId,
          projectPath,
          cwd,
          startedAt: new Date(event.timestamp),
          status: "active",
        }, tx);
      }

      if (messageData) {
        // Auto-generate session title from first real user message
        if (messageData.role === "user" && !this.titledSessions.has(sessionId) && messageData.content && !(event.data as any).toolUseResult) {
          this.titledSessions.add(sessionId);
          await this.store.upsertSession({
            id: sessionId,
            projectPath,
            startedAt: new Date(event.timestamp),
            status: "active",
            title: deriveSessionTitle(messageData.content),
          }, tx);
        }

        await this.store.insertMessage({
          sessionId: messageData.sessionId,
          uuid: messageData.uuid,
          parentUuid: messageData.parentUuid,
          role: messageData.role,
          content: messageData.content,
          contentBlocks: messageData.contentBlocks,
          thinking: messageData.thinking,
          isSidechain: messageData.isSidechain,
          isMeta: messageData.isMeta,
          sequenceNum: messageData.sequenceNum,
          timestamp: new Date(event.timestamp),
        }, tx);

        // Insert tool_use blocks
        for (const tu of toolUses) {
          await this.store.insertToolCall({
            sessionId,
            messageUuid: messageData.uuid,
            toolUseId: tu.id,
            toolName: tu.name,
            input: tu.input,
            status: "pending",
          }, tx);
        }

        // Complete tool_result blocks
        for (const tr of toolResults) {
          const error = tr.isError ? tr.output : null;
          const output = tr.isError ? null : tr.output;
          await this.store.completeToolCall(tr.toolUseId, output, error, messageData.uuid, tx);
        }
      }

      if (event.type === "system") {
        await this.store.insertMessage({
          sessionId,
          uuid: event.uuid,
          parentUuid: event.parentUuid,
          role: "system",
          content: `Context compacted: ${(event.data as any).messageCount || 0} messages in ${(event.data as any).durationMs || 0}ms`,
          contentBlocks: [],
          thinking: null,
          isSidechain: event.isSidechain,
          isMeta: event.isMeta,
          sequenceNum: seq,
          timestamp: new Date(event.timestamp),
          metadata: {
            subtype: (event.data as any).subtype,
            durationMs: (event.data as any).durationMs,
            messageCount: (event.data as any).messageCount,
          },
        }, tx);
      }
    });

    // Emit tool:update AFTER DB commit so status is queryable
    for (const tr of toolResults) {
      this.emit("tool:update", sessionId, tr.toolUseId);
    }
  }

  private deriveSessionTitle(content: string): string {
    return deriveSessionTitle(content);
  }

  private deriveProjectPath(filePath: string): string {
    const parts = filePath.split("/");
    const projectsIdx = parts.indexOf("projects");
    if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
      return parts[projectsIdx + 1]!;
    }
    return dirname(filePath);
  }
}

/** Derive a clean title from the first user message (like claude-plus-plus). */
function deriveSessionTitle(content: string): string {
  // Strip XML/HTML tags, command markers, skill invocations
  const cleaned = content
    .replace(/<[^>]+>/g, "")
    .replace(/^\[(?:Request interrupted|Image #\d+)\].*$/m, "")
    .replace(/^Base directory for this skill:.*$/m, "")
    .replace(/^\s*\/\w+.*$/m, "");
  const firstLine = (cleaned.split("\n").find((l) => l.trim()) || cleaned).trim();
  return firstLine.replace(/\s+/g, " ").slice(0, 80);
}
