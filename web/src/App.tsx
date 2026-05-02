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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L12.9 8.1M12 22L12.9 15.9M2 12L8.1 12.9M22 12L15.9 12.9M4.93 4.93L9.17 9.17M19.07 19.07L14.83 14.83M4.93 19.07L9.17 14.83M19.07 4.93L14.83 9.17"
              stroke="#D97706"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
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
    (data: { sessionId: string }) => {
      if (data.sessionId === selectedId) {
        api.getMessages(data.sessionId).then(setMessages).catch(console.error);
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
