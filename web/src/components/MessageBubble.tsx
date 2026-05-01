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
  metadata?: Record<string, unknown>;
}

export function MessageBubble({
  role,
  content,
  contentBlocks,
  thinking,
  isMeta,
  toolCalls,
  metadata,
}: Props) {
  if (isMeta) return null;

  // System messages (compaction markers)
  if (role === "system") {
    return (
      <div
        style={{
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 1,
            background: "var(--accent-yellow)",
            opacity: 0.3,
          }}
        />
        <span style={{ color: "var(--accent-yellow)", fontSize: 11, whiteSpace: "nowrap" }}>
          {content || "context compacted"}
        </span>
        <div
          style={{
            flex: 1,
            height: 1,
            background: "var(--accent-yellow)",
            opacity: 0.3,
          }}
        />
      </div>
    );
  }

  // Tool result messages — skip, shown inline with tool calls
  const hasToolResult = contentBlocks.some((b) => b.type === "tool_result");
  if (hasToolResult) return null;

  const isUser = role === "user";
  const roleColor = isUser ? "var(--accent-green)" : "var(--accent-blue)";
  const roleLabel = isUser ? "You" : "Claude";
  const roleIcon = isUser ? "\u276F" : "\u2726";

  return (
    <div
      style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Role indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ color: roleColor, fontWeight: 600, fontSize: 13 }}>
          {roleIcon} {roleLabel}
        </span>
      </div>

      {/* Thinking block */}
      {thinking && <ThinkingBlock content={thinking} />}

      {/* Content blocks */}
      {contentBlocks.map((block, i) => {
        if (block.type === "text" && block.text) {
          return (
            <div key={i} className="markdown-body" style={{ color: "var(--text-primary)" }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {block.text}
              </ReactMarkdown>
            </div>
          );
        }

        if (block.type === "tool_use") {
          const result = toolCalls.get(block.id);
          return <ToolCallBlock key={i} toolName={block.name} input={block.input} result={result} />;
        }

        return null;
      })}

      {/* Fallback for plain content without blocks */}
      {contentBlocks.length === 0 && content && (
        <div className="markdown-body" style={{ color: "var(--text-primary)" }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
