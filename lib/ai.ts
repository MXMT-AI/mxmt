import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type AiProvider = "anthropic" | "openai";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

type AnthropicChatMessage = Extract<ChatMessage, { role: "user" | "assistant" }>;

interface ChatOptions {
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  providerOverride?: string;
}

const DEFAULT_PROVIDER: AiProvider = "anthropic";
const PROVIDERS = new Set<AiProvider>(["anthropic", "openai"]);
const MODEL_BY_PROVIDER: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
};
const DEFAULT_AI_TIMEOUT_MS = 45_000;
const MIN_AI_TIMEOUT_MS = 5_000;
const MAX_AI_TIMEOUT_MS = 55_000;

export class AiConfigurationError extends Error {
  code = "AI_CONFIGURATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export function resolveAiProvider(providerOverride?: string): AiProvider {
  const rawProvider = (providerOverride ?? process.env.AI_PROVIDER ?? DEFAULT_PROVIDER).toLowerCase();
  if (PROVIDERS.has(rawProvider as AiProvider)) {
    return rawProvider as AiProvider;
  }

  return DEFAULT_PROVIDER;
}

export function getAiModel(provider: AiProvider): string {
  return MODEL_BY_PROVIDER[provider];
}

export function resolveAiTimeoutMs(): number {
  const configured = Number.parseInt(process.env.AI_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(configured)) return DEFAULT_AI_TIMEOUT_MS;
  return Math.min(MAX_AI_TIMEOUT_MS, Math.max(MIN_AI_TIMEOUT_MS, configured));
}

function requireApiKey(provider: AiProvider): string {
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new AiConfigurationError(`${provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} is required`);
  }

  return key;
}

/**
 * Unified AI chat function.
 * Switch provider via env var: AI_PROVIDER=anthropic (default) | openai
 * API keys are read server-side only — never exposed to the client.
 */
export async function chat({
  systemPrompt,
  messages,
  maxTokens = 2000,
  providerOverride,
}: ChatOptions): Promise<string> {
  const provider = resolveAiProvider(providerOverride);
  const model = getAiModel(provider);
  const timeout = resolveAiTimeoutMs();

  if (provider === "openai") {
    const client = new OpenAI({ apiKey: requireApiKey(provider), timeout, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        ...(systemPrompt
          ? [{ role: "system" as const, content: systemPrompt }]
          : []),
        ...messages,
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  // Default: Anthropic Claude
  const client = new Anthropic({ apiKey: requireApiKey(provider), timeout, maxRetries: 1 });
  const anthropicMessages = messages.filter(
    (message): message is AnthropicChatMessage => message.role !== "system"
  );
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...(systemPrompt || systemMessages.length > 0
      ? { system: [systemPrompt, ...systemMessages].filter(Boolean).join("\n\n") }
      : {}),
    messages: anthropicMessages,
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}

export function getProviderName(): string {
  const provider = resolveAiProvider();
  return provider === "openai" ? "OpenAI GPT-4o" : "Claude Sonnet 4.6";
}
