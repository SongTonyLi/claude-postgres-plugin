import { useEffect, useRef } from "react";
import type { Message, ToolCall } from "../api/client";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: Message[];
  toolCalls: ToolCall[];
  sessionTitle: string | null;
  sessionStatus: string;
  isLoading: boolean;
}

export function ConversationView({
  messages,
  toolCalls,
  sessionTitle,
  sessionStatus,
  isLoading,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Build tool call lookup map
  const toolMap = new Map<string, ToolCall>();
  for (const tc of toolCalls) {
    toolMap.set(tc.toolUseId, tc);
  }

  // Count visible messages (skip meta and tool results)
  const visibleCount = messages.filter(
    (m) => !m.isMeta && !m.contentBlocks.some((b) => b.type === "tool_result")
  ).length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        Loading conversation...
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {sessionTitle || "Session"}
        </span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 10,
            fontSize: 11,
            background:
              sessionStatus === "active" ? "rgba(63,185,80,0.15)" : "rgba(139,148,158,0.15)",
            color: sessionStatus === "active" ? "var(--accent-green)" : "var(--text-secondary)",
          }}
        >
          {sessionStatus}
        </span>
        <span style={{ color: "var(--text-muted)", marginLeft: "auto", fontSize: 12 }}>
          {visibleCount} messages
        </span>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-primary)" }}>
        {messages.map((msg) => (
          <MessageBubble
            key={msg.uuid}
            role={msg.role}
            content={msg.content}
            contentBlocks={msg.contentBlocks}
            thinking={msg.thinking}
            isMeta={msg.isMeta}
            toolCalls={toolMap}
            metadata={msg.metadata}
          />
        ))}

        {messages.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            No messages in this session
          </div>
        )}
        <div ref={bottomRef} style={{ height: 40 }} />
      </div>
    </div>
  );
}
