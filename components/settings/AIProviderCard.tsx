"use client";

import { useState, useEffect } from "react";
import { Zap } from "lucide-react";

type Provider = "anthropic" | "openai";

const PROVIDERS: { id: Provider; name: string; model: string; desc: string }[] = [
  {
    id: "anthropic",
    name: "Claude",
    model: "claude-sonnet-4-6",
    desc: "Anthropic · Доступний лише при ручному виборі",
  },
  {
    id: "openai",
    name: "OpenAI",
    model: "gpt-4o",
    desc: "OpenAI · Провайдер за замовчуванням для всіх агентів",
  },
];

export default function AIProviderCard({ lang }: { lang: "uk" | "en" }) {
  const uk = lang === "uk";
  const [active, setActive] = useState<Provider>("openai");

  useEffect(() => {
    const stored = document.cookie.match(/(?:^|;\s*)ai_provider=([^;]+)/);
    if (stored?.[1] === "anthropic" || stored?.[1] === "openai") setActive(stored[1]);
  }, []);

  function pick(p: Provider) {
    setActive(p);
    document.cookie = `ai_provider=${p};path=/;max-age=31536000;samesite=lax`;
  }

  return (
    <div className="bg-(--surface) border border-(--border) rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap size={14} className="text-accent-yellow" />
        <span className="text-xs font-mono text-(--subtle) uppercase tracking-widest">
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
                ? "border-accent-cyan/40 bg-accent-cyan/8"
                : "border-(--border) bg-(--row) hover:border-(--border-faint)"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-(--text)">{p.name}</span>
              {active === p.id && (
                <span className="text-[9px] font-mono bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30 px-1.5 py-0.5 rounded-sm">
                  {uk ? "АКТИВНО" : "ACTIVE"}
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono text-accent-cyan mb-1">{p.model}</div>
            <div className="text-[11px] text-(--muted) leading-snug">{p.desc}</div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-(--subtle) mt-3 font-mono">
        {uk
          ? "Вибір зберігається в браузері. API ключі налаштовуються у змінних середовища хостингу."
          : "Choice is saved in the browser. API keys are configured in hosting environment variables."}
      </p>
    </div>
  );
}
