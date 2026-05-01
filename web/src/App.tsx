import { useState, useEffect, useCallback } from "react";
import { SessionSidebar } from "./components/SessionSidebar";
import { ConversationView } from "./components/ConversationView";
import { useSSE } from "./hooks/useSSE";
import * as api from "./api/client";

export function App() {
  const [sessions, setSessions] = useState<api.Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<api.Message[]>([]);
  const [toolCalls, setToolCalls] = useState<api.ToolCall[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load sessions on mount
  useEffect(() => {
    api.listSessions().then(setSessions).catch(console.error);
  }, []);

  // Load conversation when session selected
  useEffect(() => {
    if (!selectedId) return;
    setIsLoading(true);
    Promise.all([api.getMessages(selectedId), api.getToolCalls(selectedId)])
      .then(([msgs, tools]) => {
        setMessages(msgs);
        setToolCalls(tools);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setIsLoading(false);
      });
  }, [selectedId]);

  // SSE handlers
  const refreshSessions = useCallback(() => {
    api.listSessions().then(setSessions).catch(console.error);
  }, []);

  const refreshMessages = useCallback(
    (data: { sessionId: string }) => {
      if (data.sessionId === selectedId) {
        api.getMessages(data.sessionId).then(setMessages).catch(console.error);
      }
      // Also refresh sessions list to update status/title
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

  const { isConnected } = useSSE({
    sessionId: selectedId,
    onSessionNew: refreshSessions,
    onSessionUpdate: refreshSessions,
    onMessageNew: refreshMessages,
    onToolUpdate: refreshTools,
  });

  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <SessionSidebar
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        isConnected={isConnected}
      />

      {selectedId ? (
        <ConversationView
          messages={messages}
          toolCalls={toolCalls}
          sessionTitle={selectedSession?.title || null}
          sessionStatus={selectedSession?.status || "unknown"}
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
            color: "var(--text-muted)",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 40, opacity: 0.3 }}>{"\u2726"}</span>
          <span style={{ fontSize: 14 }}>Select a session to view</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Conversations from claude-code are stored in PostgreSQL
          </span>
        </div>
      )}
    </div>
  );
}
