import { useEffect, useRef } from "react";
import type { Message, ToolCall } from "../api/client";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: Message[];
  toolCalls: ToolCall[];
  sessionTitle: string | null;
  sessionStatus: string;
  sessionCwd: string | null;
  sessionStartedAt: string | null;
  isLoading: boolean;
}

export function ConversationView({
  messages,
  toolCalls,
  sessionTitle,
  sessionStatus,
  sessionCwd,
  sessionStartedAt,
  isLoading,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const toolMap = new Map<string, ToolCall>();
  for (const tc of toolCalls) toolMap.set(tc.toolUseId, tc);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#171717", color: "#666" }}>
        <span className="pulse" style={{ animation: "pulse 2s ease-in-out infinite" }}>Loading...</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: "#171717" }}>
      {/* Top navbar (Open WebUI style) */}
      <div
        style={{
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid #2a2a2a",
          background: "#1e1e1e",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Claude</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            background: sessionStatus === "active" ? "rgba(34, 197, 94, 0.1)" : "rgba(102, 102, 102, 0.15)",
            color: sessionStatus === "active" ? "#22c55e" : "#666",
          }}
        >
          {sessionStatus}
        </span>
        <span style={{ fontSize: 11, color: "#555" }}>
          {toolCalls.length} tools
        </span>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "10px 0 0" }}>
          {/* Session info banner */}
          {sessionStartedAt && (
            <div style={{ textAlign: "center", padding: "16px 20px 10px", fontSize: 11, color: "#555" }}>
              {sessionCwd && <div style={{ marginBottom: 2 }}>{sessionCwd}</div>}
              {new Date(sessionStartedAt).toLocaleString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.uuid}
              role={msg.role}
              content={msg.content}
              contentBlocks={msg.contentBlocks}
              thinking={msg.thinking}
              isMeta={msg.isMeta}
              toolCalls={toolMap}
            />
          ))}

          {messages.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#555", fontSize: 13 }}>
              Empty session
            </div>
          )}

          <div ref={bottomRef} style={{ height: 30 }} />
        </div>
      </div>
    </div>
  );
}
