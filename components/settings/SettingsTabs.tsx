"use client";

import { useState } from "react";
import AgentProvidersCard from "./AgentProvidersCard";

type Tab = "general" | "agents";

interface Props {
  lang: "uk" | "en";
  generalContent: React.ReactNode;
}

export default function SettingsTabs({ lang, generalContent }: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const uk = lang === "uk";

  const TABS = [
    { id: "general" as Tab, label: uk ? "Загальне" : "General" },
    { id: "agents" as Tab, label: uk ? "Агенти" : "Agents" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--border)] mb-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.id
                ? "text-[var(--text)]"
                : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-[#00e5c4]" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "general" && generalContent}

      {tab === "agents" && (
        <div>
          <div className="mb-6">
            <h2 className="text-[var(--text)] font-semibold mb-1">
              {uk ? "Провайдер для кожного агента" : "Provider per agent"}
            </h2>
            <p className="text-[var(--muted)] text-sm">
              {uk
                ? "Виберіть AI провайдера для кожного агента окремо"
                : "Choose AI provider for each agent individually"}
            </p>
          </div>
          <AgentProvidersCard />
        </div>
      )}
    </div>
  );
}
