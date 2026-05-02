import { useState } from "react";
import type { ToolCall } from "../api/client";

interface Props {
  toolName: string;
  input: unknown;
  result?: ToolCall;
}

export function ToolCallBlock({ toolName, input, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const ok = result?.status === "completed";
  const fail = result?.status === "failed";
  const summary = inputSummary(toolName, input);

  return (
    <div
      style={{
        margin: "6px 0",
        borderRadius: 12,
        border: "1px solid #333",
        background: "#1e1e1e",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          cursor: "pointer",
          userSelect: "none",
          fontSize: 13,
        }}
      >
        <span style={{ fontSize: 8, color: "#666", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.1s", display: "inline-block" }}>
          {"\u25B6"}
        </span>
        <span style={{ fontWeight: 600, color: "#06b6d4", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{toolName}</span>
        <span style={{ flex: 1, color: "#555", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace" }}>
          {summary}
        </span>
        <span style={{ color: ok ? "#22c55e" : fail ? "#ef4444" : "#eab308", fontSize: 12 }}>
          {ok ? "\u2713" : fail ? "\u2717" : "\u2022"}
        </span>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid #333" }}>
          <div style={{ padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: "#666", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Input</div>
            <pre style={{ margin: 0, fontSize: 12, color: "#a1a1a1", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#171717", padding: "8px 12px", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, maxHeight: 200, overflowY: "auto" }}>
              {formatInput(toolName, input)}
            </pre>
          </div>
          {result?.output && (
            <div style={{ padding: "0 12px 8px" }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Output</div>
              <pre style={{ margin: 0, fontSize: 12, color: "#a1a1a1", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#171717", padding: "8px 12px", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, maxHeight: 350, overflowY: "auto" }}>
                {result.output.length > 4000 ? result.output.slice(0, 4000) + "\n\n--- truncated ---" : result.output}
              </pre>
            </div>
          )}
          {result?.error && (
            <div style={{ padding: "0 12px 8px" }}>
              <div style={{ fontSize: 10, color: "#ef4444", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Error</div>
              <pre style={{ margin: 0, fontSize: 12, color: "#ef4444", whiteSpace: "pre-wrap", background: "rgba(239,68,68,0.06)", padding: "8px 12px", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace" }}>
                {result.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function inputSummary(n: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  if (n === "Read" && o.file_path) return String(o.file_path);
  if (n === "Write" && o.file_path) return String(o.file_path);
  if (n === "Edit" && o.file_path) return String(o.file_path);
  if (n === "Bash" && o.command) return String(o.command).slice(0, 80);
  if (n === "Glob" && o.pattern) return String(o.pattern);
  if (n === "Grep" && o.pattern) return `/${o.pattern}/`;
  if (n === "Agent" && o.description) return String(o.description).slice(0, 60);
  return "";
}

function formatInput(n: string, input: unknown): string {
  if (!input || typeof input !== "object") return String(input);
  const o = input as Record<string, unknown>;
  if (n === "Read") return String(o.file_path || "");
  if (n === "Bash") return String(o.command || "");
  if (n === "Glob") return `pattern: ${o.pattern}${o.path ? `\npath: ${o.path}` : ""}`;
  if (n === "Grep") return `/${o.pattern}/${o.glob ? `  glob: ${o.glob}` : ""}`;
  if (n === "Edit") return `${o.file_path}\n- ${String(o.old_string || "").slice(0, 300)}\n+ ${String(o.new_string || "").slice(0, 300)}`;
  if (n === "Write") return `${o.file_path}\n${String(o.content || "").slice(0, 500)}`;
  return JSON.stringify(o, null, 2);
}
