"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge/badge";
import { Note } from "@/components/ui/note/note";
import { panel } from "@/components/ui/panel/panel-styles";
import { DEFAULT_AGENT_PROVIDER, type AgentProvider } from "@/lib/client/agent-providers";
import type { Lang } from "@/lib/translations";
import { aiProviderCopy } from "./copy";

const PROVIDERS: { id: AgentProvider; name: string; model: string }[] = [
  {
    id: "anthropic",
    name: "Claude",
    model: "claude-sonnet-4-6",
  },
  {
    id: "openai",
    name: "OpenAI",
    model: "gpt-4o",
  },
];

export default function AIProviderCard({ lang }: { lang: Lang }) {
  const copy = aiProviderCopy[lang];
  const [active, setActive] = useState<AgentProvider>(DEFAULT_AGENT_PROVIDER);

  useEffect(() => {
    const stored = document.cookie.match(/(?:^|;\s*)ai_provider=([^;]+)/);
    if (stored?.[1] === "anthropic" || stored?.[1] === "openai") setActive(stored[1]);
  }, []);

  function pick(p: AgentProvider) {
    setActive(p);
    document.cookie = `ai_provider=${p};path=/;max-age=31536000;samesite=lax`;
  }

  return (
    <div className={panel + " p-5"}>
      <div className="flex items-center gap-2 mb-4">
        <Zap aria-hidden="true" size={14} className="text-accent-yellow" />
        <span className="text-xs font-mono text-(--subtle) uppercase tracking-widest">
          {copy.title}
        </span>
      </div>

      <div role="group" aria-label={copy.title} className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={active === p.id}
            onClick={() => pick(p.id)}
            className={`text-left p-4 rounded-xl border transition-all ${
              active === p.id
                ? "border-accent-cyan/40 bg-accent-cyan/8"
                : "border-(--border) bg-(--row) hover:border-(--border-faint)"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-(--text)">{p.name}</span>
              {active === p.id && (
                <Badge tone="positive" size="small" className="bg-accent-cyan/15 border-accent-cyan/30">
                  {copy.active}
                </Badge>
              )}
            </div>
            <div className="text-[11px] font-mono text-accent-cyan mb-1">{p.model}</div>
            <div className="text-[11px] text-(--muted) leading-snug">{copy.descriptions[p.id]}</div>
          </button>
        ))}
      </div>

      <Note className="text-[11px] leading-normal text-(--subtle) mt-3 font-mono">{copy.note}</Note>
    </div>
  );
}
