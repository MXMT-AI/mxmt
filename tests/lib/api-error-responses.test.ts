import { describe, expect, it } from "vitest";
import { apiError, parseJsonBody, serverError, validationError } from "@/lib/api-contracts";

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("api error responses", () => {
  it("returns a stable error envelope", async () => {
    const response = apiError("Not found", 404, "NOT_FOUND");

    expect(response.status).toBe(404);
    await expect(json(response)).resolves.toEqual({ error: "Not found", code: "NOT_FOUND" });
  });

  it("includes validation details", async () => {
    const response = validationError(["name is required"]);

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toEqual({
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      details: ["name is required"],
    });
  });

  it("returns internal server errors with code", async () => {
    const response = serverError();

    expect(response.status).toBe(500);
    await expect(json(response)).resolves.toEqual({
      error: "Internal server error",
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});

describe("parseJsonBody", () => {
  it("parses valid request JSON", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    const result = await parseJsonBody(request as never);

    expect(result.response).toBeNull();
    expect(result.data).toEqual({ ok: true });
  });

  it("returns INVALID_JSON for malformed JSON", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      body: "{invalid",
    });

    const result = await parseJsonBody(request as never);

    expect(result.data).toBeNull();
    expect(result.response?.status).toBe(400);
    await expect(json(result.response as Response)).resolves.toEqual({
      error: "Malformed JSON body",
      code: "INVALID_JSON",
    });
  });
});
