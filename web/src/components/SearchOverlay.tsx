import { useState, useCallback, useRef, useEffect } from "react";
import type { SearchResult } from "../api/client";
import { searchMessages } from "../api/client";

interface Props {
  onNavigate: (sessionId: string, messageUuid: string, searchQuery: string) => void;
  onClose: () => void;
}

export function SearchOverlay({ onNavigate, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"fuzzy" | "regex">("fuzzy");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  const doSearch = useCallback((q: string, m: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchMessages(q, m);
        setResults(r);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 200);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    doSearch(val, mode);
  };

  const toggleMode = () => {
    const next = mode === "fuzzy" ? "regex" : "fuzzy";
    setMode(next);
    if (query.length >= 2) doSearch(query, next);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.2)",
        zIndex: 100,
        display: "flex",
        justifyContent: "center",
        paddingTop: 80,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxHeight: "70vh",
          background: "#FFFFFF",
          borderRadius: 16,
          border: "1px solid #E5E5E2",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
        }}
      >
        {/* Search input */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #E5E5E2", display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2">
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
              color: "#1A1A1A",
              fontFamily: "inherit",
              fontSize: 15,
              outline: "none",
            }}
          />
          {loading && <span style={{ fontSize: 11, color: "#999" }}>searching...</span>}
          <button
            onClick={toggleMode}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              background: mode === "regex" ? "rgba(59, 130, 246, 0.08)" : "#F0F0EC",
              border: mode === "regex" ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid #E5E5E2",
              fontSize: 11,
              color: mode === "regex" ? "#3b82f6" : "#999",
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
            title={mode === "fuzzy" ? "Switch to regex mode" : "Switch to fuzzy mode"}
          >
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>.*</span>
            <span style={{ fontFamily: "var(--font-sans)" }}>Regex</span>
          </button>
          <kbd
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              background: "#F0F0EC",
              border: "1px solid #E5E5E2",
              fontSize: 11,
              color: "#999",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {results.length === 0 && query.length >= 2 && !loading && (
            <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>
              No results for "{query}"
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.sessionId}-${r.uuid}-${i}`}
              onClick={() => {
                onNavigate(r.sessionId, r.uuid, query);
                onClose();
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
                transition: "background 0.1s",
                marginBottom: 2,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F5F0")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {/* Session title */}
              <div style={{ fontSize: 11, color: "#999", marginBottom: 3, display: "flex", gap: 6 }}>
                <span style={{ color: r.role === "user" ? "#16a34a" : "#D97706" }}>
                  {r.role === "user" ? "You" : "Claude"}
                </span>
                <span>in</span>
                <span style={{ color: "#6B6B6B" }}>{(r as any).sessionTitle?.slice(0, 40) || r.sessionId.slice(0, 8)}</span>
              </div>
              {/* Content preview with highlight */}
              <div
                style={{
                  fontSize: 13,
                  color: "#1A1A1A",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  lineHeight: 1.4,
                }}
              >
                {highlightMatch(r.content || "", query, mode)}
              </div>
            </div>
          ))}
          {query.length < 2 && (
            <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 13 }}>
              Type at least 2 characters to search
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string, mode: "fuzzy" | "regex"): React.ReactNode {
  if (!query) return text;

  let matchStart: number;
  let matchLength: number;

  if (mode === "regex") {
    try {
      const re = new RegExp(query, "i");
      const m = re.exec(text);
      if (!m) return text.slice(0, 150);
      matchStart = m.index;
      matchLength = Math.min(m[0].length, 100);
    } catch {
      return text.slice(0, 150);
    }
  } else {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, 150);
    matchStart = idx;
    matchLength = query.length;
  }

  const start = Math.max(0, matchStart - 40);
  const end = Math.min(text.length, matchStart + matchLength + 80);
  const before = (start > 0 ? "..." : "") + text.slice(start, matchStart);
  const match = text.slice(matchStart, matchStart + matchLength);
  const after = text.slice(matchStart + matchLength, end) + (end < text.length ? "..." : "");

  return (
    <>
      {before}
      <span style={{ background: "rgba(59, 130, 246, 0.15)", borderRadius: 2, padding: "0 1px" }}>{match}</span>
      {after}
    </>
  );
}
