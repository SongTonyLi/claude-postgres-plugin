import { useState } from "react";
import type { ToolCall } from "../api/client";

interface Props {
  toolName: string;
  input: unknown;
  result?: ToolCall;
}

export function ToolCallBlock({ toolName, input, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const statusColor =
    result?.status === "completed"
      ? "var(--accent-green)"
      : result?.status === "failed"
        ? "var(--accent-red)"
        : "var(--accent-yellow)";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        marginBottom: 8,
        background: "var(--bg-primary)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "none",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          textAlign: "left",
        }}
      >
        <span
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0)",
            transition: "transform 0.15s",
            display: "inline-block",
            fontSize: 10,
          }}
        >
          {"\u25B6"}
        </span>
        <span style={{ color: "var(--accent-cyan)", fontWeight: 500 }}>{toolName}</span>
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {formatInputSummary(toolName, input)}
        </span>
        <span style={{ color: statusColor, fontSize: 11, flexShrink: 0 }}>
          {result?.status === "completed" ? "\u2713" : result?.status === "failed" ? "\u2717" : "\u25CF"}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>Input</div>
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {formatInput(toolName, input)}
            </pre>
          </div>
          {result?.output && (
            <div>
              <div style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>Output</div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  maxHeight: 400,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {result.output.length > 3000
                  ? result.output.slice(0, 3000) + "\n... (truncated)"
                  : result.output}
              </pre>
            </div>
          )}
          {result?.error && (
            <div>
              <div style={{ color: "var(--accent-red)", fontSize: 11, marginBottom: 4 }}>Error</div>
              <pre style={{ margin: 0, fontSize: 12, color: "var(--accent-red)" }}>{result.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatInputSummary(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  if (toolName === "Read" && obj.file_path) return String(obj.file_path);
  if (toolName === "Write" && obj.file_path) return String(obj.file_path);
  if (toolName === "Edit" && obj.file_path) return String(obj.file_path);
  if (toolName === "Bash" && obj.command) return String(obj.command).slice(0, 60);
  if (toolName === "Glob" && obj.pattern) return String(obj.pattern);
  if (toolName === "Grep" && obj.pattern) return `/${obj.pattern}/`;
  if (toolName === "Agent" && obj.description) return String(obj.description);
  return "";
}

function formatInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return JSON.stringify(input, null, 2);
  const obj = input as Record<string, unknown>;
  if (toolName === "Read" && obj.file_path) return String(obj.file_path);
  if (toolName === "Write" && obj.file_path)
    return `${obj.file_path}\n\n${String(obj.content || "").slice(0, 500)}`;
  if (toolName === "Edit" && obj.file_path)
    return `${obj.file_path}\n\n- ${String(obj.old_string || "").slice(0, 200)}\n+ ${String(obj.new_string || "").slice(0, 200)}`;
  if (toolName === "Bash" && obj.command) return String(obj.command);
  if (toolName === "Glob") return `pattern: ${obj.pattern}${obj.path ? `\npath: ${obj.path}` : ""}`;
  if (toolName === "Grep") return `pattern: /${obj.pattern}/${obj.glob ? `\nglob: ${obj.glob}` : ""}`;
  return JSON.stringify(obj, null, 2);
}
