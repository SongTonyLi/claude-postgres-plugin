import { useState } from "react";
import type { Session } from "../api/client";

interface SessionWithStats extends Session {
  messageCount?: number;
  toolCount?: number;
}

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isConnected: boolean;
}

export function SessionSidebar({ sessions, selectedId, onSelect, isConnected }: Props) {
  const [search, setSearch] = useState("");

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.title || "").toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.projectPath.toLowerCase().includes(q)
    );
  });

  return (
    <div
      style={{
        width: 320,
        minWidth: 320,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent-blue)" }}>
            Claude Sessions
          </span>
          <span
            style={{
              marginLeft: "auto",
              padding: "2px 6px",
              borderRadius: 8,
              fontSize: 10,
              background: isConnected ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)",
              color: isConnected ? "var(--accent-green)" : "var(--accent-red)",
            }}
          >
            {isConnected ? "live" : "offline"}
          </span>
        </div>
        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            fontFamily: "inherit",
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 4 }}>
        {filtered.map((s) => {
          const isSelected = selectedId === s.id;
          const projectName = decodeProjectPath(s.projectPath);
          const summary = truncateTitle(s.title, 55);

          return (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                padding: "10px 12px",
                borderRadius: 6,
                background: isSelected ? "var(--bg-tertiary)" : "transparent",
                borderLeft: isSelected ? "2px solid var(--accent-blue)" : "2px solid transparent",
                cursor: "pointer",
                marginBottom: 1,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              {/* Title row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: s.status === "active" ? "var(--accent-green)" : "var(--text-muted)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontWeight: 500,
                    fontSize: 12,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {summary || s.id.slice(0, 8) + "..."}
                </span>
              </div>

              {/* Meta row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-muted)",
                  fontSize: 11,
                }}
              >
                <span>{formatDate(s.startedAt)}</span>
                <span style={{ opacity: 0.5 }}>/</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {projectName}
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            {search ? "No matching sessions" : "No sessions yet"}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          color: "var(--text-muted)",
          fontSize: 11,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{sessions.length} total</span>
        <span>{sessions.filter((s) => s.status === "active").length} active</span>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function decodeProjectPath(path: string): string {
  const parts = path.replace(/^-/, "").split("-");
  const meaningful = parts.filter(
    (p) => !["Users", "songli", "private", "tmp", "var", "folders"].includes(p) && p.length > 0
  );
  const result = meaningful.slice(-2).join("/");
  return result || path.slice(0, 15);
}

function truncateTitle(title: string | null, maxLen: number): string {
  if (!title) return "";
  // Remove common prefixes that aren't useful
  let t = title.replace(/^\[Request interrupted.*?\]\s*/, "").replace(/^\[Image #\d+\]\s*/, "");
  if (t.length > maxLen) return t.slice(0, maxLen) + "...";
  return t;
}
