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

export function MessageBubble({ role, content, contentBlocks, thinking, isMeta, toolCalls }: Props) {
  if (isMeta) return null;

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

  // Skip tool_result user messages
  if (contentBlocks.some((b) => b.type === "tool_result")) return null;

  const isUser = role === "user";

  // ─── User message: right-aligned bubble (Open WebUI style) ─────
  if (isUser) {
    const text =
      contentBlocks
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n") || content || "";

    return (
      <div className="fade-up" style={{ padding: "6px 20px", display: "flex", justifyContent: "flex-end" }}>
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

  // ─── Assistant message: left-aligned with avatar (Open WebUI style) ─────
  return (
    <div className="fade-up" style={{ padding: "6px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
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
          fontSize: 14,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z" />
          <path d="M17 14a7 7 0 0 1-14 0" />
          <path d="M12 18v4" />
        </svg>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: "calc(100% - 50px)" }}>
        {/* Model label */}
        <div style={{ fontSize: 12, fontWeight: 600, color: "#a1a1a1", marginBottom: 4 }}>
          Claude
        </div>

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
