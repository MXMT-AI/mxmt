export type AgentProvider = "anthropic" | "openai";
export const DEFAULT_AGENT_PROVIDER: AgentProvider = "openai";
const LS_KEY = "mxmt_agent_providers";

export function loadAgentProviders(): Record<string, AgentProvider> {
  if (typeof window === "undefined") return {};
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, AgentProvider] =>
      entry[1] === "anthropic" || entry[1] === "openai",
    ));
  } catch {
    return {};
  }
}

export function getAgentProvider(agentId: string): AgentProvider {
  const providers = loadAgentProviders();
  return Object.hasOwn(providers, agentId) ? providers[agentId] : DEFAULT_AGENT_PROVIDER;
}

export function saveAgentProviders(providers: Record<string, AgentProvider>) {
  localStorage.setItem(LS_KEY, JSON.stringify(providers));
}
