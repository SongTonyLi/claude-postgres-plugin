export interface ParsedEvent {
  type: "user" | "assistant" | "system";
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  isSidechain: boolean;
  isMeta: boolean;
  data: Record<string, unknown>;
}

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolUseId: string;
  output: string;
  isError?: boolean;
}

export function parseSessionLine(line: string): ParsedEvent | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const type = parsed.type as string;
  if (type !== "user" && type !== "assistant" && type !== "system") {
    return null;
  }

  return {
    type: type as ParsedEvent["type"],
    uuid: (parsed.uuid as string) || "",
    parentUuid: (parsed.parentUuid as string) || null,
    sessionId: (parsed.sessionId as string) || "",
    timestamp: (parsed.timestamp as string) || new Date().toISOString(),
    isSidechain: (parsed.isSidechain as boolean) || false,
    isMeta: (parsed.isMeta as boolean) || false,
    data: parsed,
  };
}

export function extractTextContent(contentBlocks: unknown[]): string {
  if (!Array.isArray(contentBlocks)) return "";
  return contentBlocks
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

export function extractThinking(contentBlocks: unknown[]): string | null {
  if (!Array.isArray(contentBlocks)) return null;
  const thinking = contentBlocks
    .filter((b: any) => b.type === "thinking")
    .map((b: any) => b.thinking)
    .join("\n");
  return thinking || null;
}

export function extractToolUses(contentBlocks: unknown[]): ToolUse[] {
  if (!Array.isArray(contentBlocks)) return [];
  return contentBlocks
    .filter((b: any) => b.type === "tool_use")
    .map((b: any) => ({
      id: b.id,
      name: b.name,
      input: b.input,
    }));
}

export function extractToolResults(contentBlocks: unknown[]): ToolResult[] {
  if (!Array.isArray(contentBlocks)) return [];
  return contentBlocks
    .filter((b: any) => b.type === "tool_result")
    .map((b: any) => {
      let output = "";
      if (typeof b.content === "string") {
        output = b.content;
      } else if (Array.isArray(b.content)) {
        output = b.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n");
      }
      return {
        toolUseId: b.tool_use_id,
        output,
        isError: b.is_error,
      };
    });
}
