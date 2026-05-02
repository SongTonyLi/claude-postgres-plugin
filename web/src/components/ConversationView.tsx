import { useEffect, useRef } from "react";
import type { Message, ToolCall } from "../api/client";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: Message[];
  toolCalls: ToolCall[];
  sessionTitle: string | null;
  sessionStatus: string;
  sessionCwd: string | null;
  isLoading: boolean;
}

export function ConversationView({
  messages,
  toolCalls,
  sessionTitle,
  sessionStatus,
  sessionCwd,
  isLoading,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const toolMap = new Map<string, ToolCall>();
  for (const tc of toolCalls) {
    toolMap.set(tc.toolUseId, tc);
  }

  const userMsgCount = messages.filter(
    (m) => m.role === "user" && !m.isMeta && !m.contentBlocks.some((b) => b.type === "tool_result")
  ).length;
  const assistantMsgCount = messages.filter((m) => m.role === "assistant" && !m.isMeta).length;

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
          background: "var(--bg-primary)",
        }}
      >
        Loading...
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
        background: "var(--bg-primary)",
      }}
    >
      {/* Terminal-like title bar */}
      <div
        style={{
          padding: "8px 24px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
          fontSize: 12,
        }}
      >
        {/* Window control dots */}
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        </div>

        <span style={{ color: "var(--text-secondary)" }}>
          claude
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {sessionCwd || "~"}
        </span>

        <span
          style={{
            marginLeft: "auto",
            padding: "2px 8px",
            borderRadius: 10,
            fontSize: 10,
            background:
              sessionStatus === "active" ? "rgba(63,185,80,0.15)" : "rgba(139,148,158,0.15)",
            color: sessionStatus === "active" ? "var(--accent-green)" : "var(--text-secondary)",
          }}
        >
          {sessionStatus}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
          {userMsgCount} prompts, {toolCalls.length} tools
        </span>
      </div>

      {/* Messages in terminal scroll area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Session start marker */}
        <div
          style={{
            padding: "16px 24px 8px",
            color: "var(--text-muted)",
            fontSize: 11,
          }}
        >
          Session started {new Date(messages[0]?.timestamp || "").toLocaleString()}
        </div>

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
        <div ref={bottomRef} style={{ height: 24 }} />
      </div>
    </div>
  );
}
