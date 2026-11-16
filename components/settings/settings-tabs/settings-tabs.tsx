"use client";

import { Button } from "@/components/ui/button/button";
import { SectionHeader } from "@/components/ui/section-header/section-header";
import { useEffect, useState } from "react";
import MerchandisingSettingsCard from "../merchandising-settings-card/merchandising-settings-card";
import AgentProvidersCard from "../agent-providers-card/agent-providers-card";

const tabs = [
  { id: "general", uk: "Загальне", en: "General" },
  { id: "merchandising", uk: "Мерчандайзинг", en: "Merchandising" },
  { id: "agents", uk: "Агенти", en: "Agents" },
] as const;
type Tab = typeof tabs[number]["id"];

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
      setTab(tabs.find(tab => tab.id === value)?.id ?? "general");
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

  return (
    <div>
      <nav aria-label={uk ? "Розділи налаштувань" : "Settings sections"} className="flex flex-wrap items-center gap-1 border-b border-(--border) mb-8">
        {tabs.map((t) => (
          <Button variant="report"
            key={t.id}
            aria-pressed={tab === t.id}
            onClick={() => changeTab(t.id)}
            className={`relative min-h-0 rounded-none border-0 px-4 py-2.5 font-medium hover:bg-transparent ${
              tab === t.id
                ? "text-(--text)"
                : "text-(--muted) hover:text-(--text)"
            }`}
          >
            {t[lang]}
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-accent-cyan" />
            )}
          </Button>
        ))}
      </nav>

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
          <SectionHeader
            className="mb-6 [&_h2]:mb-1"
            title={uk ? "Провайдер для кожного агента" : "Provider per agent"}
            description={uk ? "Виберіть AI провайдера для кожного агента окремо" : "Choose AI provider for each agent individually"}
          />
          <AgentProvidersCard />
        </div>
      )}
    </div>
  );
}
