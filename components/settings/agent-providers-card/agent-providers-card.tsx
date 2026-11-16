"use client";

import { useState, useEffect } from "react";
import { DEFAULT_AGENT_PROVIDER, loadAgentProviders, saveAgentProviders, type AgentProvider } from "@/lib/client/agent-providers";
import { agentProviderGroups } from "./agent-provider-config";
import { AgentProviderRow } from "../agent-provider-row/agent-provider-row";

export default function AgentProvidersCard() {
  const [providers, setProviders] = useState<Record<string, AgentProvider>>({});

  useEffect(() => {
    setProviders(loadAgentProviders());
  }, []);

  function toggle(agentId: string, p: AgentProvider) {
    const next = { ...providers, [agentId]: p };
    setProviders(next);
    saveAgentProviders(next);
    window.dispatchEvent(new Event("mxmt_providers_changed"));
  }

  return (
    <div className="space-y-6">
      {agentProviderGroups.map(({ block, color, agents }) => {
        return (
          <div key={block}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-(--border)" />
              <span
                className="text-[9px] font-mono uppercase tracking-widest px-3 py-1 rounded-full border"
                style={{ color, borderColor: color + "40", background: color + "10" }}
              >
                {block}
              </span>
              <div className="h-px flex-1 bg-(--border)" />
            </div>

            <div className="space-y-2">
              {agents.map(agent => (
                <AgentProviderRow
                  key={agent.id}
                  agent={agent}
                  current={providers[agent.id] ?? DEFAULT_AGENT_PROVIDER}
                  onChange={toggle}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[11px] font-mono text-(--subtle) pt-2">
        OpenAI використовується за замовчуванням. Для роботи потрібен{" "}
        <span className="text-(--muted)">OPENAI_API_KEY</span> у змінних середовища хостингу.
      </p>
    </div>
  );
}
