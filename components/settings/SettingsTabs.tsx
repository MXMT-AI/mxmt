"use client";

import { useEffect, useState } from "react";
import MerchandisingSettingsCard from "./MerchandisingSettingsCard";
import AgentProvidersCard from "./AgentProvidersCard";

type Tab = "general" | "merchandising" | "agents";

interface Props {
  lang: "uk" | "en";
  generalContent: React.ReactNode;
  canManage?: boolean;
}

export default function SettingsTabs({
  lang,
  generalContent,
  canManage = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("general");
  const uk = lang === "uk";
  const [merchDirty, setMerchDirty] = useState(false);
  useEffect(() => {
    const read = () => {
      const value = new URLSearchParams(location.search).get("tab");
      if (
        value === "general" ||
        value === "agents" ||
        value === "merchandising"
      )
        setTab(value);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const changeTab = (next: Tab) => {
    if (next === tab) return;
    if (
      merchDirty &&
      !window.confirm(
        uk ? "Відкинути незбережені зміни?" : "Discard unsaved changes?",
      )
    )
      return;
    setMerchDirty(false);
    setTab(next);
    const url = new URL(location.href);
    url.searchParams.set("tab", next);
    history.replaceState(null, "", url);
  };

  const TABS = [
    { id: "general" as Tab, label: uk ? "Загальне" : "General" },
    {
      id: "merchandising" as Tab,
      label: uk ? "Мерчандайзинг" : "Merchandising",
    },
    { id: "agents" as Tab, label: uk ? "Агенти" : "Agents" },
  ];

  return (
    <div>
      {/* Tab bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border)] mb-8">
        {TABS.map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            onClick={() => changeTab(t.id)}
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

      {tab === "merchandising" && (
        <MerchandisingSettingsCard
          lang={lang}
          canManage={canManage}
          onDirtyChange={setMerchDirty}
        />
      )}

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
