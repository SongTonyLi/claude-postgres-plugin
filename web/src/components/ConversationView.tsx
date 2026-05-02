import { useEffect, useRef, useState, useCallback } from "react";
import type { Message, ToolCall } from "../api/client";
import { exportXml } from "../api/client";
import { MessageBubble } from "./MessageBubble";

interface Props {
  messages: Message[];
  toolCalls: ToolCall[];
  sessionId: string;
  sessionTitle: string | null;
  sessionStatus: string;
  sessionCwd: string | null;
  sessionStartedAt: string | null;
  highlightUuid: string | null;
  onHighlightDone: () => void;
  isLoading: boolean;
}

export function ConversationView({
  messages,
  toolCalls,
  sessionId,
  sessionTitle,
  sessionStatus,
  sessionCwd,
  sessionStartedAt,
  highlightUuid,
  onHighlightDone,
  isLoading,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [glowUuid, setGlowUuid] = useState<string | null>(null);

  const toolMap = new Map<string, ToolCall>();
  for (const tc of toolCalls) toolMap.set(tc.toolUseId, tc);

  // Visible messages (non-meta, non-tool-result)
  const visibleMsgs = messages.filter(
    (m) => !m.isMeta && !m.contentBlocks.some?.((b: any) => b.type === "tool_result") && m.role !== "system"
  );

  // Scroll to highlighted message and glow for 10s
  useEffect(() => {
    if (!highlightUuid || messages.length === 0) return;
    const raf = requestAnimationFrame(() => {
      const el = msgRefs.current.get(highlightUuid);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setGlowUuid(highlightUuid);
        const timer = setTimeout(() => {
          setGlowUuid(null);
          onHighlightDone();
        }, 10000);
        return () => clearTimeout(timer);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [highlightUuid, messages.length, onHighlightDone]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Reset selection when session changes
  useEffect(() => {
    setSelected(new Set());
    setSelectMode(false);
  }, [sessionId]);

  const toggleMsg = useCallback((uuid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(visibleMsgs.map((m) => m.uuid)));
  }, [visibleMsgs]);

  const handleExport = useCallback(async () => {
    const uuids = Array.from(selected);
    const xml = await exportXml(sessionId, uuids);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `session-${sessionId.slice(0, 8)}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selected, sessionId]);

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#F9F8F6", color: "#999" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", background: "#F9F8F6" }}>
      {/* Top navbar */}
      <div
        style={{
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid #E5E5E2",
          background: "#FFFFFF",
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: "#1A1A1A" }}>
          {sessionTitle || "Claude"}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <span style={{ color: "#999", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sessionCwd || ""}
        </span>
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            background: sessionStatus === "active" ? "rgba(22, 163, 74, 0.08)" : "rgba(153, 153, 153, 0.1)",
            color: sessionStatus === "active" ? "#16a34a" : "#999",
          }}
        >
          {sessionStatus}
        </span>
        <span style={{ fontSize: 11, color: "#999" }}>{toolCalls.length} tools</span>

        {/* Select toggle */}
        <button
          onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelected(new Set()); }}
          style={{
            background: selectMode ? "rgba(59, 130, 246, 0.08)" : "#F5F5F0",
            border: selectMode ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid #E5E5E2",
            color: selectMode ? "#3b82f6" : "#6B6B6B",
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 11,
          }}
        >
          {selectMode ? `${selected.size} selected` : "Select"}
        </button>
      </div>

      {/* Export toolbar (when selecting) */}
      {selectMode && (
        <div
          style={{
            padding: "6px 20px",
            background: "#F0F0FF",
            borderBottom: "1px solid #E0E0F0",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
          }}
        >
          <button
            onClick={selectAll}
            style={{ background: "none", border: "1px solid #E5E5E2", color: "#6B6B6B", padding: "3px 8px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}
          >
            Select All
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ background: "none", border: "1px solid #E5E5E2", color: "#6B6B6B", padding: "3px 8px", borderRadius: 5, cursor: "pointer", fontFamily: "inherit", fontSize: 11 }}
          >
            Clear
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleExport}
            disabled={selected.size === 0}
            style={{
              background: selected.size > 0 ? "#3b82f6" : "#E5E5E2",
              border: "none",
              color: selected.size > 0 ? "#fff" : "#999",
              padding: "5px 14px",
              borderRadius: 6,
              cursor: selected.size > 0 ? "pointer" : "default",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            Export XML ({selected.size})
          </button>
        </div>
      )}

      {/* Messages with top fade overlay */}
      <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
        {/* Fade overlay at top */}
        <div
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            height: 40,
            background: "linear-gradient(to bottom, #F9F8F6 0%, rgba(249, 248, 246, 0) 100%)",
            pointerEvents: "none",
            zIndex: 2,
            marginBottom: -40,
          }}
        />
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "10px 20px 0" }}>
          {sessionStartedAt && (
            <div style={{ textAlign: "center", padding: "16px 20px 10px", fontSize: 11, color: "#999" }}>
              {sessionCwd && <div style={{ marginBottom: 2 }}>{sessionCwd}</div>}
              {new Date(sessionStartedAt).toLocaleString("en-US", {
                weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
            </div>
          )}

          {messages.map((msg) => {
            const isSelectable = selectMode && !msg.isMeta && msg.role !== "system"
              && !(Array.isArray(msg.contentBlocks) && msg.contentBlocks.some((b: any) => b.type === "tool_result"));
            const isSelected = selected.has(msg.uuid);
            const isGlowing = glowUuid === msg.uuid;

            return (
              <div
                key={msg.uuid}
                ref={(el) => { if (el) msgRefs.current.set(msg.uuid, el); }}
                className={isGlowing ? "search-glow" : ""}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  position: "relative",
                  background: isGlowing
                    ? "rgba(59, 130, 246, 0.06)"
                    : isSelected
                      ? "rgba(59, 130, 246, 0.04)"
                      : "transparent",
                  transition: "background 0.5s ease",
                  borderLeft: isGlowing ? "3px solid #3b82f6" : "3px solid transparent",
                }}
              >
                {isSelectable && (
                  <div
                    onClick={() => toggleMsg(msg.uuid)}
                    style={{
                      position: "absolute",
                      left: 4,
                      top: 14,
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: isSelected ? "2px solid #3b82f6" : "2px solid #CCC",
                      background: isSelected ? "#3b82f6" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 1,
                      transition: "all 0.1s",
                    }}
                  >
                    {isSelected && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                )}
                <div style={{ flex: 1, paddingLeft: selectMode ? 20 : 0 }}>
                  <MessageBubble
                    role={msg.role}
                    content={msg.content}
                    contentBlocks={msg.contentBlocks}
                    thinking={msg.thinking}
                    isMeta={msg.isMeta}
                    toolCalls={toolMap}
                  />
                </div>
              </div>
            );
          })}

          {/* Claude logo at bottom */}
          {messages.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-start", padding: "16px 0 8px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L12.9 8.1M12 22L12.9 15.9M2 12L8.1 12.9M22 12L15.9 12.9M4.93 4.93L9.17 9.17M19.07 19.07L14.83 14.83M4.93 19.07L9.17 14.83M19.07 4.93L14.83 9.17"
                  stroke="#D97706"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}

          {messages.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#999", fontSize: 13 }}>
              Empty session
            </div>
          )}
          <div ref={bottomRef} style={{ height: 30 }} />
        </div>
      </div>
    </div>
  );
}
