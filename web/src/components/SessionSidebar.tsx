import type { Session } from "../api/client";

interface Props {
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isConnected: boolean;
}

export function SessionSidebar({ sessions, selectedId, onSelect, isConnected }: Props) {
  return (
    <div
      style={{
        width: 300,
        minWidth: 300,
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
          padding: "16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--accent-purple)" }}>cpg</span>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
        <span
          style={{
            marginLeft: "auto",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: isConnected ? "var(--accent-green)" : "var(--accent-red)",
          }}
          title={isConnected ? "SSE connected" : "SSE disconnected"}
        />
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            style={{
              display: "block",
              width: "100%",
              padding: "10px 12px",
              border: "none",
              borderRadius: 6,
              background: selectedId === s.id ? "var(--bg-tertiary)" : "transparent",
              color: "var(--text-primary)",
              textAlign: "left",
              cursor: "pointer",
              marginBottom: 2,
              fontFamily: "inherit",
              fontSize: 13,
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (selectedId !== s.id)
                (e.target as HTMLElement).style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              if (selectedId !== s.id) (e.target as HTMLElement).style.background = "transparent";
            }}
          >
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
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background:
                    s.status === "active" ? "var(--accent-green)" : "var(--text-muted)",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                }}
              >
                {s.title || s.id.slice(0, 8)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "var(--text-secondary)",
                fontSize: 11,
              }}
            >
              <span>{formatDate(s.startedAt)}</span>
              <span style={{ color: "var(--text-muted)" }}>
                {decodeProjectPath(s.projectPath)}
              </span>
            </div>
          </button>
        ))}
        {sessions.length === 0 && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 12,
            }}
          >
            No sessions yet.
            <br />
            Start a claude-code session to see it here.
          </div>
        )}
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
  // Convert "-Users-songli-project-name" to "project-name"
  const parts = path.replace(/^-/, "").split("-");
  // Take last 1-2 meaningful segments
  const meaningful = parts.filter((p) => p !== "Users" && p !== "songli" && p.length > 0);
  return meaningful.slice(-2).join("/") || path.slice(0, 12);
}
