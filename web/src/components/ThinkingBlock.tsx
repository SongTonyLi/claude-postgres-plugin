import { useState } from "react";

interface Props {
  content: string;
}

export function ThinkingBlock({ content }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ borderLeft: "2px solid var(--accent-purple)", marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none",
          border: "none",
          color: "var(--accent-purple)",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 12,
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0)",
            transition: "transform 0.15s",
            display: "inline-block",
          }}
        >
          {"\u25B6"}
        </span>
        Thinking
        <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
          ({content.length} chars)
        </span>
      </button>
      {expanded && (
        <div
          style={{
            padding: "8px 12px",
            color: "var(--text-secondary)",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 400,
            overflowY: "auto",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
