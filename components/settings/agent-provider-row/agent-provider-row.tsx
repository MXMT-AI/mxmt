import type { AgentProvider } from "@/lib/client/agent-providers";
import type { AgentProviderConfig } from "../agent-providers-card/agent-provider-config";

export function AgentProviderRow({ agent, current, onChange }: {
  agent: AgentProviderConfig;
  current: AgentProvider;
  onChange: (agentId: string, provider: AgentProvider) => void;
}) {
  const Icon = agent.icon;
  return (
    <div
      className="bg-(--surface) border border-(--border) rounded-xl p-4 flex items-center gap-4"
      style={{ borderLeft: `3px solid ${agent.color}` }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: agent.color + "15" }}
      >
        <Icon aria-hidden="true" size={15} style={{ color: agent.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-(--text)">{agent.label}</div>
        <div className="text-[11px] text-(--muted) truncate">{agent.desc}</div>
        <div className="text-[10px] font-mono text-(--subtle) mt-0.5">
          {current === "anthropic" ? agent.defaultModel.anthropic : agent.defaultModel.openai}
        </div>
      </div>

      <div role="group" aria-label={agent.label} className="flex items-center gap-1 bg-(--row) border border-(--border) rounded-lg p-1 shrink-0">
        {(["anthropic", "openai"] as AgentProvider[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={current === p}
            onClick={() => onChange(agent.id, p)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-semibold transition-all ${
              current === p
                ? "bg-(--surface2) text-(--text) shadow-xs"
                : "text-(--subtle) hover:text-(--muted)"
            }`}
          >
            {p === "anthropic" ? "Anthropic" : "OpenAI"}
          </button>
        ))}
      </div>
    </div>
  );
}
