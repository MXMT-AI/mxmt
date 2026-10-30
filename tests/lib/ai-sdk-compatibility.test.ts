import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { chat, chatWithUsage } from "@/lib/ai";

// Exercise actual SDK serialization and response/error parsing; never dispatch to a provider.
const transport = vi.fn<typeof fetch>();
const messages = [{ role: "user" as const, content: "Synthetic compatibility prompt" }];
const completion = () => ({
  id: "synthetic-completion", object: "chat.completion", created: 1793221200, model: "gpt-4o",
  choices: [{ index: 0, message: { role: "assistant", content: "Synthetic answer", refusal: null }, finish_reason: "stop", logprobs: null }],
  usage: { prompt_tokens: 150, completion_tokens: 20, total_tokens: 170, prompt_tokens_details: { cached_tokens: 50, audio_tokens: 0 } },
} satisfies OpenAI.Chat.Completions.ChatCompletion);
const message = () => ({
  id: "synthetic-message", type: "message", role: "assistant", model: "claude-sonnet-4-6",
  container: null, diagnostics: null, stop_details: null,
  content: [{ type: "text", text: "Synthetic answer", citations: null }],
  stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 10, cache_read_input_tokens: 50,
    cache_creation: null, inference_geo: null, output_tokens_details: null, server_tool_use: null, service_tier: null, speed: null },
} satisfies Anthropic.Message);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "request-id": "synthetic-http-request", "x-request-id": "synthetic-http-request", "retry-after-ms": "1" },
});
function request() {
  const [url, init] = transport.mock.calls[0];
  return { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "synthetic-openai-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-anthropic-key");
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "");
  vi.stubEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");
  vi.stubEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.com");
  vi.stubEnv("AI_TIMEOUT_MS", "45000");
  transport.mockReset();
  vi.stubGlobal("fetch", transport);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("real SDK compatibility with intercepted HTTP", () => {
  it("preserves OpenAI Chat Completions, explicit model/output cap and disjoint usage", async () => {
    transport.mockResolvedValueOnce(json(completion()));
    const result = await chatWithUsage({ provider: "openai", model: "gpt-4o", messages, systemPrompt: "Synthetic system", maxTokens: 100 });
    expect(result).toMatchObject({ text: "Synthetic answer", requestId: "synthetic-completion", model: "gpt-4o", complete: true,
      usage: { input: 100, output: 20, cacheRead: 50, cacheWrite: 0 } });
    expect(transport).toHaveBeenCalledTimes(1);
    const sent = request();
    expect(sent.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(sent.body).toEqual({ model: "gpt-4o", max_tokens: 100, messages: [{ role: "system", content: "Synthetic system" }, ...messages] });
    expect(sent.headers.get("authorization")).toBe("Bearer synthetic-openai-key");
    expect(transport.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves Anthropic text/system mapping and cache categories with its new API version", async () => {
    transport.mockResolvedValueOnce(json(message()));
    const result = await chatWithUsage({ provider: "anthropic", model: "claude-sonnet-4-6", messages: [{ role: "system", content: "Extra system" }, ...messages], systemPrompt: "Synthetic system", maxTokens: 100 });
    expect(result).toMatchObject({ text: "Synthetic answer", requestId: "synthetic-message", complete: true,
      usage: { input: 100, output: 20, cacheRead: 50, cacheWrite: 10 } });
    const sent = request();
    expect(sent.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent.body).toEqual({ model: "claude-sonnet-4-6", max_tokens: 100, system: "Synthetic system\n\nExtra system", messages });
    expect(sent.headers.get("anthropic-version")).toBe("2026-10-21");
    expect(sent.headers.get("authorization")).toBe("Bearer synthetic-anthropic-key");
  });

  it.each(["openai", "anthropic"] as const)("does not secretly retry a metered %s attempt", async provider => {
    transport.mockImplementation(async () => json({ error: { type: "rate_limit_error", message: "Synthetic throttle" } }, 429));
    const errorClass = provider === "openai" ? OpenAI.RateLimitError : Anthropic.RateLimitError;
    await expect(chatWithUsage({ provider, model: "synthetic-approved-model", messages })).rejects.toBeInstanceOf(errorClass);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(request().headers.get("x-stainless-retry-count")).toBe("0");
  });

  it.each(["openai", "anthropic"] as const)("retains one legacy %s retry", async provider => {
    transport.mockResolvedValueOnce(json({ error: { type: "overloaded_error", message: "Synthetic temporary failure" } }, 503))
      .mockResolvedValueOnce(json(provider === "openai" ? completion() : message()));
    expect(await chat({ providerOverride: provider, messages })).toBe("Synthetic answer");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(new Headers(transport.mock.calls[1][1]?.headers).get("x-stainless-retry-count")).toBe("1");
  });

  it("does not fabricate usage when the OpenAI response omits it", async () => {
    const { usage: _usage, ...withoutUsage } = completion();
    transport.mockResolvedValueOnce(json(withoutUsage));
    expect((await chatWithUsage({ provider: "openai", model: "gpt-4o", messages })).usage).toBeUndefined();
  });

  it("keeps null Anthropic cache categories at zero and reports truncation", async () => {
    const response = message();
    transport.mockResolvedValueOnce(json({ ...response, stop_reason: "max_tokens", usage: { ...response.usage, cache_creation_input_tokens: null, cache_read_input_tokens: null } }));
    expect(await chatWithUsage({ provider: "anthropic", model: "claude-sonnet-4-6", messages }))
      .toMatchObject({ complete: false, usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 } });
  });
});
