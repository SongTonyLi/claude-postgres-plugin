import { useState, useCallback, useRef, useEffect } from "react";
import type { SearchResult } from "../api/client";
import { searchMessages } from "../api/client";

interface Props {
  onNavigate: (sessionId: string, messageUuid: string) => void;
  onClose: () => void;
}

export function SearchOverlay({ onNavigate, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchMessages(q);
        setResults(r);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 200);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    doSearch(val);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        zIndex: 100,
        display: "flex",
        justifyContent: "center",
        paddingTop: 80,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxHeight: "70vh",
          background: "#1e1e1e",
          borderRadius: 16,
          border: "1px solid #333",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search all conversations..."
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: "#eee",
              fontFamily: "inherit",
              fontSize: 15,
              outline: "none",
            }}
          />
          {loading && <span style={{ fontSize: 11, color: "#666" }}>searching...</span>}
          <kbd
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              background: "#262626",
              border: "1px solid #333",
              fontSize: 11,
              color: "#666",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {results.length === 0 && query.length >= 2 && !loading && (
            <div style={{ padding: 24, textAlign: "center", color: "#666", fontSize: 13 }}>
              No results for "{query}"
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.sessionId}-${r.uuid}-${i}`}
              onClick={() => {
                onNavigate(r.sessionId, r.uuid);
                onClose();
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                transition: "background 0.1s",
                marginBottom: 2,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#262626")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {/* Session title */}
              <div style={{ fontSize: 11, color: "#666", marginBottom: 3, display: "flex", gap: 6 }}>
                <span style={{ color: r.role === "user" ? "#22c55e" : "#f59e0b" }}>
                  {r.role === "user" ? "You" : "Claude"}
                </span>
                <span>in</span>
                <span style={{ color: "#888" }}>{(r as any).sessionTitle?.slice(0, 40) || r.sessionId.slice(0, 8)}</span>
              </div>
              {/* Content preview with highlight */}
              <div
                style={{
                  fontSize: 13,
                  color: "#ccc",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  lineHeight: 1.4,
                }}
              >
                {highlightMatch(r.content || "", query)}
              </div>
            </div>
          ))}
          {query.length < 2 && (
            <div style={{ padding: 24, textAlign: "center", color: "#555", fontSize: 13 }}>
              Type at least 2 characters to search
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, 150);

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  const before = (start > 0 ? "..." : "") + text.slice(start, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length, end) + (end < text.length ? "..." : "");

  return (
    <>
      {before}
      <span style={{ background: "rgba(59, 130, 246, 0.3)", borderRadius: 2, padding: "0 1px" }}>{match}</span>
      {after}
    </>
  );
}
