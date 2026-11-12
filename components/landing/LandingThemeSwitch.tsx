"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { useLang } from "@/components/LanguageProvider";

const subscribe = () => () => {};
const themes = [
  { value: "system", icon: Monitor, label: "theme_system" },
  { value: "light", icon: Sun, label: "theme_light" },
  { value: "dark", icon: Moon, label: "theme_dark" },
] as const;

export function LandingThemeSwitch({ className }: { className: string }) {
  const { theme, forcedTheme, setTheme } = useTheme();
  const { t } = useLang();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const active = mounted ? (forcedTheme ?? theme ?? "system") : undefined;

  return (
    <div className={className} role="group" aria-label={t.theme_label} data-theme-choice={active}>
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          aria-label={t[label]}
          aria-pressed={active === value}
          title={t[label]}
          disabled={!mounted || Boolean(forcedTheme)}
          onClick={() => setTheme(value)}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
