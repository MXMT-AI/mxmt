"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { useLang } from "@/components/language-provider/language-provider";

const subscribe = () => () => {};
const themes = [
  { value: "system", icon: Monitor, label: "theme_system" },
  { value: "light", icon: Sun, label: "theme_light" },
  { value: "dark", icon: Moon, label: "theme_dark" },
] as const;

export function LandingThemeSwitch() {
  const { theme, forcedTheme, setTheme } = useTheme();
  const { t } = useLang();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const active = mounted ? (forcedTheme ?? theme ?? "system") : undefined;

  return (
    <div className="relative flex shrink-0 rounded-full border border-landing-line bg-landing-panel p-[3px] before:pointer-events-none before:absolute before:inset-y-[3px] before:left-[3px] before:w-[34px] before:rounded-full before:bg-landing-hover-surface before:opacity-0 before:transition-[transform,opacity] before:duration-[180ms] has-[button[aria-pressed=true]]:before:opacity-100 data-[theme-choice=light]:before:translate-x-full data-[theme-choice=dark]:before:translate-x-[200%] motion-reduce:before:transition-none max-[640px]:before:w-[30px]" role="group" aria-label={t.theme_label} data-theme-choice={active}>
      {themes.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          className="relative grid h-8 w-[34px] cursor-pointer place-items-center rounded-full text-landing-muted hover:text-landing-mint focus-visible:outline-landing-mint focus-visible:-outline-offset-2 disabled:cursor-default aria-pressed:text-landing-mint max-[640px]:w-[30px]"
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
