import { useState, useMemo } from "react";
import type { Session } from "../api/client";

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isConnected: boolean;
}

export function SessionSidebar({ sessions, selectedId, onSelect, isConnected }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.title || "").toLowerCase().includes(q) ||
        s.projectPath.toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const grouped = useMemo(() => groupByTime(filtered), [filtered]);

  return (
    <div className="sidebar">
      {/* Header */}
      <div style={{ padding: "14px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#a1a1a1" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Claude Sessions</span>
        </div>

        <input
          type="text"
          placeholder="Search sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "7px 12px",
            border: "none",
            borderRadius: 10,
            background: "#262626",
            color: "#eee",
            fontFamily: "inherit",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
        {grouped.map(([label, items]) => (
          <div key={label}>
            <div
              style={{
                padding: "10px 8px 4px",
                fontSize: 11,
                fontWeight: 600,
                color: "#666",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {label}
            </div>
            {items.map((s) => {
              const sel = selectedId === s.id;
              return (
                <div
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: sel ? "#2e2e2e" : "transparent",
                    transition: "background 0.1s",
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!sel) e.currentTarget.style.background = "#262626";
                  }}
                  onMouseLeave={(e) => {
                    if (!sel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      color: sel ? "#eee" : "#a1a1a1",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.4,
                    }}
                  >
                    {cleanTitle(s.title) || s.id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                    {projectName(s.projectPath)}
                    {s.messageCount != null && s.messageCount > 0 && ` \u00B7 ${s.messageCount} msgs`}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#666", fontSize: 13 }}>
            {search ? "No matches" : "No sessions yet"}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid #2a2a2a",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          U
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>Local</div>
          <div style={{ fontSize: 10, color: "#666" }}>PostgreSQL</div>
        </div>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isConnected ? "#22c55e" : "#ef4444",
            boxShadow: isConnected ? "0 0 6px #22c55e" : "none",
          }}
        />
      </div>

      <style>{`
        .sidebar {
          width: 280px;
          min-width: 280px;
          background: #1e1e1e;
          display: flex;
          flex-direction: column;
          height: 100vh;
          border-right: 1px solid #2a2a2a;
        }
      `}</style>
    </div>
  );
}

function groupByTime(sessions: Session[]): [string, Session[]][] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const groups: Record<string, Session[]> = {};
  for (const s of sessions) {
    const d = new Date(s.startedAt);
    let label: string;
    if (d >= todayStart) label = "Today";
    else if (d >= yesterdayStart) label = "Yesterday";
    else if (d >= weekStart) label = "Previous 7 days";
    else label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    if (!groups[label]) groups[label] = [];
    groups[label]!.push(s);
  }

  return Object.entries(groups);
}

function projectName(path: string): string {
  const parts = path.replace(/^-/, "").split("-");
  const skip = new Set(["Users", "songli", "private", "tmp", "var", "folders"]);
  return parts.filter((p) => !skip.has(p) && p.length > 0).slice(-2).join("/") || "~";
}

function cleanTitle(title: string | null): string {
  if (!title) return "";
  return title
    .replace(/^\[Request interrupted.*?\]\s*/, "")
    .replace(/^\[Image #\d+\]\s*/, "")
    .replace(/^Base directory for this skill:.*/, "")
    .slice(0, 80);
}
