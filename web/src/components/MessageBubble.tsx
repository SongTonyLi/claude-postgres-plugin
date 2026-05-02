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
}: Props) {
  if (isMeta) return null;

  // System messages (compaction markers)
  if (role === "system") {
    return (
      <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: "var(--accent-yellow)", opacity: 0.3 }} />
        <span style={{ color: "var(--accent-yellow)", fontSize: 11, whiteSpace: "nowrap" }}>
          {content || "context compacted"}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--accent-yellow)", opacity: 0.3 }} />
      </div>
    );
  }

  // Tool result messages — skip rendering, shown inline with tool calls
  const hasToolResult = contentBlocks.some((b) => b.type === "tool_result");
  if (hasToolResult) return null;

  const isUser = role === "user";

  return (
    <div style={{ padding: "0 0 4px 0" }}>
      {/* User message: styled like claude-code's prompt input */}
      {isUser && (
        <div
          style={{
            padding: "12px 24px",
            background: "var(--bg-secondary)",
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                color: "var(--accent-green)",
                fontWeight: 700,
                flexShrink: 0,
                lineHeight: "1.6",
              }}
            >
              {">"}
            </span>
            <div style={{ flex: 1 }}>
              {contentBlocks.map((block, i) => {
                if (block.type === "text" && block.text) {
                  return (
                    <span key={i} style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                      {block.text}
                    </span>
                  );
                }
                return null;
              })}
              {contentBlocks.length === 0 && content && (
                <span style={{ color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                  {content}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assistant message: styled like claude-code's output */}
      {!isUser && (
        <div style={{ padding: "12px 24px 8px 24px" }}>
          {/* Thinking block */}
          {thinking && <ThinkingBlock content={thinking} />}

          {/* Content blocks */}
          {contentBlocks.map((block, i) => {
            if (block.type === "text" && block.text) {
              return (
                <div key={i} className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {block.text}
                  </ReactMarkdown>
                </div>
              );
            }

            if (block.type === "tool_use") {
              const result = toolCalls.get(block.id);
              return (
                <ToolCallBlock key={i} toolName={block.name} input={block.input} result={result} />
              );
            }

            return null;
          })}

          {/* Fallback */}
          {contentBlocks.length === 0 && content && (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
