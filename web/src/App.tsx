import { useState, useEffect, useCallback } from "react";
import { SessionSidebar } from "./components/SessionSidebar";
import { ConversationView } from "./components/ConversationView";
import { SearchOverlay } from "./components/SearchOverlay";
import { useSSE } from "./hooks/useSSE";
import * as api from "./api/client";

export function App() {
  const [sessions, setSessions] = useState<api.Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<api.Message[]>([]);
  const [toolCalls, setToolCalls] = useState<api.ToolCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

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
          onNavigate={setSelectedId}
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
          isLoading={isLoading}
        />
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#171717",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: "linear-gradient(135deg, #d97706, #f59e0b)",
              display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span style={{ fontSize: 15, color: "#888", fontWeight: 500 }}>Select a session</span>
          <span style={{ fontSize: 12, color: "#555" }}>
            {"\u2318"}K to search all conversations
          </span>
        </div>
      )}
    </div>
  );
}
