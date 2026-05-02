import { useState } from "react";

function ClaudeSpinner({ size = 20 }: { size?: number }) {
  return (
    <div className="spin" style={{ width: size, height: size, flexShrink: 0 }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style={{ width: "100%", fill: "#D97706" }}>
        <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
      </svg>
    </div>
  );
}

export function ThinkingBlock({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          background: "transparent",
          border: "none",
          color: "#6B6B6B",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          padding: "6px 0",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#1A1A1A")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6B6B")}
      >
        <ClaudeSpinner size={20} />
        Thinking
        <span style={{ fontSize: 8, transform: collapsed ? "rotate(0)" : "rotate(90deg)", transition: "transform 0.15s", display: "inline-block" }}>
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
          fontFamily: "var(--font-sans)",
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
