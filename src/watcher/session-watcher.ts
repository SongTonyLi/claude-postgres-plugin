import { watch, readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { homedir } from "os";
import EventEmitter from "eventemitter3";

export interface WatcherEvents {
  line: (filePath: string, line: string, lineNumber: number) => void;
  error: (error: Error) => void;
  ready: () => void;
}

export class SessionWatcher extends EventEmitter<WatcherEvents> {
  private fileOffsets: Map<string, number> = new Map();
  private watchPath: string;
  private abortController: AbortController | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private knownFiles: Set<string> = new Set();

  constructor(watchPath?: string) {
    super();
    this.watchPath = watchPath || join(homedir(), ".claude", "projects");
  }

  start(): void {
    this.abortController = new AbortController();

    // Initial scan for existing JSONL files
    this.scanDirectory(this.watchPath);

    // Use fs.watch for real-time detection of new/changed files
    try {
      watch(this.watchPath, { recursive: true, signal: this.abortController.signal }, (eventType, filename) => {
        if (!filename || !filename.endsWith(".jsonl")) return;
        const filePath = join(this.watchPath, filename);
        if (existsSync(filePath)) {
          this.processFile(filePath);
        }
      });
    } catch (err) {
      // fs.watch with recursive may not work on all platforms, fall back to polling
      this.pollInterval = setInterval(() => this.scanDirectory(this.watchPath), 500);
    }

    // Also poll periodically to catch any missed changes
    this.pollInterval = setInterval(() => this.scanDirectory(this.watchPath), 2000);

    // Signal ready after initial scan
    setTimeout(() => this.emit("ready"), 100);
  }

  private scanDirectory(dir: string): void {
    try {
      if (!existsSync(dir)) return;
      const { readdirSync } = require("fs");
      const entries = readdirSync(dir, { withFileTypes: true, recursive: true }) as any[];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          const filePath = join(entry.parentPath || entry.path || dir, entry.name);
          this.processFile(filePath);
        }
      }
    } catch (err) {
      // Ignore scan errors
    }
  }

  processFile(filePath: string): void {
    try {
      if (!existsSync(filePath)) return;
      const content = readFileSync(filePath, "utf-8");
      const currentOffset = this.fileOffsets.get(filePath) || 0;

      if (content.length <= currentOffset) return;

      const newContent = content.slice(currentOffset);
      if (!newContent.trim()) return;

      const lines = newContent.split("\n");
      let lineOffset = currentOffset === 0
        ? 0
        : content.slice(0, currentOffset).split("\n").length - 1;

      for (const line of lines) {
        if (line.trim()) {
          this.emit("line", filePath, line, lineOffset);
          lineOffset++;
        }
      }

      this.fileOffsets.set(filePath, content.length);
    } catch (err) {
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  }

  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.fileOffsets.clear();
  }

  getWatchPath(): string {
    return this.watchPath;
  }
}
