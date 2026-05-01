import { useEffect, useRef, useState, useCallback } from "react";

interface SSEOptions {
  sessionId?: string | null;
  onSessionNew?: (data: { sessionId: string }) => void;
  onSessionUpdate?: (data: { sessionId: string }) => void;
  onMessageNew?: (data: { sessionId: string; uuid: string; role: string }) => void;
  onToolUpdate?: (data: { sessionId: string; toolUseId: string }) => void;
}

export function useSSE(options: SSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    const params = new URLSearchParams();
    if (optionsRef.current.sessionId) {
      params.set("sessionId", optionsRef.current.sessionId);
    }

    const url = `/api/events/sse?${params}`;
    const es = new EventSource(url);

    es.onopen = () => setIsConnected(true);
    es.onerror = () => {
      setIsConnected(false);
      es.close();
      setTimeout(connect, 3000);
    };

    es.addEventListener("session:new", (e) => {
      optionsRef.current.onSessionNew?.(JSON.parse(e.data));
    });
    es.addEventListener("session:update", (e) => {
      optionsRef.current.onSessionUpdate?.(JSON.parse(e.data));
    });
    es.addEventListener("message:new", (e) => {
      optionsRef.current.onMessageNew?.(JSON.parse(e.data));
    });
    es.addEventListener("tool:update", (e) => {
      optionsRef.current.onToolUpdate?.(JSON.parse(e.data));
    });

    eventSourceRef.current = es;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
