import { describe, expect, it } from "vitest";
import { parseAgentJson } from "@/lib/agent-output";

describe("parseAgentJson", () => {
  it("parses object JSON from plain text", () => {
    const result = parseAgentJson<{ ok: boolean }>('prefix {"ok":true} suffix', "object");

    expect(result).toEqual({ data: { ok: true }, error: null });
  });

  it("parses array JSON from fenced code blocks", () => {
    const result = parseAgentJson<Array<{ id: number }>>("```json\n[{\"id\":1}]\n```", "array");

    expect(result).toEqual({ data: [{ id: 1 }], error: null });
  });

  it("returns a parse error instead of throwing", () => {
    const result = parseAgentJson('{"ok":}', "object");

    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error).not.toBe("No object JSON found in AI response");
  });
});
