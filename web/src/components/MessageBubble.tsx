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
            color: "#eab308",
            background: "rgba(234, 179, 8, 0.08)",
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
      <div className="fade-up" style={{ padding: "2px 20px 2px 64px" }}>
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
                background: block.is_error ? "rgba(239, 68, 68, 0.06)" : "#1a1a1a",
                border: `1px solid ${block.is_error ? "rgba(239, 68, 68, 0.2)" : "#2a2a2a"}`,
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                color: block.is_error ? "#ef4444" : "#888",
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

  // ─── User message: right-aligned bubble ─────
  if (isUser) {
    const text =
      contentBlocks
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n") || content || "";

    return (
      <div className="fade-up" style={{ padding: "8px 20px", display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "85%",
            background: "#2a2a2a",
            borderRadius: "20px 20px 4px 20px",
            padding: "10px 16px",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  // ─── Assistant message: skip if truly empty ─────
  const hasText = contentBlocks.some((b) => b.type === "text" && (b as any).text);
  const hasTools = contentBlocks.some((b) => b.type === "tool_use");
  if (!hasText && !hasTools && !thinking && !content) return null;

  // ─── Assistant message: left-aligned with avatar ─────
  return (
    <div className="fade-up" style={{ padding: "8px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* Avatar */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "linear-gradient(135deg, #d97706, #f59e0b)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#a1a1a1", marginBottom: 4 }}>Claude</div>

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
      </div>
    </div>
  );
}
