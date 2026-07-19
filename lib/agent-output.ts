type JsonKind = "object" | "array";

export interface AgentJsonParseResult<T> {
  data: T | null;
  error: string | null;
}

function extractJson(raw: string, kind: JsonKind): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? raw;
  const startToken = kind === "array" ? "[" : "{";
  const endToken = kind === "array" ? "]" : "}";
  const start = source.indexOf(startToken);
  const end = source.lastIndexOf(endToken);

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return source.slice(start, end + 1);
}

export function parseAgentJson<T>(raw: string, kind: JsonKind): AgentJsonParseResult<T> {
  const json = extractJson(raw, kind);
  if (!json) {
    return { data: null, error: `No ${kind} JSON found in AI response` };
  }

  try {
    return { data: JSON.parse(json) as T, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    return { data: null, error: message };
  }
}
