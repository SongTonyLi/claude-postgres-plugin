import { watch, readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
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
  private hasFsWatch = false;

  constructor(watchPath?: string) {
    super();
    this.watchPath = watchPath || join(homedir(), ".claude", "projects");
  }

  start(): void {
    this.abortController = new AbortController();

    // Initial scan
    this.scanDirectory(this.watchPath);

    // Try native fs.watch (fast, event-driven)
    try {
      watch(this.watchPath, { recursive: true, signal: this.abortController.signal }, (_eventType, filename) => {
        if (!filename || !filename.endsWith(".jsonl")) return;
        const filePath = join(this.watchPath, filename);
        if (existsSync(filePath)) {
          this.processFile(filePath);
        }
      });
      this.hasFsWatch = true;
      // Light polling fallback to catch edge cases fs.watch misses
      this.pollInterval = setInterval(() => this.scanDirectory(this.watchPath), 5000);
    } catch {
      // fs.watch recursive not supported — use polling only
      this.pollInterval = setInterval(() => this.scanDirectory(this.watchPath), 1000);
    }

    setTimeout(() => this.emit("ready"), 100);
  }

  private scanDirectory(dir: string): void {
    try {
      if (!existsSync(dir)) return;
      const entries = readdirSync(dir, { withFileTypes: true, recursive: true } as any) as any[];
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          const filePath = join(entry.parentPath || entry.path || dir, entry.name);
          this.processFile(filePath);
        }
      }
    } catch {
      // Ignore scan errors (permission, missing dirs)
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

      // Only advance offset to the last complete line (ends with \n)
      const lastNewline = newContent.lastIndexOf("\n");
      if (lastNewline === -1) return; // No complete line yet

      const completeContent = newContent.slice(0, lastNewline);
      const lines = completeContent.split("\n");

      let lineOffset = currentOffset === 0
        ? 0
        : content.slice(0, currentOffset).split("\n").length - 1;

      for (const line of lines) {
        if (line.trim()) {
          this.emit("line", filePath, line, lineOffset);
          lineOffset++;
        }
      }

      // Advance offset to end of last complete line only
      this.fileOffsets.set(filePath, currentOffset + lastNewline + 1);
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
