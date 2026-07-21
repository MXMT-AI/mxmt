"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

type Provider = "anthropic" | "openai";

const PROVIDERS: { id: Provider; name: string; model: string; desc: string }[] = [
  {
    id: "anthropic",
    name: "Claude",
    model: "claude-sonnet-4-6",
    desc: "Anthropic · Найкраще для аналітики та структурованих відповідей",
  },
  {
    id: "openai",
    name: "OpenAI",
    model: "gpt-4o",
    desc: "OpenAI · Альтернативна модель для порівняння",
  },
];

export default function AIProviderCard({ lang }: { lang: "uk" | "en" }) {
  const uk = lang === "uk";
  const [active, setActive] = useState<Provider>("anthropic");

  useEffect(() => {
    const stored = document.cookie.match(/(?:^|;\s*)ai_provider=([^;]+)/);
    if (stored?.[1] === "openai") setActive("openai");
  }, []);

  function pick(p: Provider) {
    setActive(p);
    document.cookie = `ai_provider=${p};path=/;max-age=31536000;samesite=lax`;
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap size={14} className="text-[#fbbf24]" />
        <span className="text-xs font-mono text-[var(--subtle)] uppercase tracking-widest">
          {uk ? "Активна модель" : "Active model"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => pick(p.id)}
            className={`text-left p-4 rounded-xl border transition-all ${
              active === p.id
                ? "border-[#00e5c4]/40 bg-[#00e5c4]/8"
                : "border-[var(--border)] bg-[var(--row)] hover:border-[var(--border-faint)]"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-[var(--text)]">{p.name}</span>
              {active === p.id && (
                <span className="text-[9px] font-mono bg-[#00e5c4]/15 text-[#00e5c4] border border-[#00e5c4]/30 px-1.5 py-0.5 rounded">
                  {uk ? "АКТИВНО" : "ACTIVE"}
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono text-[#00e5c4] mb-1">{p.model}</div>
            <div className="text-[11px] text-[var(--muted)] leading-snug">{p.desc}</div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-[var(--subtle)] mt-3 font-mono">
        {uk
          ? "Вибір зберігається в браузері. API ключі налаштовуються у змінних середовища хостингу."
          : "Choice is saved in the browser. API keys are configured in hosting environment variables."}
      </p>
    </div>
  );
}
