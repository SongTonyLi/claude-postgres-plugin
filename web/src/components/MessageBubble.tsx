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
        fontFamily: "var(--font-sans)",
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

function UserMessageContent({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const maxHeight = 200;
  const isLong = text.length > 600;

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          maxHeight: !expanded && isLong ? maxHeight : "none",
          overflow: "hidden",
          position: "relative",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</div>
        {!expanded && isLong && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 48,
              background: "linear-gradient(to top, #F0F0EC 0%, transparent 100%)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      {isLong && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          style={{
            background: "none",
            border: "none",
            color: "rgba(107, 107, 107, 0.8)",
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            padding: "4px 0 12px",
            textAlign: "left",
            width: "75%",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1A1A1A")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(107, 107, 107, 0.8)")}
        >
          Show more
        </button>
      )}
    </div>
  );
}

export function MessageBubble({ role, content, contentBlocks: rawBlocks, thinking, isMeta, toolCalls }: Props) {
  if (isMeta) return null;

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
            fontFamily: "var(--font-sans)",
          }}
        >
          {content || "context compacted"}
        </span>
      </div>
    );
  }

  const isUser = role === "user";
  const isToolResult = contentBlocks.some((b) => b.type === "tool_result");

  // ─── Tool result messages ─────
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

  // ─── User message: right-aligned bubble, sans-serif ─────
  if (isUser) {
    const text =
      contentBlocks
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n") || content || "";

    if (!text.trim()) return null;

    return (
      <div className="fade-up" style={{ padding: "8px 20px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <div
          style={{
            maxWidth: "85%",
            background: "#F0F0EC",
            borderRadius: "16px",
            padding: "10px 16px",
            lineHeight: 1.6,
            color: "#1A1A1A",
            fontFamily: "var(--font-sans)",
          }}
        >
          <UserMessageContent text={text} />
        </div>
      </div>
    );
  }

  // ─── Assistant message: skip if truly empty ─────
  const hasText = contentBlocks.some((b) => b.type === "text" && (b as any).text);
  const hasTools = contentBlocks.some((b) => b.type === "tool_use");
  if (!hasText && !hasTools && !thinking && !content) return null;

  const allText = contentBlocks
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text" && !!(b as any).text)
    .map((b) => b.text)
    .join("\n") || content || "";

  // ─── Assistant message: serif font, copy button, Claude logo ─────
  return (
    <div className="fade-up" style={{ padding: "12px 20px" }}>
      <div style={{ minWidth: 0, fontFamily: "var(--font-serif)", lineHeight: "1.65rem" }}>
        {thinking && <ThinkingBlock content={thinking} />}

        {contentBlocks.map((block, i) => {
          if (block.type === "text" && block.text) {
            return (
              <div key={i} className="prose-chat" style={{ fontFamily: "var(--font-serif)" }}>
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
          <div className="prose-chat" style={{ fontFamily: "var(--font-serif)" }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {content}
            </ReactMarkdown>
          </div>
        )}

        {hasText && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
            <CopyButton text={allText} />
          </div>
        )}
      </div>
    </div>
  );
}
