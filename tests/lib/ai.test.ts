import { afterEach, describe, expect, it } from "vitest";
import { AiConfigurationError, getAiModel, resolveAiProvider, resolveAiTimeoutMs } from "@/lib/ai";

const originalProvider = process.env.AI_PROVIDER;
const originalTimeout = process.env.AI_TIMEOUT_MS;

afterEach(() => {
  if (originalProvider === undefined) {
    delete process.env.AI_PROVIDER;
  } else {
    process.env.AI_PROVIDER = originalProvider;
  }

  if (originalTimeout === undefined) {
    delete process.env.AI_TIMEOUT_MS;
  } else {
    process.env.AI_TIMEOUT_MS = originalTimeout;
  }
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

describe("resolveAiTimeoutMs", () => {
  it("uses a serverless-safe default", () => {
    delete process.env.AI_TIMEOUT_MS;
    expect(resolveAiTimeoutMs()).toBe(45_000);
  });

  it("clamps configured values to safe bounds", () => {
    process.env.AI_TIMEOUT_MS = "1000";
    expect(resolveAiTimeoutMs()).toBe(5_000);

    process.env.AI_TIMEOUT_MS = "90000";
    expect(resolveAiTimeoutMs()).toBe(55_000);
  });
});

describe("AiConfigurationError", () => {
  it("exposes a stable error code", () => {
    const error = new AiConfigurationError("missing key");

    expect(error.code).toBe("AI_CONFIGURATION_ERROR");
    expect(error.message).toBe("missing key");
  });
});
