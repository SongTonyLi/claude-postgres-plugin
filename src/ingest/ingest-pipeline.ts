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
  "message:new": (sessionId: string, uuid: string, role: string) => void;
  "tool:update": (sessionId: string, toolUseId: string) => void;
  error: (error: Error) => void;
}

export class IngestPipeline extends EventEmitter<PipelineEvents> {
  readonly watcher: SessionWatcher;
  private store: ConversationStore;
  private knownSessions: Set<string> = new Set();
  private titledSessions: Set<string> = new Set();
  private queue: Promise<void> = Promise.resolve();

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
  }

  private async processLine(filePath: string, line: string, lineNumber: number): Promise<void> {
    const event = parseSessionLine(line);
    if (!event) return;

    const sessionId = event.sessionId || basename(filePath, ".jsonl");
    if (!sessionId) return;

    const isNewSession = !this.knownSessions.has(sessionId);
    const projectPath = this.deriveProjectPath(filePath);
    const seq = lineNumber;

    // Wrap all DB writes in a single ACID transaction
    await this.store.transact(async (tx) => {
      // Store raw event
      await this.store.insertRawEvent({
        sessionId,
        eventType: event.type,
        data: event.data,
        filePath,
        lineNumber,
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
        this.knownSessions.add(sessionId);
      }

      if (event.type === "user" || event.type === "assistant") {
        const message = (event.data as any).message;
        if (!message) return;

        const rawContent = message.content;
        const contentBlocks = Array.isArray(rawContent) ? rawContent : [];
        const textContent = typeof rawContent === "string" ? rawContent : extractTextContent(contentBlocks);
        const thinking = extractThinking(contentBlocks);

        // Auto-generate session title from first real user message
        if (event.type === "user" && !this.titledSessions.has(sessionId) && textContent && !(event.data as any).toolUseResult) {
          this.titledSessions.add(sessionId);
          await this.store.upsertSession({
            id: sessionId,
            projectPath,
            startedAt: new Date(event.timestamp),
            status: "active",
            title: textContent.slice(0, 100),
          }, tx);
        }

        await this.store.insertMessage({
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
          timestamp: new Date(event.timestamp),
        }, tx);

        // Extract tool_use blocks from assistant messages
        if (event.type === "assistant") {
          const toolUses = extractToolUses(contentBlocks);
          for (const tu of toolUses) {
            await this.store.insertToolCall({
              sessionId,
              messageUuid: event.uuid,
              toolUseId: tu.id,
              toolName: tu.name,
              input: tu.input,
              status: "pending",
            }, tx);
          }
        }

        // Extract tool_result blocks from user messages — populate result_uuid
        if (event.type === "user" && (event.data as any).toolUseResult) {
          const results = extractToolResults(contentBlocks);
          for (const tr of results) {
            const error = tr.isError ? tr.output : null;
            const output = tr.isError ? null : tr.output;
            await this.store.completeToolCall(tr.toolUseId, output, error, event.uuid, tx);
          }
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

    // Emit events AFTER transaction commits successfully
    if (isNewSession) this.emit("session:new", sessionId);

    if (event.type === "user" || event.type === "assistant") {
      this.emit("message:new", sessionId, event.uuid, event.type);

      if (event.type === "user" && (event.data as any).toolUseResult) {
        const contentBlocks = Array.isArray((event.data as any).message?.content) ? (event.data as any).message.content : [];
        const results = extractToolResults(contentBlocks);
        for (const tr of results) {
          this.emit("tool:update", sessionId, tr.toolUseId);
        }
      }
    }

    if (event.type === "system") {
      this.emit("session:update", sessionId);
    }
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
