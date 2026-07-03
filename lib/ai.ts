import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatOptions {
  systemPrompt?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  providerOverride?: string;
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
  const provider = providerOverride ?? process.env.AI_PROVIDER ?? "anthropic";

  if (provider === "openai") {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model: "gpt-4o",
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
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages,
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}

export function getProviderName(): string {
  return process.env.AI_PROVIDER === "openai" ? "OpenAI GPT-4o" : "Claude Sonnet 4.6";
}
