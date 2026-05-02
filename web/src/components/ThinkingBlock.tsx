import { useState } from "react";

export function ThinkingBlock({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: "rgba(167, 139, 250, 0.08)",
          border: "none",
          borderRadius: 8,
          color: "#a78bfa",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          padding: "4px 10px",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          transition: "background 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(167, 139, 250, 0.14)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(167, 139, 250, 0.08)")}
      >
        <span style={{ fontSize: 8, transform: collapsed ? "rotate(0)" : "rotate(90deg)", transition: "transform 0.1s", display: "inline-block" }}>
          {"\u25B6"}
        </span>
        Thinking
        <span style={{ color: "#666" }}>
          ({content.length > 1000 ? `${(content.length / 1000).toFixed(1)}k` : content.length} chars)
        </span>
      </button>
      {!collapsed && (
        <div
          style={{
            marginTop: 4,
            padding: "10px 14px",
            background: "rgba(167, 139, 250, 0.06)",
            borderRadius: 10,
            borderLeft: "2px solid #a78bfa",
            color: "#888",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
