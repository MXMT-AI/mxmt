import { afterEach, describe, expect, it } from "vitest";
import { AiConfigurationError, getAiModel, resolveAiProvider } from "@/lib/ai";

const originalProvider = process.env.AI_PROVIDER;

afterEach(() => {
  process.env.AI_PROVIDER = originalProvider;
});

describe("resolveAiProvider", () => {
  it("uses a valid override", () => {
    expect(resolveAiProvider("openai")).toBe("openai");
  });

  it("falls back to anthropic for invalid values", () => {
    process.env.AI_PROVIDER = "invalid";

    expect(resolveAiProvider()).toBe("anthropic");
  });

  it("maps providers to expected model ids", () => {
    expect(getAiModel("anthropic")).toBe("claude-sonnet-4-6");
    expect(getAiModel("openai")).toBe("gpt-4o");
  });
});

describe("AiConfigurationError", () => {
  it("exposes a stable error code", () => {
    const error = new AiConfigurationError("missing key");

    expect(error.code).toBe("AI_CONFIGURATION_ERROR");
    expect(error.message).toBe("missing key");
  });
});
