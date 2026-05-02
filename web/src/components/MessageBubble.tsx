import { useState, useMemo, Fragment } from "react";
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
  highlightQuery?: string | null;
  sessionId?: string;
  messageUuid?: string;
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

function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  let regex: RegExp;
  try {
    regex = new RegExp(query, "gi");
  } catch {
    regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  }

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  let safety = 0;

  while ((match = regex.exec(text)) !== null && safety++ < 100) {
    if (match[0].length === 0) { regex.lastIndex++; continue; }
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    parts.push(
      <mark key={key++} style={{ background: "rgba(59, 130, 246, 0.25)", borderRadius: 2, padding: "0 1px" }}>
        {match[0]}
      </mark>
    );
    lastIdx = match.index + match[0].length;
  }
  if (parts.length === 0) return text;
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));

  return <>{parts}</>;
}

function mapTextChildren(children: React.ReactNode, query: string): React.ReactNode {
  if (typeof children === "string") return highlightText(children, query);
  if (Array.isArray(children)) {
    return children.map((child, i) =>
      typeof child === "string"
        ? <Fragment key={i}>{highlightText(child, query)}</Fragment>
        : child
    );
  }
  return children;
}

function UserMessageContent({ text, highlightQuery }: { text: string; highlightQuery?: string | null }) {
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
        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {highlightQuery ? highlightText(text, highlightQuery) : text}
        </div>
        {!expanded && isLong && (
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 48,
              background: "linear-gradient(to top, #E8E5DE 0%, transparent 100%)",
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

function AttachmentViewer({ src, mediaType, onClose }: { src: string; mediaType: string; onClose: () => void }) {
  const isImage = mediaType.startsWith("image/");
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          border: "1px solid #E5E5E2",
          overflow: "hidden",
          resize: "both",
          minWidth: 300,
          minHeight: 200,
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "6px 12px", borderBottom: "1px solid #E5E5E2", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#999" }}>{mediaType}</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#999", padding: "2px 6px", borderRadius: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#F0F0EC"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            {"\u2715"}
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
          {isImage ? (
            <img src={src} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4 }} />
          ) : (
            <embed src={src} type={mediaType} style={{ width: "100%", height: "100%", minHeight: 500 }} />
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentBlock({ sessionId, messageUuid, blockIndex, mediaType }: { sessionId: string; messageUuid: string; blockIndex: number; mediaType: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/sessions/${sessionId}/messages/${messageUuid}/attachment/${blockIndex}`;
  const isImage = mediaType.startsWith("image/");
  const isPdf = mediaType === "application/pdf";

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        style={{
          margin: "6px 0",
          borderRadius: 10,
          border: "1px solid #E5E5E2",
          background: "#FAFAF8",
          overflow: "hidden",
          cursor: "pointer",
          transition: "border-color 0.15s",
          maxWidth: 320,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#E5E5E2"; }}
      >
        {isImage ? (
          <img src={src} style={{ display: "block", maxWidth: "100%", maxHeight: 240, objectFit: "contain", borderRadius: "10px 10px 0 0" }} loading="lazy" />
        ) : (
          <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span style={{ fontSize: 12, color: "#6B6B6B" }}>{isPdf ? "PDF Document" : mediaType}</span>
          </div>
        )}
        <div style={{ padding: "4px 10px 6px", fontSize: 10, color: "#999" }}>
          {isImage ? "Image" : isPdf ? "PDF" : "Document"} &middot; Click to view
        </div>
      </div>
      {open && <AttachmentViewer src={src} mediaType={mediaType} onClose={() => setOpen(false)} />}
    </>
  );
}

export function MessageBubble({ role, content, contentBlocks: rawBlocks, thinking, isMeta, toolCalls, highlightQuery, sessionId, messageUuid }: Props) {
  const highlightComponents = useMemo(() => {
    if (!highlightQuery) return undefined;
    const hl = (children: React.ReactNode) => mapTextChildren(children, highlightQuery);
    return {
      p: ({ node, children, ...props }: any) => <p {...props}>{hl(children)}</p>,
      li: ({ node, children, ...props }: any) => <li {...props}>{hl(children)}</li>,
      h1: ({ node, children, ...props }: any) => <h1 {...props}>{hl(children)}</h1>,
      h2: ({ node, children, ...props }: any) => <h2 {...props}>{hl(children)}</h2>,
      h3: ({ node, children, ...props }: any) => <h3 {...props}>{hl(children)}</h3>,
      td: ({ node, children, ...props }: any) => <td {...props}>{hl(children)}</td>,
      th: ({ node, children, ...props }: any) => <th {...props}>{hl(children)}</th>,
    };
  }, [highlightQuery]);

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
    const rawText =
      contentBlocks
        .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n") || content || "";

    // Strip XML/HTML tags and normalize inter-tag whitespace
    const text = rawText
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l)
      .join("\n");

    const hasImages = contentBlocks.some((b) => b.type === "image" || b.type === "document");
    if (!text && !hasImages) return null;

    return (
      <div className="fade-up" style={{ padding: "8px 20px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {hasImages && sessionId && messageUuid && (
          <div style={{ maxWidth: "85%", display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
            {contentBlocks.map((block, i) => {
              if (block.type !== "image" && block.type !== "document") return null;
              const mt = (block as any).source?.media_type || (block as any).source?.mediaType || "image/png";
              return <AttachmentBlock key={i} sessionId={sessionId} messageUuid={messageUuid} blockIndex={i} mediaType={mt} />;
            })}
          </div>
        )}
        {text && (
          <div
            style={{
              maxWidth: "85%",
              background: "#E8E5DE",
              borderRadius: "16px",
              padding: "10px 16px",
              lineHeight: 1.6,
              color: "#1A1A1A",
              fontFamily: "var(--font-sans)",
              fontSize: 16,
            }}
          >
            <UserMessageContent text={text} highlightQuery={highlightQuery} />
          </div>
        )}
      </div>
    );
  }

  // ─── Assistant message: skip if truly empty ─────
  const hasText = contentBlocks.some((b) => b.type === "text" && (b as any).text);
  const hasTools = contentBlocks.some((b) => b.type === "tool_use");
  const hasAttachments = contentBlocks.some((b) => b.type === "image" || b.type === "document");
  if (!hasText && !hasTools && !hasAttachments && !thinking && !content) return null;

  // Build full copyable text including thinking, tool calls, and results
  const allText = (() => {
    const parts: string[] = [];
    if (thinking) parts.push(`<thinking>\n${thinking}\n</thinking>`);
    for (const block of contentBlocks) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      } else if (block.type === "tool_use") {
        const tc = toolCalls.get(block.id);
        let toolText = `[Tool: ${block.name}]`;
        if (block.input && typeof block.input === "object") {
          const inp = block.input as Record<string, unknown>;
          if (inp.command) toolText += `\n$ ${inp.command}`;
          else if (inp.file_path) toolText += `\n${inp.file_path}`;
          else if (inp.pattern) toolText += `\n${inp.pattern}`;
        }
        if (tc?.output) toolText += `\n${tc.output}`;
        if (tc?.error) toolText += `\n[Error] ${tc.error}`;
        parts.push(toolText);
      }
    }
    return parts.join("\n\n") || content || "";
  })();

  // ─── Assistant message: serif font, copy button ─────
  return (
    <div className="fade-up" style={{ padding: "12px 4px" }}>
      <div style={{ minWidth: 0, fontFamily: "var(--font-serif)", lineHeight: "1.65rem" }}>
        {thinking && <ThinkingBlock content={thinking} />}

        {contentBlocks.map((block, i) => {
          if (block.type === "text" && block.text) {
            return (
              <div key={i} className="prose-chat" style={{ fontFamily: "var(--font-serif)" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={highlightComponents}>
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
          if ((block.type === "image" || block.type === "document") && sessionId && messageUuid) {
            const mt = (block as any).source?.media_type || (block as any).source?.mediaType || "image/png";
            return <AttachmentBlock key={i} sessionId={sessionId} messageUuid={messageUuid} blockIndex={i} mediaType={mt} />;
          }
          return null;
        })}

        {contentBlocks.length === 0 && content && (
          <div className="prose-chat" style={{ fontFamily: "var(--font-serif)" }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={highlightComponents}>
              {content}
            </ReactMarkdown>
          </div>
        )}

        {allText && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
            <CopyButton text={allText} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#16a34a", fontSize: 11, fontFamily: "var(--font-sans)", opacity: 0.7 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved{hasAttachments ? " (incl. images)" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
