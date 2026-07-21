import { describe, expect, it } from "vitest";
import { readApiJson } from "@/lib/api-response";

describe("readApiJson", () => {
  it("parses a JSON API response", async () => {
    const response = new Response('{"ok":true}', {
      headers: { "Content-Type": "application/json" },
    });

    await expect(readApiJson(response)).resolves.toEqual({ ok: true });
  });

  it("returns a useful error for a non-JSON timeout response", async () => {
    const response = new Response("FUNCTION_INVOCATION_TIMEOUT", { status: 504 });

    await expect(readApiJson(response)).resolves.toEqual({
      error: "Запит завершився з помилкою HTTP 504",
    });
  });
});
