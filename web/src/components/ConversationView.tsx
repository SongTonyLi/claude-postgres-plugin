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
      {/* Top navbar — matches Claude.ai header */}
      <div
        style={{
          padding: "0 12px",
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          background: "#F9F8F6",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {/* Left: Claude logo text */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ width: 18, opacity: 0.7 }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style={{ width: "100%", fill: "#1A1A1A" }}>
              <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
            </svg>
          </div>
        </div>

        {/* Center: session title + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, flex: 1, justifyContent: "center", position: "absolute", left: 0, right: 0, pointerEvents: "none" }}>
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "#6B6B6B",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "60%",
              pointerEvents: "auto",
            }}
          >
            {sessionTitle || "Claude"}
          </span>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="#999" style={{ flexShrink: 0, pointerEvents: "auto" }}>
            <path d="M14.128 7.165a.502.502 0 0 1 .744.67l-4.5 5-.078.07a.5.5 0 0 1-.666-.07l-4.5-5-.06-.082a.501.501 0 0 1 .729-.656l.075.068L10 11.752z" />
          </svg>
        </div>

        {/* Right: Select button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {selectMode ? (
            <button
              onClick={() => { setSelectMode(false); setSelected(new Set()); }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 4,
                borderRadius: 6,
                color: "#999",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Exit selection"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              style={{
                background: "transparent",
                border: "1px solid #E5E5E2",
                color: "#6B6B6B",
                padding: "4px 12px",
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Select
            </button>
          )}
        </div>
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
            <div style={{ display: "flex", justifyContent: "flex-start", padding: "24px 20px 8px" }}>
              <div style={{ width: 28 }} className="text-accent-brand">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style={{ width: "100%", fill: "#D97706" }}>
                  <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
                </svg>
              </div>
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
