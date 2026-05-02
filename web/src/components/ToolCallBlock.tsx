import { useState, useMemo } from "react";
import type { ToolCall } from "../api/client";

const SPINNER_VERBS = [
  "Accomplishing", "Architecting", "Brewing", "Calculating", "Clauding",
  "Cogitating", "Computing", "Crafting", "Crunching", "Forging",
  "Generating", "Noodling", "Processing", "Synthesizing", "Vibing", "Working",
];

interface Props {
  toolName: string;
  input: unknown;
  result?: ToolCall;
}

export function ToolCallBlock({ toolName, input, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = result?.output != null || result?.error != null;
  const fail = result?.status === "failed" || (hasOutput && result?.error != null);
  const ok = result?.status === "completed" || (hasOutput && !fail);
  const pending = !ok && !fail;
  const summary = inputSummary(toolName, input);
  const verb = useMemo(() => SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)], []);

  return (
    <div
      style={{
        margin: "6px 0",
        borderRadius: 12,
        border: "1px solid #E5E5E2",
        background: "#FAFAF8",
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
        <span style={{ fontSize: 8, color: "#999", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.1s", display: "inline-block" }}>
          {"\u25B6"}
        </span>
        <span style={{ fontWeight: 600, color: "#0891b2", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{toolName}</span>
        <span style={{ flex: 1, minWidth: 0, color: "#999", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'JetBrains Mono', monospace" }}>
          {summary}
        </span>
        {pending ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#999", fontSize: 11, fontFamily: "var(--font-sans)", flexShrink: 0 }}>
            <span className="spin" style={{ width: 12, height: 12, display: "inline-block" }}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style={{ width: "100%", fill: "#D97706" }}>
                <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
              </svg>
            </span>
            {verb}...
          </span>
        ) : (
          <span style={{ color: ok ? "#16a34a" : "#dc2626", fontSize: 12 }}>
            {ok ? "\u2713" : "\u2717"}
          </span>
        )}
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid #E5E5E2" }}>
          <div style={{ padding: "8px 12px" }}>
            <div style={{ fontSize: 10, color: "#999", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Input</div>
            <pre style={{ margin: 0, fontSize: 12, color: "#6B6B6B", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#F5F5F0", padding: "8px 12px", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, maxHeight: 200, overflowY: "auto" }}>
              {formatInput(toolName, input)}
            </pre>
          </div>
          {result?.output && (
            <div style={{ padding: "0 12px 8px" }}>
              <div style={{ fontSize: 10, color: "#999", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Output</div>
              <pre style={{ margin: 0, fontSize: 12, color: "#6B6B6B", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#F5F5F0", padding: "8px 12px", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5, maxHeight: 350, overflowY: "auto" }}>
                {result.output.length > 4000 ? result.output.slice(0, 4000) + "\n\n--- truncated ---" : result.output}
              </pre>
            </div>
          )}
          {result?.error && (
            <div style={{ padding: "0 12px 8px" }}>
              <div style={{ fontSize: 10, color: "#dc2626", marginBottom: 4, fontWeight: 600, textTransform: "uppercase" }}>Error</div>
              <pre style={{ margin: 0, fontSize: 12, color: "#dc2626", whiteSpace: "pre-wrap", background: "rgba(220,38,38,0.04)", padding: "8px 12px", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace" }}>
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
