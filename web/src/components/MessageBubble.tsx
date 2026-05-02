import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { ContentBlock, ToolCall } from "../api/client";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallBlock } from "./ToolCallBlock";

interface Props {
  role: string;
  content: string | null;
  contentBlocks: ContentBlock[];
  thinking: string | null;
  isMeta: boolean;
  toolCalls: Map<string, ToolCall>;
}

function ClaudeLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L12.9 8.1M12 22L12.9 15.9M2 12L8.1 12.9M22 12L15.9 12.9M4.93 4.93L9.17 9.17M19.07 19.07L14.83 14.83M4.93 19.07L9.17 14.83M19.07 4.93L14.83 9.17"
        stroke="#D97706"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px 8px",
        borderRadius: 6,
        color: copied ? "#16a34a" : "#999",
        display: "flex",
        alignItems: "center",
        gap: 4,
        transition: "all 0.15s",
        fontSize: 12,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
      onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.color = "#6B6B6B"; e.currentTarget.style.background = "#F0F0EC"; } }}
      onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.color = "#999"; e.currentTarget.style.background = "none"; } }}
    >
      {copied ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export function MessageBubble({ role, content, contentBlocks: rawBlocks, thinking, isMeta, toolCalls }: Props) {
  if (isMeta) return null;

  // Safety: handle contentBlocks being a string (old data or raw string content)
  const contentBlocks: ContentBlock[] = Array.isArray(rawBlocks) ? rawBlocks : [];

  // System compaction marker
  if (role === "system") {
    return (
      <div style={{ padding: "8px 20px", display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
        <span
          style={{
            fontSize: 11,
            color: "#ca8a04",
            background: "rgba(202, 138, 4, 0.06)",
            padding: "3px 10px",
            borderRadius: 8,
          }}
        >
          {content || "context compacted"}
        </span>
      </div>
    );
  }

  const isUser = role === "user";
  const isToolResult = contentBlocks.some((b) => b.type === "tool_result");

  // ─── Tool result messages: show inline with output ─────
  if (isToolResult) {
    return (
      <div className="fade-up" style={{ padding: "2px 20px 2px 20px" }}>
        {contentBlocks.map((block, i) => {
          if (block.type !== "tool_result") return null;
          const resultContent =
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? (block.content as any[])
                    .filter((c: any) => c.type === "text")
                    .map((c: any) => c.text)
                    .join("\n")
                : "";
          if (!resultContent) return null;

          return (
            <div
              key={i}
              style={{
                background: block.is_error ? "rgba(220, 38, 38, 0.04)" : "#F5F5F0",
                border: `1px solid ${block.is_error ? "rgba(220, 38, 38, 0.15)" : "#E5E5E2"}`,
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                color: block.is_error ? "#dc2626" : "#6B6B6B",
                maxHeight: 200,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                lineHeight: 1.5,
                marginBottom: 4,
              }}
            >
              {resultContent.length > 2000
                ? resultContent.slice(0, 2000) + "\n... (truncated)"
                : resultContent}
            </div>
          );
        })}
      </div>
    );
  }

  // ─── User message: full-width warm gray block ─────
  if (isUser) {
    const text =
      contentBlocks
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n") || content || "";

    if (!text.trim()) return null;

    return (
      <div className="fade-up" style={{ padding: "8px 0" }}>
        <div
          style={{
            background: "#F5F5F0",
            borderRadius: 20,
            padding: "16px 24px",
            lineHeight: 1.7,
            color: "#1A1A1A",
          }}
          className="prose-chat"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {text}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // ─── Assistant message: skip if truly empty ─────
  const hasText = contentBlocks.some((b) => b.type === "text" && (b as any).text);
  const hasTools = contentBlocks.some((b) => b.type === "tool_use");
  if (!hasText && !hasTools && !thinking && !content) return null;

  // Collect all text for copy button
  const allText = contentBlocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text" && !!(b as any).text)
    .map((b) => b.text)
    .join("\n") || content || "";

  // ─── Assistant message: clean layout with copy + logo ─────
  return (
    <div className="fade-up" style={{ padding: "8px 0" }}>
      <div style={{ minWidth: 0 }}>
        {thinking && <ThinkingBlock content={thinking} />}

        {contentBlocks.map((block, i) => {
          if (block.type === "text" && block.text) {
            return (
              <div key={i} className="prose-chat">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {block.text}
                </ReactMarkdown>
              </div>
            );
          }
          if (block.type === "tool_use") {
            return (
              <ToolCallBlock
                key={i}
                toolName={block.name}
                input={block.input}
                result={toolCalls.get(block.id)}
              />
            );
          }
          return null;
        })}

        {contentBlocks.length === 0 && content && (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {content}
            </ReactMarkdown>
          </div>
        )}

        {/* Copy button + Claude logo */}
        {hasText && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
            <CopyButton text={allText} />
          </div>
        )}
      </div>
    </div>
  );
}
