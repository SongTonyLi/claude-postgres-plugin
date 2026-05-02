const BASE = "";

export interface Session {
  id: string;
  projectPath: string;
  cwd: string | null;
  model: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  title: string | null;
  metadata: Record<string, unknown>;
  messageCount?: number;
  toolCount?: number;
}

export interface Message {
  sessionId: string;
  uuid: string;
  parentUuid: string | null;
  role: string;
  content: string | null;
  contentBlocks: ContentBlock[];
  thinking: string | null;
  isSidechain: boolean;
  isMeta: boolean;
  sequenceNum: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface ToolCall {
  sessionId: string;
  messageUuid: string;
  toolUseId: string;
  toolName: string;
  input: unknown;
  output: string | null;
  status: string;
  error: string | null;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean };

export async function listSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE}/api/sessions`);
  return res.json();
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/api/sessions/${id}`);
  return res.json();
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/messages`);
  return res.json();
}

export interface SearchResult extends Message {
  sessionTitle?: string;
}

export async function searchMessages(query: string): Promise<SearchResult[]> {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function getToolCalls(sessionId: string): Promise<ToolCall[]> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/tools`);
  return res.json();
}

export async function exportXml(sessionId: string, uuids: string[]): Promise<string> {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/export-xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuids }),
  });
  return res.text();
}

export async function hideSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/api/sessions/${sessionId}/hide`, { method: "POST" });
}

export async function unhideSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/api/sessions/${sessionId}/unhide`, { method: "POST" });
}
