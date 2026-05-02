import { useState } from "react";

export function ThinkingBlock({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: 6 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: "transparent",
          border: "none",
          color: "#6B6B6B",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          padding: "4px 0",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#1A1A1A")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6B6B")}
      >
        {/* Clock icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        Thinking
        <span style={{ color: "#999" }}>
          ({content.length > 1000 ? `${(content.length / 1000).toFixed(1)}k` : content.length} chars)
        </span>
        <span style={{ fontSize: 8, transform: collapsed ? "rotate(0)" : "rotate(90deg)", transition: "transform 0.1s", display: "inline-block" }}>
          {"\u25B6"}
        </span>
      </button>
      {!collapsed && (
        <div
          style={{
            marginTop: 4,
            padding: "12px 16px",
            background: "transparent",
            borderLeft: "2px solid #D9D9D6",
            color: "#6B6B6B",
            fontSize: 14,
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 500,
            overflowY: "auto",
          }}
        >
          {content.length > 800 ? (
            <CollapsibleText content={content} />
          ) : (
            content
          )}
        </div>
      )}
    </div>
  );
}

function CollapsibleText({ content }: { content: string }) {
  const [showAll, setShowAll] = useState(false);

  if (showAll) {
    return <>{content}</>;
  }

  return (
    <>
      {content.slice(0, 800)}...
      <button
        onClick={() => setShowAll(true)}
        style={{
          background: "none",
          border: "none",
          color: "#6B6B6B",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 13,
          padding: "4px 0",
          display: "block",
          marginTop: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#1A1A1A")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6B6B")}
      >
        Show more
      </button>
    </>
  );
}
