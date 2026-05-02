import { useState, useMemo } from "react";
import type { Session } from "../api/client";

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHide: (id: string) => void;
  onSearchOpen: () => void;
  isConnected: boolean;
}

export function SessionSidebar({ sessions, selectedId, onSelect, onHide, onSearchOpen, isConnected }: Props) {
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#6B6B6B" }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>Sessions</span>
        </div>

        {/* Global search bar */}
        <div
          onClick={onSearchOpen}
          style={{
            width: "100%",
            padding: "7px 12px",
            borderRadius: 10,
            background: "#EAEAE6",
            color: "#999",
            fontSize: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 6,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search all conversations
          <kbd style={{ marginLeft: "auto", padding: "1px 4px", borderRadius: 3, background: "#E2E2DE", border: "1px solid #D5D5D2", fontSize: 10, color: "#999" }}>{"\u2318"}K</kbd>
        </div>

        {/* Local filter */}
        <input
          type="text"
          placeholder="Filter sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "5px 10px",
            border: "1px solid #E5E5E2",
            borderRadius: 8,
            background: "transparent",
            color: "#1A1A1A",
            fontFamily: "inherit",
            fontSize: 11,
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
                color: "#999",
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
                    background: sel ? "#E8E8E5" : "transparent",
                    transition: "background 0.1s",
                    marginBottom: 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!sel) e.currentTarget.style.background = "#EAEAE6";
                  }}
                  onMouseLeave={(e) => {
                    if (!sel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: sel ? "#1A1A1A" : "#6B6B6B",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.4,
                      }}
                    >
                      {cleanTitle(s.title) || s.id.slice(0, 8)}
                    </div>
                    <button
                      className="hide-btn"
                      onClick={(e) => { e.stopPropagation(); onHide(s.id); }}
                      title="Hide session"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#CCC",
                        cursor: "pointer",
                        padding: 2,
                        borderRadius: 4,
                        display: "none",
                        flexShrink: 0,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                    {projectName(s.projectPath)}
                    {s.messageCount != null && s.messageCount > 0 && ` \u00B7 ${s.messageCount} msgs`}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>
            {search ? "No matches" : "No sessions yet"}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid #E5E5E2",
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
          <div style={{ fontSize: 12, fontWeight: 500, color: "#1A1A1A" }}>Local</div>
          <div style={{ fontSize: 10, color: "#999" }}>PostgreSQL</div>
        </div>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isConnected ? "#16a34a" : "#dc2626",
            boxShadow: isConnected ? "0 0 6px rgba(22, 163, 74, 0.4)" : "none",
          }}
        />
      </div>

      <style>{`
        .sidebar {
          width: 280px;
          min-width: 280px;
          background: #F5F4F2;
          display: flex;
          flex-direction: column;
          height: 100vh;
          border-right: 1px solid #E5E5E2;
        }
        .sidebar div:hover > div > .hide-btn { display: block !important; }
        .hide-btn:hover { color: #dc2626 !important; }
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
    .replace(/<[^>]+>/g, "")
    .replace(/^\[Request interrupted.*?\]\s*/, "")
    .replace(/^\[Image #\d+\]\s*/, "")
    .replace(/^Base directory for this skill:.*/, "")
    .replace(/^\/\w+.*/, "")
    .trim()
    .slice(0, 80);
}
