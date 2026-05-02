import { useState, useEffect, useCallback } from "react";
import { SessionSidebar } from "./components/SessionSidebar";
import { ConversationView } from "./components/ConversationView";
import { SearchOverlay } from "./components/SearchOverlay";
import { useSSE } from "./hooks/useSSE";
import * as api from "./api/client";

function WelcomePage() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#F9F8F6",
        padding: 40,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          padding: "48px 44px",
          borderRadius: 24,
          background: "rgba(255, 255, 255, 0.7)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.5)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)",
          textAlign: "center",
        }}
      >
        {/* Claude logo */}
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "center" }}>
          <div style={{ width: 36 }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style={{ width: "100%", fill: "#D97706" }}>
              <path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z" />
            </svg>
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 600, color: "#1A1A1A", margin: "0 0 8px" }}>
          Claude Session Viewer
        </h1>
        <p style={{ fontSize: 14, color: "#6B6B6B", lineHeight: 1.7, margin: "0 0 24px" }}>
          A secure database-backed viewer for your Claude Code conversations.
          All sessions are stored locally in PostgreSQL for privacy and persistence.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          <FeatureItem
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            }
            title="Secure local storage"
            desc="Conversations stored in your PostgreSQL database, never leaving your machine"
          />
          <FeatureItem
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
            title="Full-text search"
            desc="Search across all conversations with Cmd+K"
          />
          <FeatureItem
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
              </svg>
            }
            title="Rich rendering"
            desc="Syntax-highlighted code, markdown, tool calls, and thinking blocks"
          />
          <FeatureItem
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }
            title="Export & select"
            desc="Select messages and export as XML for sharing or archival"
          />
        </div>

        <div style={{ marginTop: 28, fontSize: 12, color: "#999" }}>
          Select a session from the sidebar to begin, or press <kbd style={{ padding: "1px 5px", borderRadius: 4, background: "#F0F0EC", border: "1px solid #E5E5E2", fontSize: 11 }}>{"\u2318"}K</kbd> to search
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(217, 119, 6, 0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", marginBottom: 1 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#6B6B6B", lineHeight: 1.5 }}>{desc}</div>
      </div>
    </div>
  );
}

export function App() {
  const [sessions, setSessions] = useState<api.Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<api.Message[]>([]);
  const [toolCalls, setToolCalls] = useState<api.ToolCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [highlightUuid, setHighlightUuid] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const refreshSessions = useCallback(() => {
    api.listSessions().then(setSessions).catch(console.error);
  }, []);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  useEffect(() => {
    if (!selectedId) return;
    setIsLoading(true);
    Promise.all([api.getMessages(selectedId), api.getToolCalls(selectedId)])
      .then(([msgs, tools]) => {
        setMessages(msgs);
        setToolCalls(tools);
        setIsLoading(false);
      })
      .catch((err) => { console.error(err); setIsLoading(false); });
  }, [selectedId]);

  const refreshMessages = useCallback(
    (data: { sessionId: string; message?: api.Message }) => {
      if (data.sessionId === selectedId) {
        if (data.message) {
          // Render immediately from SSE data — no DB round trip
          setMessages((prev) => {
            if (prev.some((m) => m.uuid === data.message!.uuid)) return prev;
            return [...prev, data.message!];
          });
        } else {
          // Fallback: fetch from DB
          api.getMessages(data.sessionId).then(setMessages).catch(console.error);
        }
      }
      refreshSessions();
    },
    [selectedId, refreshSessions]
  );

  const refreshTools = useCallback(
    (data: { sessionId: string }) => {
      if (data.sessionId === selectedId) {
        api.getToolCalls(data.sessionId).then(setToolCalls).catch(console.error);
      }
    },
    [selectedId]
  );

  const handleHide = useCallback(
    async (id: string) => {
      await api.hideSession(id);
      if (selectedId === id) setSelectedId(null);
      refreshSessions();
    },
    [selectedId, refreshSessions]
  );

  const { isConnected } = useSSE({
    sessionId: selectedId,
    onSessionNew: refreshSessions,
    onSessionUpdate: refreshSessions,
    onMessageNew: refreshMessages,
    onToolUpdate: refreshTools,
  });

  const sel = sessions.find((s) => s.id === selectedId);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {showSearch && (
        <SearchOverlay
          onNavigate={(sessionId, msgUuid) => {
            setSelectedId(sessionId);
            setHighlightUuid(msgUuid);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
      <SessionSidebar
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onHide={handleHide}
        onSearchOpen={() => setShowSearch(true)}
        isConnected={isConnected}
      />

      {selectedId ? (
        <ConversationView
          messages={messages}
          toolCalls={toolCalls}
          sessionId={selectedId}
          sessionTitle={sel?.title || null}
          sessionStatus={sel?.status || "unknown"}
          sessionCwd={sel?.cwd || null}
          sessionStartedAt={sel?.startedAt || null}
          highlightUuid={highlightUuid}
          onHighlightDone={() => setHighlightUuid(null)}
          isLoading={isLoading}
        />
      ) : (
        <WelcomePage />
      )}
    </div>
  );
}
